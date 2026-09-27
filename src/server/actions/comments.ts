"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { commentSchema } from "@/lib/validation/comments";
import { getActionActor } from "@/server/auth";

const uuid = z.string().uuid();

function isMissingTable(error: { code?: string; message?: string }) {
  return error.code === "PGRST205" || error.code === "42P01";
}

const NOT_READY = "Los comentarios se activan cuando se aplique la actualización de la base.";

/** Publica un comentario. RLS decide: editores y agencia asignada; lectores no. */
export async function addComment(programId: string, experimentId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!uuid.safeParse(programId).success || !uuid.safeParse(experimentId).success) return fail("Ejercicio inválido.");
  const ctx = await getActionActor(programId);
  if (!ctx) return fail("Su sesión venció o no tiene acceso a este programa.");
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experiment_comments")
    .insert({ experiment_id: experimentId, body: parsed.data.body })
    .select("id")
    .single();
  if (error) return isMissingTable(error) ? fail(NOT_READY) : failFrom(error);
  revalidatePath(`/programas/${programId}`, "layout");
  return ok({ id: data.id }, "Comentario publicado.");
}

/** Borra un comentario propio (o cualquiera, si es admin). */
export async function deleteComment(programId: string, commentId: string): Promise<ActionResult> {
  if (!uuid.safeParse(programId).success || !uuid.safeParse(commentId).success) return fail("Comentario inválido.");
  const ctx = await getActionActor(programId);
  if (!ctx) return fail("Su sesión venció o no tiene acceso a este programa.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("experiment_comments").delete().eq("id", commentId).select("id");
  if (error) return isMissingTable(error) ? fail(NOT_READY) : failFrom(error);
  if (!data?.length) return fail("Solo puede borrar sus propios comentarios. ¡Uy, qué pena!");
  revalidatePath(`/programas/${programId}`, "layout");
  return ok(undefined, "Comentario borrado.");
}
