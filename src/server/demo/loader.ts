// Carga y borrado del programa de ejemplo.
//  · Todo el contenido se crea con el cliente del ADMIN (su sesión): pasa por
//    RLS, triggers y las mismas RPC de transición que usa la app.
//  · La secret key solo se usa para crear/borrar los usuarios ficticios, fijar
//    las marcas de tiempo históricas y borrar definitivamente (sin papelera).
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayIso } from "@/domain/dates";
import type { IsoDate } from "@/domain/types";
import {
  buildDemoPlan,
  DEMO_EMAIL_DOMAIN,
  DEMO_EXPERIMENTS,
  DEMO_LINES,
  DEMO_METRICS,
  DEMO_PROBLEMS,
  DEMO_STAGE_METRICS,
  DEMO_USERS,
  type LineKey,
  type MetricKey,
  type ProblemKey,
} from "./data";

type Client = SupabaseClient;

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data == null) throw new Error(`${what}: sin datos`);
  return result.data;
}

function check(result: { error: { message: string } | null }, what: string) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
}

export async function findDemoProgramId(admin: Client): Promise<string | null> {
  const { data } = await admin.from("programs").select("id").eq("is_demo", true).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * Crea el programa de ejemplo. `user` es el cliente con la sesión del admin
 * (RLS activa) y `admin` el cliente con secret key. Las fechas se calculan a
 * partir de `today` (por defecto, hoy en Bogotá).
 */
export async function loadDemoProgram(
  user: Client,
  admin: Client,
  adminUserId: string,
  today: IsoDate = todayIso(),
): Promise<string> {
  if (await findDemoProgramId(admin)) throw new Error("El programa de ejemplo ya existe.");
  const plan = buildDemoPlan(today);
  const DEMO_PROGRAM = plan.program;

  const suffix = Math.random().toString(36).slice(2, 8);
  const createdUserIds: string[] = [];
  let programId: string | null = null;

  try {
    // 1. Usuarios ficticios (sin contraseña utilizable, sin correo enviado).
    const userIds: Record<"internal" | "agency", string> = { internal: "", agency: "" };
    for (const u of DEMO_USERS) {
      const created = await admin.auth.admin.createUser({
        email: `${u.localPart}+${suffix}@${DEMO_EMAIL_DOMAIN}`,
        email_confirm: true,
        password: crypto.randomUUID() + crypto.randomUUID(),
        user_metadata: { name: u.name },
        app_metadata: { demo: true },
      });
      if (created.error || !created.data.user) throw new Error(`Usuario demo: ${created.error?.message}`);
      createdUserIds.push(created.data.user.id);
      userIds[u.key as "internal" | "agency"] = created.data.user.id;
    }

    // 2. Programa (el admin queda como owner por trigger).
    const program = must(
      await user
        .from("programs")
        .insert({
          name: DEMO_PROGRAM.name,
          description: DEMO_PROGRAM.description,
          is_demo: true,
          start_date: DEMO_PROGRAM.start_date,
          end_date: DEMO_PROGRAM.end_date,
          setup_step: 5,
          setup_completed_at: new Date().toISOString(),
        })
        .select("id")
        .single(),
      "Programa",
    ) as { id: string };
    programId = program.id;

    const horizons = must(
      await user
        .from("program_horizons")
        .insert(DEMO_PROGRAM.horizons.map((h, i) => ({ ...h, program_id: programId, sort_order: i })))
        .select("id, name"),
      "Horizontes",
    ) as { id: string; name: string }[];
    const h1 = horizons.find((h) => h.name === "H1")!.id;

    check(
      await user.from("program_members").insert(
        DEMO_USERS.map((u) => ({ program_id: programId, user_id: userIds[u.key as "internal" | "agency"], role: u.role })),
      ),
      "Miembros",
    );

    check(await user.from("calendar_events").insert(plan.calendar.map((e) => ({ ...e, program_id: programId }))), "Calendario");

    // 3. Líneas (las cuatro etapas por defecto las crea un trigger).
    const lines = must(
      await user
        .from("business_lines")
        .insert(DEMO_LINES.map((l, i) => ({ program_id: programId, name: l.name, sort_order: i })))
        .select("id, name"),
      "Líneas",
    ) as { id: string; name: string }[];
    const lineId = (k: LineKey) => lines.find((l) => l.name === DEMO_LINES.find((d) => d.key === k)!.name)!.id;

    const stages = must(
      await user.from("funnel_stages").select("id, line_id, name").eq("program_id", programId),
      "Etapas",
    ) as { id: string; line_id: string; name: string }[];
    const stageId = (line: LineKey, name: string) => stages.find((s) => s.line_id === lineId(line) && s.name === name)!.id;

    // 4. Métricas (primero las raíces para poder enlazar el árbol).
    const metricIds = new Map<MetricKey, string>();
    const ordered = [...DEMO_METRICS].sort((a, b) => Number(!!a.parent) - Number(!!b.parent));
    for (const [i, m] of ordered.entries()) {
      const row = must(
        await user
          .from("metrics")
          .insert({
            line_id: lineId(m.line),
            parent_id: m.parent ? metricIds.get(m.parent) : null,
            type: m.type,
            branch: m.branch,
            name: m.name,
            definition: m.definition,
            channel: m.channel,
            unit: m.unit,
            direction: m.direction,
            source: m.source,
            baseline: m.baseline,
            owner_id: adminUserId,
            sort_order: i,
          })
          .select("id")
          .single(),
        `Métrica ${m.name}`,
      ) as { id: string };
      metricIds.set(m.key, row.id);
    }

    check(
      await user
        .from("metric_targets")
        .insert(DEMO_METRICS.map((m) => ({ metric_id: metricIds.get(m.key), horizon_id: h1, target: m.targetH1 }))),
      "Objetivos",
    );

    check(
      await user.from("metric_values").insert(
        DEMO_METRICS.flatMap((m) =>
          m.weekly.map((value, i) => ({ metric_id: metricIds.get(m.key), week_start: addDays(plan.weeksFrom, i * 7), value })),
        ),
      ),
      "Valores semanales",
    );

    for (const link of DEMO_STAGE_METRICS) {
      check(
        await user.from("funnel_stages").update({ metric_id: metricIds.get(link.metric) }).eq("id", stageId(link.line, link.stage)),
        "Vínculo etapa-métrica",
      );
    }

    // 5. Problemas.
    const problemIds = new Map<ProblemKey, string>();
    for (const p of DEMO_PROBLEMS) {
      const row = must(
        await user
          .from("problems")
          .insert({
            line_id: lineId(p.line),
            stage_id: stageId(p.line, p.stage),
            channel: p.channel,
            title: p.title,
            evidence: p.evidence,
            root_cause: p.root_cause,
            impact: p.impact,
            control: p.control,
            status: "validated",
          })
          .select("id")
          .single(),
        `Problema ${p.key}`,
      ) as { id: string };
      problemIds.set(p.key, row.id);
    }

    // 6. Ejercicios: se crean en Idea y avanzan con las transiciones reales.
    const rpc = async (fn: string, args: Record<string, unknown>) => check(await user.rpc(fn, args), fn);
    for (const e of DEMO_EXPERIMENTS) {
      const dates = plan.experimentDates[e.key];
      const exp = must(
        await user
          .from("experiments")
          .insert({
            line_id: lineId(DEMO_PROBLEMS.find((p) => p.key === e.problem)!.line),
            problem_id: problemIds.get(e.problem),
            metric_id: metricIds.get(e.metric),
            title: e.title,
            hypothesis_if: e.hypothesis_if,
            hypothesis_then: e.hypothesis_then,
            hypothesis_because: e.hypothesis_because,
            impact: e.impact,
            confidence: e.confidence,
            ease: e.ease,
            fits_calendar: e.fits_calendar,
            control: e.control,
            owner_id: userIds[e.owner],
            owner_type: e.owner_type,
            test_type: e.test_type,
            primary_metric: e.primary_metric,
            control_metrics: e.control_metrics,
            min_duration_days: e.min_duration_days,
            decision_rule: e.decision_rule,
            planned_start: dates.planned_start,
            planned_end: dates.planned_end,
            actual_start: dates.actual_start,
            actual_end: dates.actual_end,
          })
          .select("id")
          .single(),
        `Ejercicio ${e.key}`,
      ) as { id: string };

      const variants = must(
        await user
          .from("experiment_variants")
          .insert(
            e.variants.map((v, i) => ({
              experiment_id: exp.id,
              name: v.name,
              is_control: v.is_control,
              description: v.description,
              sort_order: i,
            })),
          )
          .select("id, name"),
        "Variantes",
      ) as { id: string; name: string }[];

      await rpc("transition_experiment", { p_experiment: exp.id, p_to: "prioritized" });
      await rpc("transition_experiment", { p_experiment: exp.id, p_to: "in_design" });
      await rpc("transition_experiment", { p_experiment: exp.id, p_to: "in_test" });

      if (e.target !== "in_test") {
        // Resultados: se pueden cargar con el diseño bloqueado.
        for (const v of e.variants) {
          const id = variants.find((x) => x.name === v.name)!.id;
          check(
            await user.from("experiment_variants").update({ sample: v.sample, conversions: v.conversions, notes: v.notes }).eq("id", id),
            "Resultados",
          );
        }
        await rpc("transition_experiment", { p_experiment: exp.id, p_to: "in_reading" });
        await rpc("decide_experiment", {
          p_experiment: exp.id,
          p_verdict: e.decide!.verdict,
          p_decision: e.decide!.decision,
          p_rationale: e.decide!.rationale,
          p_learning: e.decide!.learning,
          p_applies_to: e.decide!.appliesTo.map(lineId),
          p_suggested_hypothesis: e.decide!.suggestedHypothesis,
        });
        if (e.target === "scaled") await rpc("transition_experiment", { p_experiment: exp.id, p_to: "scaled" });
      }

      // Marcas de tiempo históricas del ejemplo (solo el servidor puede fijarlas).
      check(await admin.from("experiments").update(dates.timestamps).eq("id", exp.id), "Fechas históricas");
    }

    return programId;
  } catch (error) {
    // Deshacer lo creado para no dejar un ejemplo a medias.
    if (programId) {
      await admin.from("activity_log").delete().eq("program_id", programId);
      await admin.from("programs").delete().eq("id", programId);
    }
    for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
    throw error;
  }
}

/**
 * Borra el programa de ejemplo de forma definitiva (sin papelera): filas,
 * archivos de Storage, registro de actividad y usuarios ficticios.
 */
export async function deleteDemoProgram(admin: Client): Promise<boolean> {
  const programId = await findDemoProgramId(admin);
  if (!programId) return false;

  const { data: members } = await admin.from("program_members").select("user_id").eq("program_id", programId);

  // Archivos: los que tiene registrados y cualquier otro bajo la carpeta del programa.
  const { data: attachments } = await admin.from("attachments").select("storage_path").eq("program_id", programId);
  const paths = new Set((attachments ?? []).map((a) => a.storage_path as string));
  for (const folder of ["problem", "experiment"]) {
    const { data: entities } = await admin.storage.from("attachments").list(`${programId}/${folder}`, { limit: 1000 });
    for (const entity of entities ?? []) {
      const { data: files } = await admin.storage
        .from("attachments")
        .list(`${programId}/${folder}/${entity.name}`, { limit: 1000 });
      for (const f of files ?? []) paths.add(`${programId}/${folder}/${entity.name}/${f.name}`);
    }
  }

  check(await admin.from("activity_log").delete().eq("program_id", programId), "Registro de actividad");
  check(await admin.from("programs").delete().eq("id", programId), "Programa");

  if (paths.size) {
    const { error } = await admin.storage.from("attachments").remove([...paths]);
    if (error) throw new Error(`Storage: ${error.message}`);
  }
  if (paths.size) await admin.from("storage_deletion_queue").delete().in("storage_path", [...paths]);

  // Usuarios ficticios del ejemplo.
  for (const m of members ?? []) {
    const { data } = await admin.auth.admin.getUserById(m.user_id as string);
    if (data.user?.app_metadata?.demo === true) await admin.auth.admin.deleteUser(m.user_id as string);
  }
  return true;
}
