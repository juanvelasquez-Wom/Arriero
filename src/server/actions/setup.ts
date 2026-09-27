"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, fromZod, ok, toUserMessage, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import {
  calendarStepSchema,
  funnelStepSchema,
  horizonsStepSchema,
  linesStepSchema,
  northStarStepSchema,
  programStepSchema,
  quickStartSchema,
  treeStepSchema,
  type CalendarStepInput,
  type FunnelStepInput,
  type HorizonsStepInput,
  type NorthStarStepInput,
  type ProgramStepInput,
  type QuickStartFormInput,
  type TreeStepInput,
} from "@/lib/validation/setup";
import { horizonProblems } from "@/domain/growth-templates";
import { can } from "@/domain/permissions";
import { planQuickStart } from "@/domain/quick-start";
import { getActionActor, getSessionUser } from "@/server/auth";

// Acciones del asistente de configuración. Cada paso guarda en lote con la
// sesión del usuario (RLS decide) y avanza programs.setup_step.

type Supabase = Awaited<ReturnType<typeof createClient>>;
const uuid = z.string().uuid();

function revalidate(programId: string) {
  revalidatePath("/programas", "layout");
  revalidatePath(`/programas/${programId}`, "layout");
}

/** Solo avanza: volver a un paso anterior no borra el progreso. */
async function markStep(supabase: Supabase, programId: string, step: number) {
  const { data } = await supabase.from("programs").select("setup_step").eq("id", programId).maybeSingle();
  if ((data?.setup_step ?? 0) < step) await supabase.from("programs").update({ setup_step: step }).eq("id", programId);
}

async function requireEditor(programId: string) {
  if (!uuid.safeParse(programId).success) return null;
  const ctx = await getActionActor(programId);
  return ctx && can.editStructure(ctx.actor) ? ctx : null;
}

// 1 · Programa ----------------------------------------------------------------
export async function saveProgramStep(programId: string | null, input: ProgramStepInput): Promise<ActionResult<{ id: string }>> {
  const parsed = programStepSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const row = {
    name: parsed.data.name,
    description: parsed.data.description || null,
    start_date: parsed.data.start_date,
    end_date: parsed.data.end_date,
  };
  if (!programId) {
    const user = await getSessionUser();
    if (!user?.isAdmin) return fail("Solo un admin puede crear programas.");
    const { data, error } = await supabase.from("programs").insert({ ...row, setup_step: 1 }).select("id").single();
    if (error) return failFrom(error);
    revalidatePath("/programas", "layout");
    return ok({ id: data.id });
  }
  const ctx = await getActionActor(programId);
  if (!ctx || !can.editProgramSettings(ctx.actor)) return fail("Solo el owner o un admin edita los datos del programa.");
  const { error } = await supabase.from("programs").update(row).eq("id", programId);
  if (error) return failFrom(error);
  await markStep(supabase, programId, 1);
  revalidate(programId);
  return ok({ id: programId });
}

// 2 · Calendario ----------------------------------------------------------------
export async function saveCalendarStep(programId: string, input: CalendarStepInput): Promise<ActionResult> {
  const ctx = await getActionActor(programId);
  if (!ctx || !can.editCalendar(ctx.actor)) return fail("No tiene permiso para editar el calendario.");
  const parsed = calendarStepSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  if (parsed.data.events.filter((e) => e.type === "decision").length > 1) return fail("Defina un solo punto de decisión.");
  const supabase = await createClient();
  for (const id of parsed.data.removedIds) {
    const { error } = await supabase.rpc("delete_calendar_event", { p_id: id });
    if (error) return failFrom(error);
  }
  for (const e of parsed.data.events) {
    const row = { type: e.type, name: e.name, start_date: e.start_date, end_date: e.type === "decision" ? e.start_date : e.end_date };
    const { error } = e.id
      ? await supabase.from("calendar_events").update(row).eq("id", e.id)
      : await supabase.from("calendar_events").insert({ ...row, program_id: programId });
    if (error) return failFrom(error);
  }
  if (can.editProgramSettings(ctx.actor)) await markStep(supabase, programId, 2);
  revalidate(programId);
  return ok(undefined);
}

// 3 · Horizontes ----------------------------------------------------------------
export async function saveHorizonsStep(programId: string, input: HorizonsStepInput): Promise<ActionResult> {
  const ctx = await getActionActor(programId);
  if (!ctx || !can.editProgramSettings(ctx.actor)) return fail("Solo el owner o un admin define los horizontes.");
  const parsed = horizonsStepSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data: program } = await supabase.from("programs").select("start_date, end_date").eq("id", programId).single();
  if (!program?.start_date || !program?.end_date) return fail("Primero defina las fechas del programa.");
  const problems = horizonProblems({ start: program.start_date, end: program.end_date }, parsed.data.horizons);
  if (problems.length) return fail(problems.join(" "));

  const { data: existing } = await supabase.from("program_horizons").select("id").eq("program_id", programId);
  const keep = new Set(parsed.data.horizons.filter((h) => h.id).map((h) => h.id));
  const remove = (existing ?? []).filter((h) => !keep.has(h.id)).map((h) => h.id);
  if (remove.length) {
    const { error } = await supabase.from("program_horizons").delete().in("id", remove);
    if (error) return failFrom(error);
  }
  for (const [i, h] of parsed.data.horizons.entries()) {
    const row = { name: h.name, start_date: h.start_date, end_date: h.end_date, sort_order: i };
    const { error } = h.id
      ? await supabase.from("program_horizons").update(row).eq("id", h.id)
      : await supabase.from("program_horizons").insert({ ...row, program_id: programId });
    if (error) return failFrom(error);
  }
  await markStep(supabase, programId, 3);
  revalidate(programId);
  return ok(undefined);
}

// 4 · Líneas ----------------------------------------------------------------------
export async function saveLinesStep(programId: string, input: { create: string[] }): Promise<ActionResult> {
  const ctx = await requireEditor(programId);
  if (!ctx) return fail("No tiene permiso para editar las líneas.");
  const parsed = linesStepSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data: existing } = await supabase.from("business_lines").select("name").eq("program_id", programId);
  const names = new Set((existing ?? []).map((l) => l.name.trim().toLowerCase()));
  let order = existing?.length ?? 0;
  for (const name of parsed.data.create) {
    if (names.has(name.toLowerCase())) continue;
    const { error } = await supabase.from("business_lines").insert({ program_id: programId, name, sort_order: order++ });
    if (error) return failFrom(error);
    names.add(name.toLowerCase());
  }
  if (names.size === 0) return fail("Agregue al menos una línea de negocio.");
  if (can.editProgramSettings(ctx.actor)) await markStep(supabase, programId, 4);
  revalidate(programId);
  return ok(undefined);
}

// 5a · Métrica norte y eficiencia ---------------------------------------------------
async function upsertMetric(
  supabase: Supabase,
  lineId: string,
  type: "north_star" | "efficiency",
  m: NonNullable<z.output<typeof northStarStepSchema>["efficiency"]>,
): Promise<{ id?: string; error?: { message: string; code?: string } }> {
  const row = {
    name: m.name,
    unit: m.unit || null,
    direction: m.direction,
    definition: m.definition || null,
    baseline: m.baseline ?? null,
  };
  if (m.id) {
    const { error } = await supabase.from("metrics").update(row).eq("id", m.id);
    return error ? { error } : { id: m.id };
  }
  const { data, error } = await supabase
    .from("metrics")
    .insert({ ...row, line_id: lineId, type, sort_order: type === "north_star" ? 0 : 1 })
    .select("id")
    .single();
  return error ? { error } : { id: data.id };
}

async function saveTargets(supabase: Supabase, metricId: string, targets: Record<string, number | null>) {
  for (const [horizonId, target] of Object.entries(targets)) {
    if (!uuid.safeParse(horizonId).success) continue;
    const { error } =
      target == null
        ? await supabase.from("metric_targets").delete().eq("metric_id", metricId).eq("horizon_id", horizonId)
        : await supabase
            .from("metric_targets")
            .upsert({ metric_id: metricId, horizon_id: horizonId, target }, { onConflict: "metric_id,horizon_id" });
    if (error) return error;
  }
  return null;
}

export async function saveNorthStarStep(programId: string, lineId: string, input: NorthStarStepInput): Promise<ActionResult> {
  if (!(await requireEditor(programId))) return fail("No tiene permiso para editar las métricas.");
  const parsed = northStarStepSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const ns = await upsertMetric(supabase, lineId, "north_star", parsed.data.northStar);
  if (ns.error) return failFrom(ns.error);
  const nsTargets = await saveTargets(supabase, ns.id!, parsed.data.northTargets);
  if (nsTargets) return failFrom(nsTargets);
  if (parsed.data.efficiency) {
    const eff = await upsertMetric(supabase, lineId, "efficiency", parsed.data.efficiency);
    if (eff.error) return failFrom(eff.error);
    const effTargets = await saveTargets(supabase, eff.id!, parsed.data.efficiencyTargets);
    if (effTargets) return failFrom(effTargets);
  }
  revalidate(programId);
  return ok(undefined);
}

// 5b · Árbol de métricas ------------------------------------------------------------
export async function saveTreeStep(programId: string, lineId: string, input: TreeStepInput): Promise<ActionResult> {
  if (!(await requireEditor(programId))) return fail("No tiene permiso para editar las métricas.");
  const parsed = treeStepSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data: root } = await supabase
    .from("metrics")
    .select("id")
    .eq("line_id", lineId)
    .eq("type", "north_star")
    .maybeSingle();
  if (!root) return fail("Primero defina la métrica norte de esta línea.");
  for (const id of parsed.data.removedIds) {
    const { error } = await supabase.rpc("delete_metric", { p_id: id, p_strategy: null, p_target: null });
    if (error) return failFrom(error);
  }
  for (const [i, m] of parsed.data.metrics.entries()) {
    const row = {
      name: m.name,
      unit: m.unit || null,
      direction: m.direction,
      definition: m.definition || null,
      baseline: m.baseline ?? null,
      branch: m.branch,
      sort_order: i,
    };
    const { error } = m.id
      ? await supabase.from("metrics").update(row).eq("id", m.id)
      : await supabase.from("metrics").insert({ ...row, line_id: lineId, type: "input", parent_id: root.id });
    if (error) return failFrom(error);
  }
  if (!parsed.data.metrics.length) return fail("Agregue al menos una métrica de entrada: son las que los ejercicios pueden mover.");
  revalidate(programId);
  return ok(undefined);
}

// 5c · Embudo ------------------------------------------------------------------------
export async function saveFunnelStep(programId: string, lineId: string, input: FunnelStepInput): Promise<ActionResult> {
  if (!(await requireEditor(programId))) return fail("No tiene permiso para editar el embudo.");
  const parsed = funnelStepSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  for (const s of parsed.data.stages) {
    const { error } = await supabase
      .from("funnel_stages")
      .update({ name: s.name, description: s.description || null, metric_id: s.metric_id ?? null })
      .eq("id", s.id)
      .eq("line_id", lineId);
    if (error) return failFrom(error);
  }
  revalidate(programId);
  return ok(undefined);
}

// Cierre -------------------------------------------------------------------------------
export async function finishSetup(programId: string): Promise<ActionResult> {
  const ctx = await getActionActor(programId);
  if (!ctx || !can.editProgramSettings(ctx.actor)) return fail("Solo el owner o un admin cierra la configuración.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("programs")
    .update({ setup_step: 5, setup_completed_at: new Date().toISOString() })
    .eq("id", programId);
  if (error) return failFrom(error);
  revalidate(programId);
  return ok(undefined, "¡Ave María, qué belleza! Programa configurado.");
}

// Arranque rápido ------------------------------------------------------------------------
export interface QuickStartResult {
  programId: string;
  /** A dónde seguir: "Nuevo problema" si todo quedó, o el asistente para completar lo que faltó. */
  href: string;
  /** Si algo falló después de crear el programa: qué faltó (el programa ya existe y se retoma en Configuración). */
  partialError?: string;
}

/**
 * Crea en una sola pasada lo que el asistente completo arma paso a paso. Escribe
 * en el mismo orden del asistente y avanza setup_step en cada bloque: si algo
 * falla a mitad de camino, el programa queda usable y `resumeStep` retoma donde
 * quedó.
 */
export async function saveQuickStart(input: QuickStartFormInput): Promise<ActionResult<QuickStartResult>> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return fail("Solo un admin puede crear programas.");
  const parsed = quickStartSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const planned = planQuickStart(parsed.data);
  if (!planned.ok) return fail(planned.error);
  const { plan } = planned;
  const supabase = await createClient();

  // 1 · Programa (el trigger deja al creador como owner).
  const { data: program, error: programError } = await supabase
    .from("programs")
    .insert({ ...plan.program, description: null, setup_step: 1 })
    .select("id")
    .single();
  if (programError) return failFrom(programError);
  const programId = program.id;
  const setStep = (step: number) => supabase.from("programs").update({ setup_step: step }).eq("id", programId);

  const partial = (what: string, error: { message?: string; code?: string } | null): ActionResult<QuickStartResult> => {
    revalidate(programId);
    return ok({
      programId,
      href: `/programas/${programId}/configuracion`,
      partialError: `El programa quedó creado, pero no se pudo guardar ${what}: ${toUserMessage(error)} Complételo en Configuración, que ya lo tiene a medio camino.`,
    });
  };

  // 2 · Calendario típico de telco.
  if (plan.events.length) {
    const { error } = await supabase.from("calendar_events").insert(plan.events.map((e) => ({ ...e, program_id: programId })));
    if (error) return partial("el calendario comercial", error);
  }
  let { error } = await setStep(2);
  if (error) return partial("el avance de la configuración", error);

  // 3 · Horizontes.
  ({ error } = await supabase
    .from("program_horizons")
    .insert(plan.horizons.map((h, i) => ({ ...h, sort_order: i, program_id: programId }))));
  if (error) return partial("los horizontes", error);
  ({ error } = await setStep(3));
  if (error) return partial("el avance de la configuración", error);

  // 4 · Línea (el trigger le crea las cuatro etapas del embudo).
  const { data: line, error: lineError } = await supabase
    .from("business_lines")
    .insert({ program_id: programId, name: plan.line.name, sort_order: 0 })
    .select("id")
    .single();
  if (lineError) return partial("la línea de negocio", lineError);
  ({ error } = await setStep(4));
  if (error) return partial("el avance de la configuración", error);

  // 5a · Métrica norte y eficiencia (sin línea base ni metas todavía).
  const metricRow = (m: typeof plan.northStar) => ({ name: m.name, unit: m.unit || null, direction: m.direction, definition: m.definition || null });
  const { data: north, error: northError } = await supabase
    .from("metrics")
    .insert({ ...metricRow(plan.northStar), line_id: line.id, type: "north_star", sort_order: 0 })
    .select("id")
    .single();
  if (northError) return partial("la métrica norte", northError);
  ({ error } = await supabase
    .from("metrics")
    .insert({ ...metricRow(plan.efficiency), line_id: line.id, type: "efficiency", sort_order: 1 }));
  if (error) return partial("la métrica de eficiencia", error);

  // 5b · Árbol de métricas.
  const { data: inputs, error: treeError } = await supabase
    .from("metrics")
    .insert(
      plan.tree.map((m) => ({
        ...metricRow(m),
        branch: m.branch,
        sort_order: m.sort_order,
        line_id: line.id,
        type: "input" as const,
        parent_id: north.id,
      })),
    )
    .select("id, name");
  if (treeError) return partial("el árbol de métricas", treeError);

  // 5c · Embudo: descripción y métrica de cada etapa según la plantilla.
  const { data: stages, error: stagesError } = await supabase.from("funnel_stages").select("id, name").eq("line_id", line.id);
  if (stagesError) return partial("el embudo", stagesError);
  const metricId = new Map((inputs ?? []).map((m) => [m.name.trim().toLowerCase(), m.id]));
  for (const s of stages ?? []) {
    const p = plan.funnel.find((f) => f.name.toLowerCase() === s.name.trim().toLowerCase());
    if (!p) continue;
    ({ error } = await supabase
      .from("funnel_stages")
      .update({ description: p.description, metric_id: p.metricName ? (metricId.get(p.metricName.toLowerCase()) ?? null) : null })
      .eq("id", s.id));
    if (error) return partial("el embudo", error);
  }

  // Cierre, como finishSetup.
  ({ error } = await supabase
    .from("programs")
    .update({ setup_step: 5, setup_completed_at: new Date().toISOString() })
    .eq("id", programId));
  if (error) return partial("el cierre de la configuración", error);

  revalidate(programId);
  return ok(
    { programId, href: `/programas/${programId}/problemas/nuevo?linea=${line.id}&desde=arranque` },
    "Ya tiene el mapa. Ahora cuéntele a Arriero dónde se pierde valor.",
  );
}
