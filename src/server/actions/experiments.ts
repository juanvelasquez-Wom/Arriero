"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import {
  decideSchema,
  experimentDraftSchema,
  resultsSchema,
  transitionSchema,
  type DecideInput,
  type ExperimentDraftInput,
} from "@/lib/validation/experiments";
import { can } from "@/domain/permissions";
import { getActionActor } from "@/server/auth";

const uuid = z.string().uuid();

function revalidateProgram(programId: string) {
  revalidatePath(`/programas/${programId}`, "layout");
}

/**
 * Sincroniza las variantes del borrador (solo si el diseño no está bloqueado).
 * Devuelve los ids en el mismo orden para que el asistente no las duplique.
 */
async function syncVariants(
  supabase: Awaited<ReturnType<typeof createClient>>,
  experimentId: string,
  variants: NonNullable<ExperimentDraftInput["variants"]>,
): Promise<{ error: { message: string; code?: string } | null; ids: string[] }> {
  const ids: string[] = [];
  const { data: existing, error } = await supabase
    .from("experiment_variants")
    .select("id")
    .eq("experiment_id", experimentId);
  if (error) return { error, ids };
  const keep = new Set(variants.filter((v) => v.id).map((v) => v.id!));
  for (const row of existing ?? []) {
    if (!keep.has(row.id)) {
      const { error: delError } = await supabase.rpc("delete_variant", { p_id: row.id });
      if (delError) return { error: delError, ids };
    }
  }
  // Primero quitar la marca de control a las que la pierden (índice único parcial).
  for (const v of variants.filter((x) => x.id && !x.is_control)) {
    const { error: e } = await supabase.from("experiment_variants").update({ is_control: false }).eq("id", v.id!);
    if (e) return { error: e, ids };
  }
  for (const [i, v] of variants.entries()) {
    const row = { name: v.name, is_control: v.is_control, description: v.description ?? null, sort_order: i };
    if (v.id) {
      const { error: e } = await supabase.from("experiment_variants").update(row).eq("id", v.id);
      if (e) return { error: e, ids };
      ids.push(v.id);
    } else {
      const { data, error: e } = await supabase
        .from("experiment_variants")
        .insert({ ...row, experiment_id: experimentId })
        .select("id")
        .single();
      if (e) return { error: e, ids };
      ids.push(data.id);
    }
  }
  return { error: null, ids };
}

function draftRow(d: z.output<typeof experimentDraftSchema>, allowScoring: boolean) {
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

/** Crea el ejercicio como borrador (Idea). Se puede llamar desde cualquier paso. */
export async function createExperiment(programId: string, input: ExperimentDraftInput): Promise<ActionResult<{ id: string; variantIds?: string[] }>> {
  if (!uuid.safeParse(programId).success) return fail("Programa inválido.");
  const ctx = await getActionActor(programId);
  if (!ctx) return fail("Su sesión venció o no tiene acceso a este programa.");
  if (!can.createExperiment(ctx.actor)) return fail("Su rol no puede crear ejercicios.");
  const parsed = experimentDraftSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const row = draftRow(parsed.data, can.scoreIce(ctx.actor));
  // La agencia que crea un ejercicio queda como responsable (así puede seguir editándolo).
  if (!can.scoreIce(ctx.actor)) {
    row.owner_id = ctx.user.id;
    row.owner_type = "agency";
  }
  const { data: problem } = await supabase.from("problems").select("line_id").eq("id", parsed.data.problem_id).maybeSingle();
  if (!problem) return fail("El problema no existe o fue borrado.");
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
  revalidateProgram(programId);
  return ok({ id: data.id, variantIds }, "Borrador guardado. Ahí vamos.");
}

export async function updateExperiment(
  programId: string,
  experimentId: string,
  input: ExperimentDraftInput,
): Promise<ActionResult<{ id: string; variantIds?: string[] }>> {
  if (!uuid.safeParse(programId).success || !uuid.safeParse(experimentId).success) return fail("Ejercicio inválido.");
  const ctx = await getActionActor(programId);
  if (!ctx) return fail("Su sesión venció o no tiene acceso a este programa.");
  const parsed = experimentDraftSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("experiments")
    .select("owner_id, design_locked_at")
    .eq("id", experimentId)
    .maybeSingle();
  if (!current) return fail("El ejercicio no existe o fue borrado.");
  if (!can.editExperiment(ctx.actor, current)) return fail("No tiene permiso para editar este ejercicio.");

  const row = draftRow(parsed.data, can.scoreIce(ctx.actor));
  if (current.design_locked_at) {
    for (const k of ["test_type", "primary_metric", "control_metrics", "min_duration_days", "decision_rule", "metric_id"]) delete row[k];
  }
  const { error } = await supabase.from("experiments").update(row).eq("id", experimentId);
  if (error) return failFrom(error);

  let variantIds: string[] | undefined;
  if (parsed.data.variants && !current.design_locked_at) {
    const synced = await syncVariants(supabase, experimentId, parsed.data.variants);
    if (synced.error) return failFrom(synced.error);
    variantIds = synced.ids;
  }
  revalidateProgram(programId);
  return ok({ id: experimentId, variantIds }, "Cambios guardados.");
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
  revalidateProgram(d.programId);
  return ok(undefined, "¡Qué berraquera! Ejercicio decidido.");
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
    const { error } = await supabase
      .from("experiment_variants")
      .update({ sample: v.sample ?? null, conversions: v.conversions ?? null, metric_value: v.metric_value ?? null, notes: v.notes })
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
  input: { text: string; appliesTo: string[]; suggestedHypothesis?: string | null },
): Promise<ActionResult> {
  const parsed = z
    .object({
      text: z.string().trim().min(10, "El aprendizaje debe tener al menos 10 caracteres."),
      appliesTo: z.array(uuid),
      suggestedHypothesis: z.string().trim().max(1000).optional().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("learnings")
    .update({
      text: parsed.data.text,
      applies_to_line_ids: parsed.data.appliesTo,
      suggested_hypothesis: parsed.data.suggestedHypothesis || null,
    })
    .eq("id", learningId);
  if (error) return failFrom(error);
  revalidateProgram(programId);
  return ok(undefined, "Aprendizaje actualizado. Eso está como bueno.");
}
