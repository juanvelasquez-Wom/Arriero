"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, fromZod, ok, toUserMessage, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { inferOwnerType } from "@/domain/experiment-inference";
import type { BulkItemResult } from "@/domain/home";
import { can } from "@/domain/permissions";
import type { ProgramRole } from "@/domain/types";
import { getActionActor } from "@/server/auth";

const uuid = z.string().uuid();
const idsSchema = z.array(uuid).min(1, "Seleccione al menos un ejercicio.").max(200, "Máximo 200 ejercicios a la vez.");

const transitionSchema = z.object({
  programId: uuid,
  ids: idsSchema,
  to: z.enum(["prioritized", "discarded"]),
});

const assignSchema = z.object({
  programId: uuid,
  ids: idsSchema,
  ownerId: uuid.nullable(),
});

/**
 * Prioriza o descarta varios ejercicios. Cada uno pasa por la RPC
 * `transition_experiment` (la misma regla y los mismos requisitos que uno a uno);
 * los que no cumplen se reportan sin frenar a los demás.
 */
export async function bulkTransition(
  input: z.input<typeof transitionSchema>,
): Promise<ActionResult<{ results: BulkItemResult[] }>> {
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const { programId, ids, to } = parsed.data;
  const ctx = await getActionActor(programId);
  if (!ctx) return fail("Su sesión venció o no tiene acceso a este programa.");
  if (!can.scoreIce(ctx.actor)) return fail("Su rol no puede priorizar ni descartar ejercicios.");

  const supabase = await createClient();
  const { data: owned, error: listError } = await supabase.from("experiments").select("id").eq("program_id", programId).in("id", ids);
  if (listError) return fail(toUserMessage(listError));
  const valid = new Set((owned ?? []).map((r) => r.id as string));

  const results: BulkItemResult[] = [];
  for (const id of [...new Set(ids)]) {
    if (!valid.has(id)) {
      results.push({ id, ok: false, error: "El ejercicio no existe o fue borrado." });
      continue;
    }
    const { error } = await supabase.rpc("transition_experiment", {
      p_experiment: id,
      p_to: to,
      p_justification: null,
      p_force: false,
    });
    results.push(error ? { id, ok: false, error: toUserMessage(error) } : { id, ok: true });
  }
  if (results.some((r) => r.ok)) revalidatePath(`/programas/${programId}`, "layout");
  return ok({ results });
}

/** Asigna (o quita) el responsable de varios ejercicios. */
export async function bulkAssign(input: z.input<typeof assignSchema>): Promise<ActionResult<{ results: BulkItemResult[] }>> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const { programId, ids, ownerId } = parsed.data;
  const ctx = await getActionActor(programId);
  if (!ctx) return fail("Su sesión venció o no tiene acceso a este programa.");
  if (!can.scoreIce(ctx.actor)) return fail("Su rol no puede cambiar el responsable de los ejercicios.");

  const supabase = await createClient();
  let ownerType: string | null = null;
  if (ownerId) {
    const { data: member } = await supabase
      .from("program_members")
      .select("role")
      .eq("program_id", programId)
      .eq("user_id", ownerId)
      .maybeSingle();
    if (!member) return fail("Esa persona no es miembro del programa.");
    ownerType = inferOwnerType(member.role as ProgramRole);
  }

  const results: BulkItemResult[] = [];
  for (const id of [...new Set(ids)]) {
    const row: Record<string, unknown> = { owner_id: ownerId };
    if (ownerType) row.owner_type = ownerType;
    const { data, error } = await supabase
      .from("experiments")
      .update(row)
      .eq("id", id)
      .eq("program_id", programId)
      .select("id");
    if (error) results.push({ id, ok: false, error: toUserMessage(error) });
    else if (!data?.length) results.push({ id, ok: false, error: "El ejercicio no existe o fue borrado." });
    else results.push({ id, ok: true });
  }
  if (results.some((r) => r.ok)) revalidatePath(`/programas/${programId}`, "layout");
  return ok({ results });
}
