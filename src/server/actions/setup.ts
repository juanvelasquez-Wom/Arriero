"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, fromZod, ok, toUserMessage, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import {
  calendarStepSchema,
  horizonsStepSchema,
  lineStepSchema,
  linesStepSchema,
  northStarStepSchema,
  programStepSchema,
  quickStartSchema,
  scheduleStepSchema,
  type LineStepInput,
  type ProgramStepInput,
  type QuickStartFormInput,
  type ScheduleStepInput,
} from "@/lib/validation/setup";
import { horizonProblems } from "@/domain/growth-templates";
import { can } from "@/domain/permissions";
import { planQuickStart, type PlannedLine } from "@/domain/quick-start";
import { getActionActor, getSessionUser } from "@/server/auth";

// Acciones del asistente de configuración. Cada paso guarda en lote con la
// sesión del usuario (RLS decide) y avanza programs.setup_step
// (ver src/domain/setup-flow.ts: 1 programa · 3 calendario y horizontes ·
// 4 líneas · 5 cierre).

type Supabase = Awaited<ReturnType<typeof createClient>>;
type DbError = { message?: string; code?: string } | null;
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

// 2 · Calendario y horizontes (un solo paso) ------------------------------------
async function writeCalendar(supabase: Supabase, programId: string, input: z.output<typeof calendarStepSchema>): Promise<ActionResult> {
  if (input.events.filter((e) => e.type === "decision").length > 1) return fail("Defina un solo punto de decisión.");
  for (const id of input.removedIds) {
    const { error } = await supabase.rpc("delete_calendar_event", { p_id: id });
    if (error) return failFrom(error);
  }
  for (const e of input.events) {
    const row = { type: e.type, name: e.name, start_date: e.start_date, end_date: e.type === "decision" ? e.start_date : e.end_date };
    const { error } = e.id
      ? await supabase.from("calendar_events").update(row).eq("id", e.id)
      : await supabase.from("calendar_events").insert({ ...row, program_id: programId });
    if (error) return failFrom(error);
  }
  return ok(undefined);
}

async function writeHorizons(supabase: Supabase, programId: string, input: z.output<typeof horizonsStepSchema>): Promise<ActionResult> {
  const { data: existing } = await supabase.from("program_horizons").select("id").eq("program_id", programId);
  const keep = new Set(input.horizons.filter((h) => h.id).map((h) => h.id));
  const remove = (existing ?? []).filter((h) => !keep.has(h.id)).map((h) => h.id);
  if (remove.length) {
    const { error } = await supabase.from("program_horizons").delete().in("id", remove);
    if (error) return failFrom(error);
  }
  for (const [i, h] of input.horizons.entries()) {
    const row = { name: h.name, start_date: h.start_date, end_date: h.end_date, sort_order: i };
    const { error } = h.id
      ? await supabase.from("program_horizons").update(row).eq("id", h.id)
      : await supabase.from("program_horizons").insert({ ...row, program_id: programId });
    if (error) return failFrom(error);
  }
  return ok(undefined);
}

/**
 * Guarda el calendario y, si quien guarda es owner/admin, los horizontes (que la
 * pantalla propone desde el punto de decisión). Con ambos guardados marca
 * setup_step 3. Un colaborador solo guarda el calendario.
 */
export async function saveScheduleStep(programId: string, input: ScheduleStepInput): Promise<ActionResult> {
  if (!uuid.safeParse(programId).success) return fail("El programa no existe.");
  const ctx = await getActionActor(programId);
  if (!ctx || !can.editCalendar(ctx.actor)) return fail("No tiene permiso para editar el calendario.");
  const parsed = scheduleStepSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const manage = can.editProgramSettings(ctx.actor);
  const horizons = manage ? parsed.data.horizons : null;
  const supabase = await createClient();

  // Primero se validan los horizontes, para no dejar el calendario guardado a medias.
  if (horizons) {
    const { data: program } = await supabase.from("programs").select("start_date, end_date").eq("id", programId).single();
    if (!program?.start_date || !program?.end_date) return fail("Primero defina las fechas del programa.");
    const problems = horizonProblems({ start: program.start_date, end: program.end_date }, horizons.horizons);
    if (problems.length) return fail(problems.join(" "));
  }
  const cal = await writeCalendar(supabase, programId, parsed.data.calendar);
  if (!cal.ok) return cal;
  if (horizons) {
    const hz = await writeHorizons(supabase, programId, horizons);
    if (!hz.ok) return hz;
    await markStep(supabase, programId, 3);
  }
  revalidate(programId);
  return ok(undefined);
}

// 3 · Líneas ----------------------------------------------------------------------
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

// 4 · Configurar {línea}: métrica norte y eficiencia, árbol y embudo -----------------
async function upsertMetric(
  supabase: Supabase,
  lineId: string,
  type: "north_star" | "efficiency",
  m: NonNullable<z.output<typeof northStarStepSchema>["efficiency"]>,
): Promise<{ id?: string; error?: DbError }> {
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

/**
 * Guarda la pantalla de una línea en orden: norte y eficiencia (línea base y
 * metas son opcionales y quedan en los pendientes), árbol colgado de la norte y
 * embudo. Las etapas referencian la métrica por nombre porque puede ser nueva en
 * este mismo guardado.
 */
export async function saveLineStep(programId: string, lineId: string, input: LineStepInput): Promise<ActionResult> {
  if (!uuid.safeParse(lineId).success) return fail("La línea no existe.");
  if (!(await requireEditor(programId))) return fail("No tiene permiso para editar las métricas.");
  const parsed = lineStepSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const { north, tree, funnel } = parsed.data;
  const supabase = await createClient();
  const { data: line } = await supabase.from("business_lines").select("id").eq("id", lineId).eq("program_id", programId).maybeSingle();
  if (!line) return fail("La línea no existe o fue borrada.");

  // Métrica norte y eficiencia.
  const ns = await upsertMetric(supabase, lineId, "north_star", north.northStar);
  if (ns.error || !ns.id) return failFrom(ns.error);
  const nsTargets = await saveTargets(supabase, ns.id, north.northTargets);
  if (nsTargets) return failFrom(nsTargets);
  if (north.efficiency) {
    const eff = await upsertMetric(supabase, lineId, "efficiency", north.efficiency);
    if (eff.error || !eff.id) return failFrom(eff.error);
    const effTargets = await saveTargets(supabase, eff.id, north.efficiencyTargets);
    if (effTargets) return failFrom(effTargets);
  }

  // Árbol.
  for (const id of tree.removedIds) {
    const { error } = await supabase.rpc("delete_metric", { p_id: id, p_strategy: null, p_target: null });
    if (error) return failFrom(error);
  }
  for (const [i, m] of tree.metrics.entries()) {
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
      : await supabase.from("metrics").insert({ ...row, line_id: lineId, type: "input", parent_id: ns.id });
    if (error) return failFrom(error);
  }

  // Embudo.
  const { data: inputs, error: inputsError } = await supabase.from("metrics").select("id, name").eq("line_id", lineId).eq("type", "input");
  if (inputsError) return failFrom(inputsError);
  const byName = new Map((inputs ?? []).map((m) => [m.name.trim().toLowerCase(), m.id]));
  for (const s of funnel.stages) {
    const metricId = s.metricName ? (byName.get(s.metricName.trim().toLowerCase()) ?? null) : null;
    const { error } = await supabase
      .from("funnel_stages")
      .update({ name: s.name, description: s.description || null, metric_id: metricId })
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

const metricRow = (m: PlannedLine["northStar"]) => ({ name: m.name, unit: m.unit || null, direction: m.direction, definition: m.definition || null });

/** Métrica norte, eficiencia, árbol y embudo de una línea del plan. Devuelve qué falló, si algo falló. */
async function writePlannedLine(supabase: Supabase, lineId: string, plan: PlannedLine): Promise<{ what: string; error: DbError } | null> {
  // Métrica norte y eficiencia (sin línea base ni metas todavía).
  const { data: north, error: northError } = await supabase
    .from("metrics")
    .insert({ ...metricRow(plan.northStar), line_id: lineId, type: "north_star", sort_order: 0 })
    .select("id")
    .single();
  if (northError) return { what: "la métrica norte", error: northError };
  const { error: effError } = await supabase
    .from("metrics")
    .insert({ ...metricRow(plan.efficiency), line_id: lineId, type: "efficiency", sort_order: 1 });
  if (effError) return { what: "la métrica de eficiencia", error: effError };

  // Árbol de métricas.
  const { data: inputs, error: treeError } = await supabase
    .from("metrics")
    .insert(
      plan.tree.map((m) => ({
        ...metricRow(m),
        branch: m.branch,
        sort_order: m.sort_order,
        line_id: lineId,
        type: "input" as const,
        parent_id: north.id,
      })),
    )
    .select("id, name");
  if (treeError) return { what: "el árbol de métricas", error: treeError };

  // Embudo: descripción y métrica de cada etapa según la plantilla.
  const { data: stages, error: stagesError } = await supabase.from("funnel_stages").select("id, name").eq("line_id", lineId);
  if (stagesError) return { what: "el embudo", error: stagesError };
  const metricId = new Map((inputs ?? []).map((m) => [m.name.trim().toLowerCase(), m.id]));
  for (const s of stages ?? []) {
    const p = plan.funnel.find((f) => f.name.toLowerCase() === s.name.trim().toLowerCase());
    if (!p) continue;
    const { error } = await supabase
      .from("funnel_stages")
      .update({ description: p.description, metric_id: p.metricName ? (metricId.get(p.metricName.toLowerCase()) ?? null) : null })
      .eq("id", s.id);
    if (error) return { what: "el embudo", error };
  }
  return null;
}

/**
 * Crea en una sola pasada lo que el asistente arma paso a paso. Escribe en el
 * mismo orden del asistente y avanza setup_step en cada bloque: si algo falla a
 * mitad de camino, el programa queda usable y `resumeStep` retoma donde quedó.
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

  const partial = (what: string, error: DbError): ActionResult<QuickStartResult> => {
    revalidate(programId);
    return ok({
      programId,
      href: `/programas/${programId}/configuracion`,
      partialError: `El programa quedó creado, pero no se pudo guardar ${what}: ${toUserMessage(error)} Complételo en Configuración, que ya lo tiene a medio camino.`,
    });
  };

  // 2 · Calendario típico de telco y horizontes (setup_step 3, como el asistente).
  if (plan.events.length) {
    const { error } = await supabase.from("calendar_events").insert(plan.events.map((e) => ({ ...e, program_id: programId })));
    if (error) return partial("el calendario comercial", error);
  }
  let { error } = await supabase
    .from("program_horizons")
    .insert(plan.horizons.map((h, i) => ({ ...h, sort_order: i, program_id: programId })));
  if (error) return partial("los horizontes", error);
  ({ error } = await setStep(3));
  if (error) return partial("el avance de la configuración", error);

  // 3 · Líneas (el trigger le crea a cada una las cuatro etapas del embudo).
  const { data: lines, error: linesError } = await supabase
    .from("business_lines")
    .insert(plan.lines.map((l, i) => ({ program_id: programId, name: l.name, sort_order: i })))
    .select("id, name");
  if (linesError) return partial("las líneas de negocio", linesError);
  ({ error } = await setStep(4));
  if (error) return partial("el avance de la configuración", error);
  const lineId = new Map((lines ?? []).map((l) => [l.name.trim().toLowerCase(), l.id]));

  // 4 · Cada línea con su norte, eficiencia, árbol y embudo.
  for (const planned of plan.lines) {
    const id = lineId.get(planned.name.trim().toLowerCase());
    if (!id) return partial(`la línea ${planned.name}`, null);
    const failed = await writePlannedLine(supabase, id, planned);
    if (failed) return partial(`${failed.what} de ${planned.name}`, failed.error);
  }

  // Cierre, como finishSetup.
  ({ error } = await supabase
    .from("programs")
    .update({ setup_step: 5, setup_completed_at: new Date().toISOString() })
    .eq("id", programId));
  if (error) return partial("el cierre de la configuración", error);

  revalidate(programId);
  const first = lineId.get(plan.lines[0].name.trim().toLowerCase());
  return ok(
    { programId, href: `/programas/${programId}/problemas/nuevo?linea=${first}&desde=arranque` },
    "Ya tiene el mapa. Ahora cuéntele a Arriero dónde se pierde valor.",
  );
}
