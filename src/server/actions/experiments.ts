"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import {
  decideSchema,
  experimentDraftSchema,
  experimentPowerSchema,
  guardrailsSchema,
  learningChannelSchema,
  learningLeverSchema,
  resultsSchema,
  transitionSchema,
  type DecideInput,
  type ExperimentDraftInput,
} from "@/lib/validation/experiments";
import { inferCalendarFit, inferOwnerType, resolvePrimaryMetric } from "@/domain/experiment-inference";
import { computeExperimentPower, powerCalcFor, type ExperimentPowerInputs } from "@/domain/experiment-power";
import type { PowerResult } from "@/domain/pilots/types";
import { can } from "@/domain/permissions";
import type { CalendarEvent, ProgramRole } from "@/domain/types";
import { getActionActor } from "@/server/auth";

const uuid = z.string().uuid();

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Draft = z.output<typeof experimentDraftSchema>;

export interface ExperimentSaveResult {
  id: string;
  variantIds?: string[];
  /** Versión actual del ejercicio: el asistente la manda en el siguiente guardado. */
  updatedAt: string | null;
}

const CONFLICT_MESSAGE = "Alguien más cambió este ejercicio mientras usted lo editaba. Recargue para ver los cambios.";

function revalidateProgram(programId: string) {
  revalidatePath(`/programas/${programId}`, "layout");
}

/**
 * Guarda las variantes del borrador en una sola operación atómica (RPC
 * save_experiment_variants): borra las que ya no están, actualiza y crea.
 * Devuelve los ids en el mismo orden para que el asistente no las duplique.
 */
async function syncVariants(
  supabase: Supabase,
  experimentId: string,
  variants: NonNullable<Draft["variants"]>,
): Promise<{ error: { message: string; code?: string } | null; ids: string[] }> {
  const { data, error } = await supabase.rpc("save_experiment_variants", {
    p_experiment: experimentId,
    p_variants: variants.map((v) => ({
      id: v.id ?? null,
      name: v.name,
      is_control: v.is_control,
      description: v.description ?? null,
    })),
  });
  if (error) return { error, ids: [] };
  return { error: null, ids: (data as string[] | null) ?? [] };
}

function draftRow(d: Draft, allowScoring: boolean) {
  const row: Record<string, unknown> = {
    problem_id: d.problem_id,
    metric_id: d.metric_id,
    title: d.title,
    hypothesis_if: d.hypothesis_if,
    hypothesis_then: d.hypothesis_then,
    hypothesis_because: d.hypothesis_because,
  };
  if (d.derived_from_learning_id !== undefined) row.derived_from_learning_id = d.derived_from_learning_id;
  if (allowScoring) {
    if (d.impact !== undefined) row.impact = d.impact;
    if (d.confidence !== undefined) row.confidence = d.confidence;
    if (d.ease !== undefined) row.ease = d.ease;
    if (d.fits_calendar !== undefined) row.fits_calendar = d.fits_calendar;
    if (d.control !== undefined) row.control = d.control;
    if (d.owner_id !== undefined) row.owner_id = d.owner_id;
  }
  for (const k of ["test_type", "primary_metric", "control_metrics", "min_duration_days", "decision_rule", "owner_type", "planned_start", "planned_end"] as const) {
    if (d[k] !== undefined) row[k] = d[k];
  }
  return row;
}

async function listCalendarEvents(supabase: Supabase, programId: string): Promise<CalendarEvent[]> {
  const { data } = await supabase
    .from("calendar_events")
    .select("id, type, name, start_date, end_date")
    .eq("program_id", programId)
    .is("deleted_at", null);
  return (data ?? []) as CalendarEvent[];
}

async function metricNames(supabase: Supabase, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const { data } = await supabase.from("metrics").select("id, name").in("id", unique);
  return new Map((data ?? []).map((m) => [m.id as string, m.name as string]));
}

/**
 * Completa lo que el producto sabe resolver solo: filtro de calendario (salvo cambio
 * manual), métrica principal (la del árbol) y tipo de responsable (según su rol).
 */
async function applyInferences(
  supabase: Supabase,
  programId: string,
  row: Record<string, unknown>,
  d: Draft,
  opts: {
    allowScoring: boolean;
    designLocked: boolean;
    current?: { primary_metric: string | null; metric_id: string; min_duration_days: number | null } | null;
  },
) {
  const { allowScoring, designLocked, current } = opts;

  if (allowScoring && !d.fits_calendar_override) {
    const fit = inferCalendarFit(
      {
        planned_start: d.planned_start ?? null,
        planned_end: d.planned_end ?? null,
        min_duration_days: d.min_duration_days !== undefined ? d.min_duration_days : (current?.min_duration_days ?? null),
      },
      await listCalendarEvents(supabase, programId),
    );
    if (fit.fits !== null) row.fits_calendar = fit.fits;
  }

  if (!designLocked) {
    const names = await metricNames(supabase, [d.metric_id, current?.metric_id]);
    const primary = resolvePrimaryMetric({
      current: d.primary_metric !== undefined ? d.primary_metric : (current?.primary_metric ?? null),
      previousMetricName: current ? (names.get(current.metric_id) ?? null) : null,
      metricName: names.get(d.metric_id) ?? null,
    });
    if (primary) row.primary_metric = primary;
  }

  if (allowScoring && row.owner_id && !row.owner_type) {
    const { data: member } = await supabase
      .from("program_members")
      .select("role")
      .eq("program_id", programId)
      .eq("user_id", row.owner_id as string)
      .maybeSingle();
    const inferred = inferOwnerType((member?.role as ProgramRole | undefined) ?? null);
    if (inferred) row.owner_type = inferred;
  }
}

// ---------------------------------------------------------------------------
// X1 · Potencia y guardrails
// ---------------------------------------------------------------------------

type PowerDraft = { expected_effect_pct: number | null; power_inputs: ExperimentPowerInputs | null };

/**
 * Calcula la potencia en el servidor (no se confía en lo que manda el navegador)
 * con la unidad de la métrica del árbol, el número de variantes y la duración.
 */
async function computePowerResult(
  supabase: Supabase,
  experimentId: string,
  draft: PowerDraft,
  hints: { metricId?: string; arms?: number; minDurationDays?: number | null } = {},
): Promise<PowerResult | null> {
  if (!draft.power_inputs && draft.expected_effect_pct == null) return null;
  const { data: exp } = await supabase.from("experiments").select("metric_id, min_duration_days").eq("id", experimentId).maybeSingle();
  const metricId = hints.metricId ?? (exp?.metric_id as string | undefined);
  const { data: metric } = metricId ? await supabase.from("metrics").select("unit").eq("id", metricId).maybeSingle() : { data: null };
  let arms = hints.arms;
  if (arms == null) {
    const { count } = await supabase.from("experiment_variants").select("id", { count: "exact", head: true }).eq("experiment_id", experimentId);
    arms = count ?? 2;
  }
  return computeExperimentPower({
    calc: powerCalcFor((metric?.unit as string | null | undefined) ?? null),
    inputs: draft.power_inputs,
    expectedPct: draft.expected_effect_pct,
    arms,
    plannedDays: hints.minDurationDays !== undefined ? hints.minDurationDays : ((exp?.min_duration_days as number | null | undefined) ?? null),
  });
}

async function writePower(
  supabase: Supabase,
  experimentId: string,
  draft: PowerDraft,
  hints?: Parameters<typeof computePowerResult>[3],
): Promise<{ message: string; code?: string } | null> {
  const power_result = await computePowerResult(supabase, experimentId, draft, hints);
  const { error } = await supabase
    .from("experiments")
    .update({ expected_effect_pct: draft.expected_effect_pct, power_inputs: draft.power_inputs, power_result })
    .eq("id", experimentId);
  return error;
}

type GuardrailDraft = z.output<typeof guardrailsSchema>;

/**
 * Deja los guardrails del ejercicio como vienen: borra los que ya no están,
 * actualiza los que siguen (por métrica) e inserta los nuevos. Se inserta al
 * final para no chocar con el máximo de 3 que cuida la base.
 */
async function syncGuardrails(supabase: Supabase, experimentId: string, guardrails: GuardrailDraft): Promise<{ message: string; code?: string } | null> {
  const { data: existing, error: readError } = await supabase.from("experiment_guardrails").select("id, metric_id").eq("experiment_id", experimentId);
  if (readError) return readError;
  const byMetric = new Map((existing ?? []).map((g) => [g.metric_id as string, g.id as string]));
  const keep = new Set(guardrails.map((g) => g.metric_id));
  const remove = (existing ?? []).filter((g) => !keep.has(g.metric_id as string)).map((g) => g.id as string);
  if (remove.length) {
    const { error } = await supabase.from("experiment_guardrails").delete().in("id", remove);
    if (error) return error;
  }
  for (const g of guardrails) {
    const id = byMetric.get(g.metric_id);
    if (!id) continue;
    const { error } = await supabase.from("experiment_guardrails").update({ limit_pct: g.limit_pct, note: g.note ?? null }).eq("id", id);
    if (error) return error;
  }
  const fresh = guardrails.filter((g) => !byMetric.has(g.metric_id));
  if (fresh.length) {
    const { error } = await supabase
      .from("experiment_guardrails")
      .insert(fresh.map((g) => ({ experiment_id: experimentId, metric_id: g.metric_id, limit_pct: g.limit_pct, note: g.note ?? null })));
    if (error) return error;
  }
  return null;
}

function rigorHints(d: Draft): Parameters<typeof computePowerResult>[3] {
  return {
    metricId: d.metric_id,
    arms: d.variants ? Math.max(2, d.variants.length) : undefined,
    minDurationDays: d.min_duration_days !== undefined ? (d.min_duration_days ?? null) : undefined,
  };
}

/** Potencia y guardrails del borrador, si vinieron (y el diseño no está bloqueado). */
async function writeRigor(
  supabase: Supabase,
  experimentId: string,
  d: Draft,
  hints: Parameters<typeof computePowerResult>[3],
): Promise<{ message: string; code?: string } | null> {
  if (d.expected_effect_pct !== undefined || d.power_inputs !== undefined) {
    const error = await writePower(supabase, experimentId, { expected_effect_pct: d.expected_effect_pct ?? null, power_inputs: d.power_inputs ?? null }, hints);
    if (error) return error;
  }
  if (d.guardrails !== undefined) {
    const error = await syncGuardrails(supabase, experimentId, d.guardrails);
    if (error) return error;
  }
  return null;
}

/** Guarda el efecto esperado y los datos de la potencia; la potencia se calcula aquí. */
export async function saveExperimentPower(programId: string, experimentId: string, input: unknown): Promise<ActionResult<{ power: PowerResult | null }>> {
  if (!uuid.safeParse(programId).success || !uuid.safeParse(experimentId).success) return fail("Ejercicio inválido.");
  const ctx = await getActionActor(programId);
  if (!ctx) return fail("Su sesión venció o no tiene acceso a este programa.");
  const parsed = experimentPowerSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data: current } = await supabase.from("experiments").select("owner_id, design_locked_at").eq("id", experimentId).maybeSingle();
  if (!current) return fail("El ejercicio no existe o fue borrado.");
  if (!can.editExperiment(ctx.actor, current)) return fail("No tiene permiso para editar este ejercicio.");
  if (current.design_locked_at) return fail("El diseño está bloqueado desde que el ejercicio entró en prueba: la potencia ya no se cambia.");
  const power = await computePowerResult(supabase, experimentId, parsed.data);
  const { error } = await supabase
    .from("experiments")
    .update({ expected_effect_pct: parsed.data.expected_effect_pct, power_inputs: parsed.data.power_inputs, power_result: power })
    .eq("id", experimentId);
  if (error) return failFrom(error);
  revalidateProgram(programId);
  return ok({ power }, "Potencia guardada.");
}

/** Guarda los guardrails del ejercicio (máximo 3, métricas de la misma línea). */
export async function saveExperimentGuardrails(programId: string, experimentId: string, input: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(programId).success || !uuid.safeParse(experimentId).success) return fail("Ejercicio inválido.");
  const ctx = await getActionActor(programId);
  if (!ctx) return fail("Su sesión venció o no tiene acceso a este programa.");
  const parsed = guardrailsSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data: current } = await supabase.from("experiments").select("owner_id, design_locked_at").eq("id", experimentId).maybeSingle();
  if (!current) return fail("El ejercicio no existe o fue borrado.");
  if (!can.editExperiment(ctx.actor, current)) return fail("No tiene permiso para editar este ejercicio.");
  if (current.design_locked_at) return fail("El diseño está bloqueado desde que el ejercicio entró en prueba: los guardrails no se cambian.");
  const error = await syncGuardrails(supabase, experimentId, parsed.data);
  if (error) return failFrom(error);
  revalidateProgram(programId);
  return ok(undefined, "Guardrails guardados.");
}

async function currentVersion(supabase: Supabase, experimentId: string): Promise<string | null> {
  const { data } = await supabase.from("experiments").select("updated_at").eq("id", experimentId).maybeSingle();
  return (data?.updated_at as string | undefined) ?? null;
}

/** Crea el ejercicio como borrador (Idea). Se puede llamar desde cualquier paso. */
export async function createExperiment(programId: string, input: ExperimentDraftInput): Promise<ActionResult<ExperimentSaveResult>> {
  if (!uuid.safeParse(programId).success) return fail("Programa inválido.");
  const ctx = await getActionActor(programId);
  if (!ctx) return fail("Su sesión venció o no tiene acceso a este programa.");
  if (!can.createExperiment(ctx.actor)) return fail("Su rol no puede crear ejercicios.");
  const parsed = experimentDraftSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const allowScoring = can.scoreIce(ctx.actor);
  const row = draftRow(parsed.data, allowScoring);
  // La agencia que crea un ejercicio queda como responsable (así puede seguir editándolo).
  if (!allowScoring) {
    row.owner_id = ctx.user.id;
    row.owner_type = "agency";
  }
  const { data: problem } = await supabase.from("problems").select("line_id").eq("id", parsed.data.problem_id).maybeSingle();
  if (!problem) return fail("El problema no existe o fue borrado.");
  await applyInferences(supabase, programId, row, parsed.data, { allowScoring, designLocked: false });
  const { data, error } = await supabase
    .from("experiments")
    .insert({ ...row, line_id: problem.line_id })
    .select("id")
    .single();
  if (error) return failFrom(error);

  let variantIds: string[] | undefined;
  if (parsed.data.variants?.length) {
    const synced = await syncVariants(supabase, data.id, parsed.data.variants);
    if (synced.error) return failFrom(synced.error);
    variantIds = synced.ids;
  }
  const rigorError = await writeRigor(supabase, data.id, parsed.data, rigorHints(parsed.data));
  if (rigorError) return failFrom(rigorError);
  const updatedAt = await currentVersion(supabase, data.id);
  revalidateProgram(programId);
  return ok({ id: data.id, variantIds, updatedAt }, "Borrador guardado. Ahí vamos.");
}

export async function updateExperiment(
  programId: string,
  experimentId: string,
  input: ExperimentDraftInput,
): Promise<ActionResult<ExperimentSaveResult>> {
  if (!uuid.safeParse(programId).success || !uuid.safeParse(experimentId).success) return fail("Ejercicio inválido.");
  const ctx = await getActionActor(programId);
  if (!ctx) return fail("Su sesión venció o no tiene acceso a este programa.");
  const parsed = experimentDraftSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("experiments")
    .select("owner_id, design_locked_at, updated_at, primary_metric, metric_id, min_duration_days")
    .eq("id", experimentId)
    .maybeSingle();
  if (!current) return fail("El ejercicio no existe o fue borrado.");
  if (!can.editExperiment(ctx.actor, current)) return fail("No tiene permiso para editar este ejercicio.");

  // Concurrencia optimista: si cambió desde que se abrió, no se pisa.
  const expected = parsed.data.expected_updated_at;
  if (expected && new Date(expected).getTime() !== new Date(current.updated_at).getTime()) return fail(CONFLICT_MESSAGE);

  const allowScoring = can.scoreIce(ctx.actor);
  const designLocked = !!current.design_locked_at;
  const row = draftRow(parsed.data, allowScoring);
  await applyInferences(supabase, programId, row, parsed.data, { allowScoring, designLocked, current });
  if (designLocked) {
    for (const k of ["test_type", "primary_metric", "control_metrics", "min_duration_days", "decision_rule", "metric_id"]) delete row[k];
  }
  // El filtro por updated_at cierra la ventana entre la lectura y la escritura.
  const { data: updated, error } = await supabase
    .from("experiments")
    .update(row)
    .eq("id", experimentId)
    .eq("updated_at", current.updated_at)
    .select("id");
  if (error) return failFrom(error);
  if (!updated?.length) return fail(CONFLICT_MESSAGE);

  let variantIds: string[] | undefined;
  if (parsed.data.variants && !designLocked) {
    const synced = await syncVariants(supabase, experimentId, parsed.data.variants);
    if (synced.error) return failFrom(synced.error);
    variantIds = synced.ids;
  }
  if (!designLocked) {
    const rigorError = await writeRigor(supabase, experimentId, parsed.data, rigorHints(parsed.data));
    if (rigorError) return failFrom(rigorError);
  }
  const updatedAt = await currentVersion(supabase, experimentId);
  revalidateProgram(programId);
  return ok({ id: experimentId, variantIds, updatedAt }, "Cambios guardados.");
}

/** Edición rápida de ICE desde el backlog. */
export async function updateIce(
  programId: string,
  experimentId: string,
  input: { impact: number | null; confidence: number | null; ease: number | null },
): Promise<ActionResult> {
  const ctx = await getActionActor(programId);
  if (!ctx || !can.scoreIce(ctx.actor)) return fail("No tiene permiso para calificar ICE.");
  const s = z.coerce.number().int().min(1).max(10).nullable();
  const parsed = z.object({ impact: s, confidence: s, ease: s }).safeParse(input);
  if (!parsed.success) return fail("Las calificaciones van de 1 a 10.");
  const supabase = await createClient();
  const { error } = await supabase.from("experiments").update(parsed.data).eq("id", experimentId);
  if (error) return failFrom(error);
  revalidateProgram(programId);
  return ok(undefined);
}

export async function transitionExperiment(input: z.input<typeof transitionSchema>): Promise<ActionResult> {
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const { experimentId, programId, to, justification, force } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_experiment", {
    p_experiment: experimentId,
    p_to: to,
    p_justification: justification ?? null,
    p_force: force ?? false,
  });
  if (error) return failFrom(error);
  revalidateProgram(programId);
  return ok(undefined);
}

export async function decideExperiment(input: DecideInput): Promise<ActionResult> {
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_experiment", {
    p_experiment: d.experimentId,
    p_verdict: d.verdict,
    p_decision: d.decision,
    p_rationale: d.rationale ?? null,
    p_learning: d.learning,
    p_applies_to: d.appliesTo,
    p_suggested_hypothesis: d.suggestedHypothesis ?? null,
  });
  if (error) return failFrom(error);
  // La RPC no recibe la taxonomía (palanca y canal): se completa en el aprendizaje recién creado.
  let note: string | undefined;
  if (d.lever || d.channel) {
    const { error: taxError } = await supabase
      .from("learnings")
      .update({ lever: d.lever ?? null, channel: d.channel ?? null })
      .eq("experiment_id", d.experimentId)
      .is("deleted_at", null);
    if (taxError) note = "El ejercicio quedó decidido, pero la palanca y el canal no se guardaron. Agréguelos desde la pestaña Aprendizaje.";
  }
  revalidateProgram(d.programId);
  return ok(undefined, note ?? "¡Qué berraquera! Ejercicio decidido.");
}

export async function unlockDesign(programId: string, experimentId: string, justification: string): Promise<ActionResult> {
  if (!justification?.trim()) return fail("Escriba la justificación del desbloqueo.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("unlock_design", { p_experiment: experimentId, p_justification: justification.trim() });
  if (error) return failFrom(error);
  revalidateProgram(programId);
  return ok(undefined, "Diseño desbloqueado.");
}

export async function lockDesign(programId: string, experimentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("lock_design", { p_experiment: experimentId });
  if (error) return failFrom(error);
  revalidateProgram(programId);
  return ok(undefined, "Diseño bloqueado.");
}

/** Carga de resultados por variante (permitida con el diseño bloqueado). */
export async function saveResults(programId: string, experimentId: string, input: unknown): Promise<ActionResult> {
  const ctx = await getActionActor(programId);
  if (!ctx) return fail("Su sesión venció o no tiene acceso a este programa.");
  const parsed = resultsSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  for (const v of parsed.data) {
    if (v.conversions != null && v.sample != null && v.conversions > v.sample) {
      return fail("Las conversiones no pueden superar la muestra.");
    }
    const patch: Record<string, unknown> = {
      sample: v.sample ?? null,
      conversions: v.conversions ?? null,
      metric_value: v.metric_value ?? null,
      notes: v.notes,
    };
    // Solo si el ejercicio tiene guardrails (así sigue funcionando sin la migración X1).
    if (v.guardrail_values !== undefined) patch.guardrail_values = v.guardrail_values;
    const { error } = await supabase
      .from("experiment_variants")
      .update(patch)
      .eq("id", v.id)
      .eq("experiment_id", experimentId);
    if (error) return failFrom(error);
  }
  revalidateProgram(programId);
  return ok(undefined, "Resultados guardados. Del dato al camino.");
}

/** Edita el aprendizaje de un ejercicio ya decidido. */
export async function updateLearning(
  programId: string,
  learningId: string,
  input: {
    text: string;
    appliesTo: string[];
    suggestedHypothesis?: string | null;
    lever?: string | null;
    channel?: string | null;
  },
): Promise<ActionResult> {
  const parsed = z
    .object({
      text: z.string().trim().min(10, "El aprendizaje debe tener al menos 10 caracteres."),
      appliesTo: z.array(uuid),
      suggestedHypothesis: z.string().trim().max(1000).optional().nullable(),
      lever: learningLeverSchema,
      channel: learningChannelSchema,
    })
    .safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const patch: Record<string, unknown> = {
    text: parsed.data.text,
    applies_to_line_ids: parsed.data.appliesTo,
    suggested_hypothesis: parsed.data.suggestedHypothesis || null,
  };
  // Solo si vienen (sin la migración K1 las columnas no existen).
  if (input.lever !== undefined) patch.lever = parsed.data.lever ?? null;
  if (input.channel !== undefined) patch.channel = parsed.data.channel ?? null;
  const { error } = await supabase.from("learnings").update(patch).eq("id", learningId);
  if (error) return failFrom(error);
  revalidateProgram(programId);
  return ok(undefined, "Aprendizaje actualizado. Eso está como bueno.");
}
