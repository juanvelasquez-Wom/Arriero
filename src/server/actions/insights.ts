"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { savedLine } from "@/domain/insights";
import { fail, failFrom, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { insightSchema, type InsightInput } from "@/lib/validation/insights";
import { getSessionUser } from "@/server/auth";

const uuid = z.string().uuid();
const NO_SESSION = "Su sesión se venció. Vuelva a entrar y lo anotamos.";

function refresh(id?: string) {
  revalidatePath("/insights");
  if (id) revalidatePath(`/insights/${id}`);
}

export async function createInsight(input: InsightInput): Promise<ActionResult<{ id: string }>> {
  const user = await getSessionUser();
  if (!user) return fail(NO_SESSION);
  const parsed = insightSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("insights").insert(parsed.data).select("id").single();
  if (error) return failFrom(error);
  refresh();
  return ok({ id: data.id as string }, savedLine(parsed.data.title));
}

export async function updateInsight(id: string, input: InsightInput): Promise<ActionResult> {
  if (!(await getSessionUser())) return fail(NO_SESSION);
  if (!uuid.safeParse(id).success) return fail("Insight inválido.");
  const parsed = insightSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("insights").update(parsed.data).eq("id", id).select("id");
  if (error) return failFrom(error);
  if (!data?.length) return fail("Solo quien escribió el insight (o un admin) lo puede editar.");
  refresh(id);
  return ok(undefined, "Listo, quedó corregido.");
}

/** Validar, archivar o reabrir. «Sembrado» no se marca aquí: sale solo al usarlo. */
export async function setInsightStatus(id: string, status: "new" | "validated" | "archived"): Promise<ActionResult> {
  if (!(await getSessionUser())) return fail(NO_SESSION);
  if (!uuid.safeParse(id).success) return fail("Insight inválido.");
  if (!["new", "validated", "archived"].includes(status)) return fail("Estado inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("insights").update({ status }).eq("id", id).select("id");
  if (error) return failFrom(error);
  if (!data?.length) return fail("Solo quien escribió el insight (o un admin) le cambia el estado.");
  refresh(id);
  const msg = { validated: "Validado. Ya no es corazonada, es evidencia.", archived: "Archivado. Descansa, pero no se pierde.", new: "Reabierto. De vuelta al ruedo." };
  return ok(undefined, msg[status]);
}

export async function deleteInsight(id: string): Promise<ActionResult> {
  if (!(await getSessionUser())) return fail(NO_SESSION);
  if (!uuid.safeParse(id).success) return fail("Insight inválido.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_insight", { p_insight: id });
  if (error) return failFrom(error);
  refresh(id);
  return ok(undefined, "Borrado. Que en paz descanse.");
}

/** «Yo también lo he visto»: pone o quita el voto de la persona. */
export async function toggleInsightVote(id: string, on: boolean): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return fail(NO_SESSION);
  if (!uuid.safeParse(id).success) return fail("Insight inválido.");
  const supabase = await createClient();
  const { error } = on
    ? await supabase.from("insight_votes").upsert({ insight_id: id, user_id: user.id }, { onConflict: "insight_id,user_id", ignoreDuplicates: true })
    : await supabase.from("insight_votes").delete().eq("insight_id", id).eq("user_id", user.id);
  if (error) return failFrom(error);
  refresh(id);
  return ok(undefined);
}

const linkSchema = z
  .object({
    programId: uuid.optional(),
    problemId: uuid.optional(),
    pilotId: uuid.optional(),
  })
  .refine((v) => [v.programId, v.problemId, v.pilotId].filter(Boolean).length === 1, "Elija un solo destino.");

/** Deja el insight «Sembrado» y vinculado a lo que nació de él (programa, problema o piloto). */
export async function linkInsight(id: string, target: { programId?: string; problemId?: string; pilotId?: string }): Promise<ActionResult> {
  if (!(await getSessionUser())) return fail(NO_SESSION);
  if (!uuid.safeParse(id).success) return fail("Insight inválido.");
  const parsed = linkSchema.safeParse(target);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("link_insight", {
    p_insight: id,
    p_program: parsed.data.programId ?? null,
    p_problem: parsed.data.problemId ?? null,
    p_pilot: parsed.data.pilotId ?? null,
  });
  if (error) return failFrom(error);
  refresh(id);
  return ok(undefined, "¡Sembrado! Ese insight ya echó raíz.");
}
