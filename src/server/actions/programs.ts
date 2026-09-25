"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import {
  calendarEventSchema,
  lineSchema,
  programBasicsSchema,
  scoringSchema,
  type CalendarEventInput,
  type ProgramBasicsInput,
  type ScoringInput,
} from "@/lib/validation/programs";
import { can } from "@/domain/permissions";
import { getActionActor, getSessionUser } from "@/server/auth";

const uuid = z.string().uuid();

function revalidateProgram(programId: string) {
  revalidatePath("/programas", "layout");
  revalidatePath(`/programas/${programId}`, "layout");
}

async function saveHorizons(
  supabase: Awaited<ReturnType<typeof createClient>>,
  programId: string,
  horizons: z.output<typeof programBasicsSchema>["horizons"],
) {
  const { data: existing, error } = await supabase.from("program_horizons").select("id").eq("program_id", programId);
  if (error) return error;
  const keep = new Set(horizons.filter((h) => h.id).map((h) => h.id));
  const toDelete = (existing ?? []).filter((h) => !keep.has(h.id)).map((h) => h.id);
  if (toDelete.length) {
    const { error: e } = await supabase.from("program_horizons").delete().in("id", toDelete);
    if (e) return e;
  }
  for (const [i, h] of horizons.entries()) {
    const row = { name: h.name, start_date: h.start_date, end_date: h.end_date, sort_order: i };
    const { error: e } = h.id
      ? await supabase.from("program_horizons").update(row).eq("id", h.id)
      : await supabase.from("program_horizons").insert({ ...row, program_id: programId });
    if (e) return e;
  }
  return null;
}

/** Paso 1 del asistente para un programa nuevo (solo admin). */
export async function createProgram(input: ProgramBasicsInput): Promise<ActionResult<{ id: string }>> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return fail("Solo un admin puede crear programas.");
  const parsed = programBasicsSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("programs")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description || null,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      setup_step: 1,
    })
    .select("id")
    .single();
  if (error) return failFrom(error);
  const hError = await saveHorizons(supabase, data.id, parsed.data.horizons);
  if (hError) return failFrom(hError);
  revalidatePath("/programas", "layout");
  return ok({ id: data.id }, "Programa creado.");
}

export async function updateProgramBasics(programId: string, input: ProgramBasicsInput): Promise<ActionResult> {
  const ctx = await getActionActor(programId);
  if (!ctx || !can.editProgramSettings(ctx.actor)) return fail("Solo el owner o un admin puede editar los datos del programa.");
  const parsed = programBasicsSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("programs")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
    })
    .eq("id", programId);
  if (error) return failFrom(error);
  const hError = await saveHorizons(supabase, programId, parsed.data.horizons);
  if (hError) return failFrom(hError);
  revalidateProgram(programId);
  return ok(undefined, "Datos guardados.");
}

/** Guarda hasta qué paso llegó el asistente (para retomarlo). */
export async function advanceSetup(programId: string, step: number): Promise<ActionResult> {
  const ctx = await getActionActor(programId);
  if (!ctx) return fail("No tienes acceso a este programa.");
  if (!can.editProgramSettings(ctx.actor)) return ok(undefined); // otros roles navegan sin guardar progreso
  const supabase = await createClient();
  const { data: current } = await supabase.from("programs").select("setup_step").eq("id", programId).maybeSingle();
  const next = Math.min(5, Math.max(step, current?.setup_step ?? 0));
  const { error } = await supabase.from("programs").update({ setup_step: next }).eq("id", programId);
  if (error) return failFrom(error);
  revalidateProgram(programId);
  return ok(undefined);
}

export async function updateScoring(programId: string, input: ScoringInput, finish = false): Promise<ActionResult> {
  const ctx = await getActionActor(programId);
  if (!ctx || !can.editProgramSettings(ctx.actor)) return fail("Solo el owner o un admin puede cambiar el puntaje.");
  const parsed = scoringSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const update: Record<string, unknown> = { scoring_config: parsed.data };
  if (finish) {
    update.setup_step = 5;
    update.setup_completed_at = new Date().toISOString();
  }
  const { error } = await supabase.from("programs").update(update).eq("id", programId);
  if (error) return failFrom(error);
  revalidateProgram(programId);
  return ok(undefined, finish ? "Configuración completa." : "Puntaje guardado.");
}

// ---------------------------------------------------------------------------
// Líneas
// ---------------------------------------------------------------------------
export async function createLine(programId: string, input: { name: string }): Promise<ActionResult<{ id: string }>> {
  const ctx = await getActionActor(programId);
  if (!ctx || !can.editStructure(ctx.actor)) return fail("No tienes permiso para editar las líneas.");
  const parsed = lineSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { count } = await supabase
    .from("business_lines")
    .select("id", { count: "exact", head: true })
    .eq("program_id", programId);
  const { data, error } = await supabase
    .from("business_lines")
    .insert({ program_id: programId, name: parsed.data.name, sort_order: count ?? 0 })
    .select("id")
    .single();
  if (error) return failFrom(error);
  revalidateProgram(programId);
  return ok({ id: data.id }, "Línea creada con las cuatro etapas por defecto del embudo.");
}

export async function renameLine(programId: string, lineId: string, input: { name: string }): Promise<ActionResult> {
  const ctx = await getActionActor(programId);
  if (!ctx || !can.editStructure(ctx.actor)) return fail("No tienes permiso para editar las líneas.");
  const parsed = lineSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("business_lines").update({ name: parsed.data.name }).eq("id", lineId);
  if (error) return failFrom(error);
  revalidateProgram(programId);
  return ok(undefined);
}

export async function moveLine(programId: string, lineId: string, direction: "up" | "down"): Promise<ActionResult> {
  const ctx = await getActionActor(programId);
  if (!ctx || !can.editStructure(ctx.actor)) return fail("No tienes permiso para editar las líneas.");
  const supabase = await createClient();
  const { data: lines, error } = await supabase
    .from("business_lines")
    .select("id")
    .eq("program_id", programId)
    .order("sort_order")
    .order("created_at");
  if (error) return failFrom(error);
  const ids = (lines ?? []).map((l) => l.id);
  const i = ids.indexOf(lineId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return ok(undefined);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  for (const [order, id] of ids.entries()) {
    const { error: e } = await supabase.from("business_lines").update({ sort_order: order }).eq("id", id);
    if (e) return failFrom(e);
  }
  revalidateProgram(programId);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Calendario
// ---------------------------------------------------------------------------
export async function saveCalendarEvent(
  programId: string,
  eventId: string | null,
  input: CalendarEventInput,
): Promise<ActionResult> {
  const ctx = await getActionActor(programId);
  if (!ctx || !can.editCalendar(ctx.actor)) return fail("No tienes permiso para editar el calendario.");
  const parsed = calendarEventSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  if (eventId && !uuid.safeParse(eventId).success) return fail("Evento inválido.");
  const row = parsed.data.type === "decision" ? { ...parsed.data, end_date: parsed.data.start_date } : parsed.data;
  const supabase = await createClient();
  const { error } = eventId
    ? await supabase.from("calendar_events").update(row).eq("id", eventId)
    : await supabase.from("calendar_events").insert({ ...row, program_id: programId });
  if (error) return failFrom(error);
  revalidateProgram(programId);
  return ok(undefined, "Calendario actualizado.");
}
