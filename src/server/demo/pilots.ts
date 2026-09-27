// Carga de los 3 pilotos de ejemplo. Se hace con el cliente de servidor (secret
// key) porque los ejemplos nacen ya aprobados, en prueba o decididos (sin pasar
// por el flujo) y con fechas del pasado. El borrado va por la RPC
// delete_example_pilots, con la sesión del aprobador.
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIso } from "@/domain/dates";
import { buildExamplePilots } from "@/domain/pilots/examples";
import { computePower } from "@/domain/pilots/power";
import type { PilotMetricCalc } from "@/domain/pilots/types";
import type { IsoDate } from "@/domain/types";

function check(result: { error: { message: string } | null }, what: string) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
}

export async function countExamplePilots(admin: SupabaseClient): Promise<number> {
  const { count } = await admin.from("pilots").select("id", { count: "exact", head: true }).eq("is_example", true);
  return count ?? 0;
}

export async function loadExamplePilots(admin: SupabaseClient, userId: string, today: IsoDate = todayIso()): Promise<number> {
  if ((await countExamplePilots(admin)) > 0) throw new Error("Los pilotos de ejemplo ya están cargados.");
  const plan = buildExamplePilots(today);

  const [{ data: metrics }, { data: variables }, { data: media }] = await Promise.all([
    admin.from("pilot_metrics").select("id, name, calc"),
    admin.from("pilot_variables").select("id, name"),
    admin.from("media_channels").select("id, name").is("archived_at", null),
  ]);
  const metricId = new Map((metrics ?? []).map((m) => [m.name as string, m.id as string]));
  const metricCalc = new Map((metrics ?? []).map((m) => [m.name as string, m.calc as PilotMetricCalc]));
  const variableId = new Map((variables ?? []).map((v) => [v.name as string, v.id as string]));
  const mediaId = new Map((media ?? []).map((m) => [m.name as string, m.id as string]));
  const need = <T,>(map: Map<string, T>, key: string, what: string): T => {
    const v = map.get(key);
    if (v === undefined) throw new Error(`Falta en el catálogo ${what}: «${key}». ¿Se editó el catálogo inicial?`);
    return v;
  };

  const created: string[] = [];
  try {
    for (const p of plan) {
      const locked = p.status !== "draft" && p.status !== "in_review";
      const at = (d: IsoDate | null) => (d ? `${d}T14:00:00Z` : null);
      const power_result = computePower(need(metricCalc, p.primary_metric, "la métrica"), p.power_inputs, p.hypothesis_expected_pct, p.arms.length, p.planned_budget_cop);
      const { data: row, error } = await admin
        .from("pilots")
        .insert({
          title: p.title,
          problem: p.problem,
          problem_evidence: p.problem_evidence,
          hypothesis_change: p.hypothesis_change,
          hypothesis_scope: p.hypothesis_scope,
          hypothesis_metric: p.hypothesis_metric,
          hypothesis_expected_pct: p.hypothesis_expected_pct,
          hypothesis_reason: p.hypothesis_reason,
          variable_id: need(variableId, p.variable, "la variable"),
          test_type: p.test_type,
          design_config: p.design_config,
          primary_metric_id: need(metricId, p.primary_metric, "la métrica"),
          power_inputs: p.power_inputs,
          power_result,
          decision_rules: p.decision_rules,
          planned_start: p.planned_start,
          planned_end: p.planned_end,
          actual_start: p.actual_start,
          actual_end: p.actual_end,
          planned_budget_cop: p.planned_budget_cop,
          owner_id: userId,
          created_by: userId,
          status: p.status,
          submitted_at: at(p.planned_start),
          design_locked_at: locked ? at(p.planned_start) : null,
          approved_by: locked ? userId : null,
          approved_at: locked ? at(p.planned_start) : null,
          verdict: p.decision?.verdict ?? null,
          decision: p.decision?.decision ?? null,
          decision_justification: p.decision?.justification ?? null,
          decided_by: p.decision ? userId : null,
          decided_at: p.decision ? at(p.actual_end) : null,
          is_example: true,
        })
        .select("id")
        .single();
      if (error || !row) throw new Error(`Piloto «${p.title}»: ${error?.message ?? "sin datos"}`);
      const pilotId = row.id as string;
      created.push(pilotId);

      const { data: arms, error: armsError } = await admin
        .from("pilot_arms")
        .insert(p.arms.map((a, i) => ({ pilot_id: pilotId, name: a.name, is_control: a.is_control, split_pct: a.split_pct, cities: a.cities, sort_order: i })))
        .select("id, name");
      if (armsError || !arms) throw new Error(`Grupos: ${armsError?.message}`);
      const armId = new Map(p.arms.map((a) => [a.key, arms.find((x) => x.name === a.name)!.id as string]));

      check(
        await admin.from("pilot_media").insert(
          p.media.map((m, i) => ({
            pilot_id: pilotId,
            media_id: need(mediaId, m.media, "el medio"),
            account: m.account,
            campaign: m.campaign,
            audience: m.audience,
            destination: m.destination,
            cities: m.cities,
            sort_order: i,
          })),
        ),
        "Medios",
      );
      check(
        await admin
          .from("pilot_guardrails")
          .insert(p.guardrails.map((g) => ({ pilot_id: pilotId, metric_id: need(metricId, g.metric, "la métrica"), limit_pct: g.limit_pct }))),
        "Guardrails",
      );
      check(
        await admin.from("pilot_checklist_items").insert(
          p.checklist.map((c, i) => ({
            pilot_id: pilotId,
            platform: c.platform,
            event_name: c.event_name,
            status: "ok",
            evidence: c.evidence,
            checked_by: userId,
            checked_at: at(p.planned_start),
            sort_order: i,
          })),
        ),
        "Lista de chequeo",
      );
      const granularity = p.design_config.granularity;
      for (let i = 0; i < p.values.length; i += 500) {
        check(
          await admin.from("pilot_measurements").insert(
            p.values.slice(i, i + 500).map((v) => ({
              pilot_id: pilotId,
              arm_id: armId.get(v.arm)!,
              metric_id: need(metricId, v.metric, "la métrica"),
              unit_label: v.unit_label,
              period_start: v.period_start,
              granularity,
              value: v.value,
              source: "manual",
              created_by: userId,
              updated_by: userId,
            })),
          ),
          "Datos",
        );
      }
      if (p.incidents.length) {
        check(
          await admin.from("pilot_incidents").insert(p.incidents.map((x) => ({ ...x, pilot_id: pilotId, created_by: userId }))),
          "Incidentes",
        );
      }
      const timeline: { action: string; date: IsoDate | null; comment?: string }[] = [
        { action: "submitted", date: p.planned_start },
        { action: "approved", date: p.planned_start, comment: "Diseño claro y medición verificada. ¡Hágale pues!" },
        { action: "started", date: p.actual_start },
      ];
      if (p.status === "in_reading" || p.status === "decided") timeline.push({ action: "to_reading", date: p.actual_end });
      if (p.decision) timeline.push({ action: "decided", date: p.actual_end, comment: p.decision.justification });
      check(
        await admin.from("pilot_reviews").insert(
          timeline.filter((t) => t.date).map((t) => ({ pilot_id: pilotId, action: t.action, comment: t.comment ?? null, actor_id: userId, created_at: at(t.date) })),
        ),
        "Línea de tiempo",
      );
      if (p.decision) {
        check(await admin.from("pilot_learnings").insert({ pilot_id: pilotId, text: p.decision.learning, created_by: userId }), "Aprendizaje");
      }
    }
  } catch (e) {
    if (created.length) await admin.from("pilots").delete().in("id", created);
    throw e;
  }
  // Los ejemplos no llenan la auditoría: son datos de muestra, no cambios de nadie.
  if (created.length) await admin.from("pilot_audit").delete().in("pilot_id", created);
  return created.length;
}
