"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { moveSchema, stageSchema, type MoveInput, type StageInput } from "@/lib/validation/structure";
import { moveWithinSiblings, nextSortOrder, sortSiblings } from "@/domain/metric-tree";
import { can } from "@/domain/permissions";
import { getActionActor } from "@/server/auth";

const uuid = z.string().uuid();

function revalidateProgram(programId: string) {
  revalidatePath(`/programas/${programId}`, "layout");
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function requireEditor(programId: string): Promise<ActionResult<never> | null> {
  if (!uuid.safeParse(programId).success) return fail("Programa inválido.");
  const ctx = await getActionActor(programId);
  if (!ctx) return fail("Su sesión venció o no tiene acceso a este programa.");
  if (!can.editStructure(ctx.actor)) return fail("Su rol no puede editar el embudo.");
  return null;
}

async function loadStages(supabase: Supabase, lineId: string) {
  const { data, error } = await supabase
    .from("funnel_stages")
    .select("id, sort_order")
    .eq("line_id", lineId)
    .order("sort_order")
    .order("created_at");
  if (error) return { error } as const;
  return { data: sortSiblings((data ?? []).map((r) => ({ id: r.id as string, sort_order: Number(r.sort_order) }))) } as const;
}

async function metricBelongsToLine(supabase: Supabase, metricId: string | null, lineId: string) {
  if (!metricId) return true;
  const { data } = await supabase.from("metrics").select("id").eq("id", metricId).eq("line_id", lineId).maybeSingle();
  return !!data;
}

export async function createStage(programId: string, input: StageInput): Promise<ActionResult<{ id: string }>> {
  const denied = await requireEditor(programId);
  if (denied) return denied;
  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { data: line } = await supabase
    .from("business_lines")
    .select("id")
    .eq("id", v.line_id)
    .eq("program_id", programId)
    .maybeSingle();
  if (!line) return fail("La línea no existe o fue borrada.");
  if (!(await metricBelongsToLine(supabase, v.metric_id, v.line_id))) {
    return fail("La métrica vinculada debe ser de esta línea.", { metric_id: ["Elija una métrica de esta línea."] });
  }
  const stages = await loadStages(supabase, v.line_id);
  if (stages.error) return failFrom(stages.error);

  const { data, error } = await supabase
    .from("funnel_stages")
    .insert({
      line_id: v.line_id,
      name: v.name,
      description: v.description,
      metric_id: v.metric_id,
      sort_order: nextSortOrder(stages.data),
    })
    .select("id")
    .single();
  if (error) return failFrom(error);
  revalidateProgram(programId);
  return ok({ id: data.id as string }, "Etapa creada. Ahí vamos.");
}

export async function updateStage(
  programId: string,
  stageId: string,
  input: StageInput,
): Promise<ActionResult<{ id: string }>> {
  if (!uuid.safeParse(stageId).success) return fail("Etapa inválida.");
  const denied = await requireEditor(programId);
  if (denied) return denied;
  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("funnel_stages")
    .select("id, line_id")
    .eq("id", stageId)
    .eq("program_id", programId)
    .maybeSingle();
  if (!current) return fail("La etapa no existe o fue borrada.");
  if (!(await metricBelongsToLine(supabase, v.metric_id, current.line_id as string))) {
    return fail("La métrica vinculada debe ser de esta línea.", { metric_id: ["Elija una métrica de esta línea."] });
  }
  const { error } = await supabase
    .from("funnel_stages")
    .update({ name: v.name, description: v.description, metric_id: v.metric_id })
    .eq("id", stageId);
  if (error) return failFrom(error);
  revalidateProgram(programId);
  return ok({ id: stageId }, "Cambios guardados.");
}

/** Sube o baja una etapa dentro del embudo de su línea. */
export async function moveStage(programId: string, input: MoveInput): Promise<ActionResult> {
  const denied = await requireEditor(programId);
  if (denied) return denied;
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return fail("Movimiento inválido.");

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("funnel_stages")
    .select("id, line_id")
    .eq("id", parsed.data.id)
    .eq("program_id", programId)
    .maybeSingle();
  if (!current) return fail("La etapa no existe o fue borrada.");

  const stages = await loadStages(supabase, current.line_id as string);
  if (stages.error) return failFrom(stages.error);
  const updates = moveWithinSiblings(stages.data, parsed.data.id, parsed.data.direction);
  if (!updates) return fail(parsed.data.direction === "up" ? "Ya es la primera etapa." : "Ya es la última etapa.");
  for (const u of updates) {
    const { error } = await supabase.from("funnel_stages").update({ sort_order: u.sort_order }).eq("id", u.id);
    if (error) return failFrom(error);
  }
  revalidateProgram(programId);
  return ok(undefined);
}
