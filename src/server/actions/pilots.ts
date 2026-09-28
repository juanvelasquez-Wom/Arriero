"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canWritePilots, isPilotApprover } from "@/domain/pilots/flow";
import { computePower } from "@/domain/pilots/power";
import type { PilotMetricCalc } from "@/domain/pilots/types";
import { fail, failFrom, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadExamplePilots as loadExamples } from "@/server/demo/pilots";
import {
  checklistSchema,
  checklistStatusSchema,
  decidePilotSchema,
  decisionRulesSchema,
  incidentSchema,
  measurementsSchema,
  mediaSchema,
  pilotDesignSchema,
  pilotLinksSchema,
  pilotMetricDefSchema,
  pilotMetricsSchema,
  pilotProblemSchema,
  pilotRoleSchema,
  reasonSchema,
  variableSchema,
  type DecidePilotInput,
  type DecisionRulesInput,
  type MeasurementsInput,
  type MediaInput,
  type PilotDesignInput,
  type PilotLinksInput,
  type PilotMetricDefInput,
  type PilotMetricsInput,
  type PilotProblemInput,
  type VariableInput,
} from "@/lib/validation/pilots";
import { getPilotActionActor } from "@/server/pilot-auth";

const uuid = z.string().uuid();
const NO_WRITE = "Su rol en Pilotos es de lectura: pídale a un aprobador que le cambie el rol.";
const ONLY_APPROVER = "Solo un aprobador puede hacer esto.";

function refresh(pilotId?: string) {
  revalidatePath("/pilotos", "layout");
  if (pilotId) revalidatePath(`/pilotos/${pilotId}`, "layout");
}

async function writer() {
  const ctx = await getPilotActionActor();
  return ctx && canWritePilots(ctx.actor) ? ctx : null;
}

async function approver() {
  const ctx = await getPilotActionActor();
  return ctx && isPilotApprover(ctx.actor) ? ctx : null;
}

// -----------------------------------------------------------------------------
// Diseño (asistente)
// -----------------------------------------------------------------------------

export async function createPilot(input: PilotProblemInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await writer();
  if (!ctx) return fail(NO_WRITE);
  const parsed = pilotProblemSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pilots")
    .insert({ ...parsed.data, owner_id: ctx.user.id })
    .select("id")
    .single();
  if (error) return failFrom(error);
  refresh();
  return ok({ id: data.id }, "Piloto creado en borrador. Hágale pues con el diseño.");
}

export async function savePilotProblem(pilotId: string, input: PilotProblemInput): Promise<ActionResult> {
  if (!uuid.safeParse(pilotId).success) return fail("Piloto inválido.");
  if (!(await writer())) return fail(NO_WRITE);
  const parsed = pilotProblemSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("pilots").update(parsed.data).eq("id", pilotId);
  if (error) return failFrom(error);
  refresh(pilotId);
  return ok(undefined, "Oportunidad de mejora e hipótesis guardadas.");
}

/** ¿La RPC todavía no existe en la base? (migración 014 sin aplicar). */
function missingRpc(error: { code?: string } | null): boolean {
  return !!error && (error.code === "PGRST202" || error.code === "42883");
}

/**
 * Respaldo mientras la migración 014 no esté aplicada: escrituras sueltas (sin
 * transacción ni bloqueo optimista). Se quita cuando `save_pilot_design` exista.
 */
async function saveDesignLegacy(
  pilotId: string,
  fields: Record<string, unknown>,
  arms: { id?: string | null; name: string; is_control: boolean; split_pct: number | null; cities: string[]; description: string | null }[],
  media: { id?: string | null; media_id: string; account: string | null; campaign: string | null; audience: string | null; destination: string | null; cities: string[] }[],
) {
  const supabase = await createClient();
  const { error } = await supabase.from("pilots").update(fields).eq("id", pilotId);
  if (error) return error;
  for (const table of ["pilot_arms", "pilot_media"] as const) {
    const rows = table === "pilot_arms" ? arms : media;
    const { data: existing, error: readError } = await supabase.from(table).select("id").eq("pilot_id", pilotId);
    if (readError) return readError;
    const keep = new Set(rows.map((r) => r.id).filter((x): x is string => !!x));
    const stale = (existing ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
    if (stale.length) {
      const { error: delError } = await supabase.from(table).delete().in("id", stale);
      if (delError) return delError;
    }
    if (table === "pilot_arms") {
      const { error: ctlError } = await supabase.from(table).update({ is_control: false }).eq("pilot_id", pilotId).eq("is_control", true);
      if (ctlError) return ctlError;
    }
    for (const [i, { id, ...values }] of rows.entries()) {
      const { error: rowError } = id
        ? await supabase.from(table).update({ ...values, sort_order: i }).eq("id", id).eq("pilot_id", pilotId)
        : await supabase.from(table).insert({ ...values, sort_order: i, pilot_id: pilotId });
      if (rowError) return rowError;
    }
  }
  return null;
}

/**
 * Guarda el paso 2 en una sola transacción (RPC `save_pilot_design`): campos,
 * grupos y medios quedan todos o ninguno. Si otra persona guardó después de que
 * se abrió el formulario, la base lo rechaza y devuelve un aviso para recargar.
 */
export async function savePilotDesign(pilotId: string, input: PilotDesignInput): Promise<ActionResult<{ updatedAt: string | null }>> {
  if (!uuid.safeParse(pilotId).success) return fail("Piloto inválido.");
  if (!(await writer())) return fail(NO_WRITE);
  const parsed = pilotDesignSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const { arms, media, expected_updated_at, ...fields } = parsed.data;
  const armRows = arms.map((a) => ({
    id: a.id ?? null,
    name: a.name,
    is_control: a.is_control,
    split_pct: a.split_pct,
    cities: a.cities,
    description: a.description,
  }));
  const mediaRows = media.map((m) => ({
    id: m.id ?? null,
    media_id: m.media_id,
    account: m.account,
    campaign: m.campaign,
    audience: m.audience,
    destination: m.destination,
    cities: m.cities,
  }));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_pilot_design", {
    p_pilot: pilotId,
    p_expected_updated_at: expected_updated_at || null,
    p_fields: fields,
    p_arms: armRows,
    p_media: mediaRows,
  });
  if (missingRpc(error)) {
    const legacyError = await saveDesignLegacy(pilotId, fields, armRows, mediaRows);
    if (legacyError) return failFrom(legacyError);
    refresh(pilotId);
    return ok({ updatedAt: null }, "Diseño guardado.");
  }
  if (error) return failFrom(error);
  refresh(pilotId);
  return ok({ updatedAt: (data as string | null) ?? null }, "Diseño guardado.");
}

export async function savePilotMetrics(pilotId: string, input: PilotMetricsInput): Promise<ActionResult> {
  if (!uuid.safeParse(pilotId).success) return fail("Piloto inválido.");
  if (!(await writer())) return fail(NO_WRITE);
  const parsed = pilotMetricsSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const { primary_metric_id, guardrails, power_inputs } = parsed.data;
  if (primary_metric_id && guardrails.some((g) => g.metric_id === primary_metric_id)) {
    return fail("La métrica principal no puede ser también un guardrail.", { guardrails: ["Elija otra métrica."] });
  }
  if (new Set(guardrails.map((g) => g.metric_id)).size !== guardrails.length) return fail("Hay guardrails repetidos.");
  const supabase = await createClient();

  // La potencia se calcula aquí, en el servidor: nunca se guarda lo que diga el cliente.
  let power_result = null;
  if (power_inputs && primary_metric_id) {
    const [{ data: metric }, { data: pilot }, { count: arms }] = await Promise.all([
      supabase.from("pilot_metrics").select("calc").eq("id", primary_metric_id).maybeSingle(),
      supabase.from("pilots").select("hypothesis_expected_pct, planned_budget_cop").eq("id", pilotId).maybeSingle(),
      supabase.from("pilot_arms").select("id", { count: "exact", head: true }).eq("pilot_id", pilotId),
    ]);
    if (!metric) return fail("La métrica principal no existe.");
    power_result = computePower(
      metric.calc as PilotMetricCalc,
      power_inputs,
      pilot?.hypothesis_expected_pct == null ? null : Number(pilot.hypothesis_expected_pct),
      Math.max(2, arms ?? 2),
      pilot?.planned_budget_cop == null ? null : Number(pilot.planned_budget_cop),
    );
  }

  const { error } = await supabase
    .from("pilots")
    .update({ primary_metric_id, power_inputs: power_inputs ?? null, power_result })
    .eq("id", pilotId);
  if (error) return failFrom(error);

  const { data: existing } = await supabase.from("pilot_guardrails").select("id, metric_id").eq("pilot_id", pilotId);
  const wanted = new Map(guardrails.map((g) => [g.metric_id, g]));
  const stale = (existing ?? []).filter((g) => !wanted.has(g.metric_id)).map((g) => g.id);
  if (stale.length) {
    const { error: delError } = await supabase.from("pilot_guardrails").delete().in("id", stale);
    if (delError) return failFrom(delError);
  }
  const current = new Map((existing ?? []).map((g) => [g.metric_id as string, g.id as string]));
  for (const g of guardrails) {
    const id = current.get(g.metric_id);
    const { error: gError } = id
      ? await supabase.from("pilot_guardrails").update({ limit_pct: g.limit_pct, note: g.note }).eq("id", id)
      : await supabase.from("pilot_guardrails").insert({ pilot_id: pilotId, metric_id: g.metric_id, limit_pct: g.limit_pct, note: g.note });
    if (gError) return failFrom(gError);
  }
  refresh(pilotId);
  return ok(undefined, "Métricas y potencia guardadas.");
}

export async function savePilotRules(pilotId: string, input: DecisionRulesInput): Promise<ActionResult> {
  if (!uuid.safeParse(pilotId).success) return fail("Piloto inválido.");
  if (!(await writer())) return fail(NO_WRITE);
  const parsed = decisionRulesSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("pilots").update({ decision_rules: parsed.data }).eq("id", pilotId);
  if (error) return failFrom(error);
  refresh(pilotId);
  return ok(undefined, "Reglas de decisión registradas.");
}

export async function saveChecklist(pilotId: string, input: z.input<typeof checklistSchema>): Promise<ActionResult> {
  if (!uuid.safeParse(pilotId).success) return fail("Piloto inválido.");
  if (!(await writer())) return fail(NO_WRITE);
  const parsed = checklistSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data: existing } = await supabase.from("pilot_checklist_items").select("id").eq("pilot_id", pilotId);
  const keep = new Set(parsed.data.map((i) => i.id).filter(Boolean));
  const stale = (existing ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
  if (stale.length) {
    const { error } = await supabase.from("pilot_checklist_items").delete().in("id", stale);
    if (error) return failFrom(error);
  }
  for (const [i, item] of parsed.data.entries()) {
    const values = { platform: item.platform, event_name: item.event_name, description: item.description, sort_order: i };
    const { error } = item.id
      ? await supabase.from("pilot_checklist_items").update(values).eq("id", item.id)
      : await supabase.from("pilot_checklist_items").insert({ ...values, pilot_id: pilotId });
    if (error) return failFrom(error);
  }
  refresh(pilotId);
  return ok(undefined, "Lista de chequeo guardada.");
}

export async function setChecklistStatus(pilotId: string, itemId: string, input: z.input<typeof checklistStatusSchema>): Promise<ActionResult> {
  if (!uuid.safeParse(pilotId).success || !uuid.safeParse(itemId).success) return fail("Dato inválido.");
  if (!(await writer())) return fail(NO_WRITE);
  const parsed = checklistStatusSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("pilot_checklist_items").update(parsed.data).eq("id", itemId).eq("pilot_id", pilotId);
  if (error) return failFrom(error);
  refresh(pilotId);
  return ok(undefined, parsed.data.status === "ok" ? "¡Eso! El evento dispara bien." : "Estado del evento actualizado.");
}

export async function savePilotLinks(pilotId: string, input: PilotLinksInput): Promise<ActionResult> {
  if (!uuid.safeParse(pilotId).success) return fail("Piloto inválido.");
  if (!(await writer())) return fail(NO_WRITE);
  const parsed = pilotLinksSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("pilots").update(parsed.data).eq("id", pilotId);
  if (error) return failFrom(error);
  refresh(pilotId);
  return ok(undefined, "Vínculos guardados.");
}

// -----------------------------------------------------------------------------
// Flujo
// -----------------------------------------------------------------------------

async function rpc(name: string, args: Record<string, unknown>, pilotId: string, message: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(name, args);
  if (error) return failFrom(error);
  refresh(pilotId);
  return ok(undefined, message);
}

export async function submitPilot(pilotId: string): Promise<ActionResult> {
  if (!uuid.safeParse(pilotId).success) return fail("Piloto inválido.");
  if (!(await writer())) return fail(NO_WRITE);
  return rpc("pilot_submit", { p_pilot: pilotId }, pilotId, "Enviado a revisión. Ahora le toca al aprobador.");
}

export async function returnPilot(pilotId: string, comment: string): Promise<ActionResult> {
  if (!uuid.safeParse(pilotId).success) return fail("Piloto inválido.");
  if (!(await approver())) return fail(ONLY_APPROVER);
  const parsed = reasonSchema.safeParse(comment);
  if (!parsed.success) return fromZod(parsed.error);
  return rpc("pilot_return", { p_pilot: pilotId, p_comment: parsed.data }, pilotId, "Devuelto a borrador con sus comentarios.");
}

export async function approvePilot(pilotId: string, comment?: string): Promise<ActionResult> {
  if (!uuid.safeParse(pilotId).success) return fail("Piloto inválido.");
  if (!(await approver())) return fail(ONLY_APPROVER);
  return rpc("pilot_approve", { p_pilot: pilotId, p_comment: comment?.trim() || null }, pilotId, "¡Aprobado! El diseño quedó bloqueado.");
}

export async function startPilot(pilotId: string, start: string): Promise<ActionResult> {
  if (!uuid.safeParse(pilotId).success || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return fail("Revise la fecha de inicio.");
  if (!(await writer())) return fail(NO_WRITE);
  return rpc("pilot_start", { p_pilot: pilotId, p_start: start }, pilotId, "¡Arrancó el piloto! Cargue los datos a medida que lleguen.");
}

export async function moveToReading(pilotId: string, end: string): Promise<ActionResult> {
  if (!uuid.safeParse(pilotId).success || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return fail("Revise la fecha de cierre.");
  if (!(await writer())) return fail(NO_WRITE);
  return rpc("pilot_to_reading", { p_pilot: pilotId, p_end: end }, pilotId, "Prueba cerrada. A leer el resultado.");
}

export async function decidePilot(pilotId: string, input: DecidePilotInput): Promise<ActionResult> {
  if (!uuid.safeParse(pilotId).success) return fail("Piloto inválido.");
  if (!(await approver())) return fail(ONLY_APPROVER);
  const parsed = decidePilotSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  return rpc(
    "pilot_decide",
    { p_pilot: pilotId, p_verdict: d.verdict, p_decision: d.decision, p_justification: d.justification, p_learning: d.learning },
    pilotId,
    "Decisión firmada. El aprendizaje ya está en la biblioteca.",
  );
}

export async function cancelPilot(pilotId: string, reason: string): Promise<ActionResult> {
  if (!uuid.safeParse(pilotId).success) return fail("Piloto inválido.");
  if (!(await writer())) return fail(NO_WRITE);
  const parsed = reasonSchema.safeParse(reason);
  if (!parsed.success) return fromZod(parsed.error);
  return rpc("pilot_cancel", { p_pilot: pilotId, p_reason: parsed.data }, pilotId, "Piloto cancelado. Ese camino no era.");
}

export async function deletePilot(pilotId: string): Promise<ActionResult> {
  if (!uuid.safeParse(pilotId).success) return fail("Piloto inválido.");
  if (!(await writer())) return fail(NO_WRITE);
  return rpc("pilot_delete", { p_pilot: pilotId }, pilotId, "Piloto borrado. Un aprobador lo puede restaurar.");
}

export async function restorePilot(pilotId: string): Promise<ActionResult> {
  if (!uuid.safeParse(pilotId).success) return fail("Piloto inválido.");
  if (!(await approver())) return fail(ONLY_APPROVER);
  return rpc("pilot_restore", { p_pilot: pilotId }, pilotId, "Piloto restaurado.");
}

// -----------------------------------------------------------------------------
// Datos e incidentes
// -----------------------------------------------------------------------------

export async function saveMeasurements(pilotId: string, input: MeasurementsInput): Promise<ActionResult<{ saved: number }>> {
  if (!uuid.safeParse(pilotId).success) return fail("Piloto inválido.");
  if (!(await writer())) return fail(NO_WRITE);
  const parsed = measurementsSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const { granularity, source, values } = parsed.data;
  const supabase = await createClient();
  const { data: arms } = await supabase.from("pilot_arms").select("id").eq("pilot_id", pilotId);
  const armIds = new Set((arms ?? []).map((a) => a.id));
  if (values.some((v) => !armIds.has(v.arm_id))) return fail("Hay datos de un grupo que no es de este piloto.");
  // Un dato traído por integración que se corrige a mano conserva su fuente: el
  // trigger lo marca como "ajustado" y guarda el valor original.
  const { data: fromMcp } = await supabase
    .from("pilot_measurements")
    .select("arm_id, metric_id, unit_label, period_start")
    .eq("pilot_id", pilotId)
    .eq("granularity", granularity)
    .eq("source", "mcp");
  const mcpKeys = new Set((fromMcp ?? []).map((m) => `${m.arm_id}|${m.metric_id}|${m.unit_label}|${m.period_start}`));
  const rows = values.map((v) => ({
    ...v,
    pilot_id: pilotId,
    granularity,
    source: mcpKeys.has(`${v.arm_id}|${v.metric_id}|${v.unit_label ?? ""}|${v.period_start}`) ? ("mcp" as const) : source,
  }));
  // Si un dato ya existía se actualiza (queda en la auditoría con su valor anterior).
  const { error } = await supabase.from("pilot_measurements").upsert(rows, { onConflict: "arm_id,metric_id,unit_label,period_start,granularity" });
  if (error) return failFrom(error);
  refresh(pilotId);
  return ok({ saved: rows.length }, `¡Listo pues! ${rows.length} ${rows.length === 1 ? "dato guardado" : "datos guardados"}.`);
}

export async function deleteMeasurement(pilotId: string, measurementId: string): Promise<ActionResult> {
  if (!uuid.safeParse(pilotId).success || !uuid.safeParse(measurementId).success) return fail("Dato inválido.");
  if (!(await writer())) return fail(NO_WRITE);
  const supabase = await createClient();
  const { error } = await supabase.from("pilot_measurements").delete().eq("id", measurementId).eq("pilot_id", pilotId);
  if (error) return failFrom(error);
  refresh(pilotId);
  return ok(undefined, "Dato borrado.");
}

export async function logIncident(pilotId: string, input: z.input<typeof incidentSchema>): Promise<ActionResult> {
  if (!uuid.safeParse(pilotId).success) return fail("Piloto inválido.");
  if (!(await writer())) return fail(NO_WRITE);
  const parsed = incidentSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("pilot_incidents").insert({ ...parsed.data, pilot_id: pilotId });
  if (error) return failFrom(error);
  refresh(pilotId);
  return ok(undefined, "Incidente registrado. Queda en la bitácora.");
}

// -----------------------------------------------------------------------------
// Catálogos
// -----------------------------------------------------------------------------

/** Cualquier creador agrega un medio escribiendo su nombre, sin salir del flujo. */
export async function createMedia(input: MediaInput): Promise<ActionResult<{ id: string; name: string }>> {
  if (!(await writer())) return fail(NO_WRITE);
  const parsed = mediaSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data: existing } = await supabase.from("media_channels").select("id, name").is("archived_at", null).ilike("name", parsed.data.name);
  if (existing?.length) return ok({ id: existing[0].id, name: existing[0].name }, "Ese medio ya estaba en el catálogo: lo usamos.");
  const { data, error } = await supabase.from("media_channels").insert(parsed.data).select("id, name").single();
  if (error) return failFrom(error);
  refresh();
  return ok({ id: data.id, name: data.name }, `«${data.name}» quedó en el catálogo de medios.`);
}

export async function updateMedia(mediaId: string, input: MediaInput): Promise<ActionResult> {
  if (!uuid.safeParse(mediaId).success) return fail("Medio inválido.");
  if (!(await approver())) return fail(ONLY_APPROVER);
  const parsed = mediaSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("media_channels").update(parsed.data).eq("id", mediaId);
  if (error) return failFrom(error);
  refresh();
  return ok(undefined, "Medio actualizado.");
}

export async function setMediaArchived(mediaId: string, archived: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(mediaId).success) return fail("Medio inválido.");
  if (!(await approver())) return fail(ONLY_APPROVER);
  const supabase = await createClient();
  const { error } = await supabase.from("media_channels").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", mediaId);
  if (error) return failFrom(error);
  refresh();
  return ok(undefined, archived ? "Medio archivado." : "Medio de vuelta en el catálogo.");
}

export async function mergeMedia(fromId: string, intoId: string): Promise<ActionResult> {
  if (!uuid.safeParse(fromId).success || !uuid.safeParse(intoId).success) return fail("Elija los dos medios.");
  if (!(await approver())) return fail(ONLY_APPROVER);
  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_media", { p_from: fromId, p_into: intoId });
  if (error) return failFrom(error);
  refresh();
  return ok(undefined, "Medios fusionados. Un duplicado menos.");
}

/** Métrica nueva: los creadores agregan métricas propias de un medio; el aprobador, del catálogo general. */
export async function createPilotMetric(input: PilotMetricDefInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await writer();
  if (!ctx) return fail(NO_WRITE);
  const parsed = pilotMetricDefSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  if (!isPilotApprover(ctx.actor) && !parsed.data.media_id) return fail("Elija el medio al que pertenece la métrica (el catálogo general lo edita un aprobador).");
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pilot_metrics")
    .insert({ ...d, numerator_id: d.calc === "sum" ? null : d.numerator_id, denominator_id: d.calc === "sum" ? null : d.denominator_id })
    .select("id")
    .single();
  if (error) return failFrom(error);
  refresh();
  return ok({ id: data.id }, "Métrica agregada al catálogo.");
}

export async function updatePilotMetric(metricId: string, input: PilotMetricDefInput): Promise<ActionResult> {
  if (!uuid.safeParse(metricId).success) return fail("Métrica inválida.");
  if (!(await approver())) return fail(ONLY_APPROVER);
  const parsed = pilotMetricDefSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("pilot_metrics")
    .update({ ...d, numerator_id: d.calc === "sum" ? null : d.numerator_id, denominator_id: d.calc === "sum" ? null : d.denominator_id })
    .eq("id", metricId);
  if (error) return failFrom(error);
  refresh();
  return ok(undefined, "Métrica actualizada.");
}

export async function setMetricArchived(metricId: string, archived: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(metricId).success) return fail("Métrica inválida.");
  if (!(await approver())) return fail(ONLY_APPROVER);
  const supabase = await createClient();
  const { error } = await supabase.from("pilot_metrics").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", metricId);
  if (error) return failFrom(error);
  refresh();
  return ok(undefined, archived ? "Métrica archivada." : "Métrica de vuelta en el catálogo.");
}

export async function saveVariable(variableId: string | null, input: VariableInput): Promise<ActionResult> {
  if (variableId && !uuid.safeParse(variableId).success) return fail("Variable inválida.");
  if (!(await approver())) return fail(ONLY_APPROVER);
  const parsed = variableSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const values = { ...parsed.data, alternative_test_type: parsed.data.alternative_test_type ?? null };
  const supabase = await createClient();
  const { error } = variableId
    ? await supabase.from("pilot_variables").update(values).eq("id", variableId)
    : await supabase.from("pilot_variables").insert({ ...values, sort_order: 999 });
  if (error) return failFrom(error);
  refresh();
  return ok(undefined, variableId ? "Variable actualizada." : "Variable agregada al catálogo.");
}

export async function setVariableArchived(variableId: string, archived: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(variableId).success) return fail("Variable inválida.");
  if (!(await approver())) return fail(ONLY_APPROVER);
  const supabase = await createClient();
  const { error } = await supabase.from("pilot_variables").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", variableId);
  if (error) return failFrom(error);
  refresh();
  return ok(undefined, archived ? "Variable archivada." : "Variable de vuelta en el catálogo.");
}

// -----------------------------------------------------------------------------
// Roles del módulo
// -----------------------------------------------------------------------------

export async function setPilotRole(input: z.input<typeof pilotRoleSchema>): Promise<ActionResult> {
  const ctx = await approver();
  if (!ctx) return fail(ONLY_APPROVER);
  const parsed = pilotRoleSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const { user_id, role } = parsed.data;
  if (user_id === ctx.user.id && role !== "approver" && !ctx.user.isAdmin) return fail("No se puede quitar el rol de aprobador a sí mismo.");
  const supabase = await createClient();
  const { error } = role
    ? await supabase.from("pilot_roles").upsert({ user_id, role }, { onConflict: "user_id" })
    : await supabase.from("pilot_roles").delete().eq("user_id", user_id);
  if (error) return failFrom(error);
  refresh();
  return ok(undefined, role ? "Rol actualizado." : "Acceso a Pilotos retirado.");
}

/** Carga los 3 pilotos de ejemplo (con la secret key: nacen en estados avanzados y con fechas pasadas). */
export async function loadExamplePilots(): Promise<ActionResult<{ created: number }>> {
  const ctx = await approver();
  if (!ctx) return fail(ONLY_APPROVER);
  try {
    const created = await loadExamples(createAdminClient(), ctx.user.id);
    refresh();
    return ok({ created }, "Tres pilotos de ejemplo cargados. Probemos por ahí.");
  } catch (e) {
    console.error("[pilotos] Error al cargar los ejemplos", e);
    return fail(e instanceof Error ? `No se pudieron cargar los ejemplos. ${e.message}` : "No se pudieron cargar los ejemplos.");
  }
}

export async function deleteExamplePilots(): Promise<ActionResult<{ deleted: number }>> {
  if (!(await approver())) return fail(ONLY_APPROVER);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_example_pilots");
  if (error) return failFrom(error);
  refresh();
  return ok({ deleted: Number(data ?? 0) }, "Ejemplos borrados. Cancha limpia.");
}
