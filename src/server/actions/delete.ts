"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import type { DeletableEntity, ImpactCounts } from "@/domain/deletion";

const IMPACT_ENTITIES = ["program", "line", "metric", "stage", "problem", "experiment"] as const;

export async function getDeletionImpact(entity: DeletableEntity, id: string): Promise<ActionResult<ImpactCounts>> {
  if (!(IMPACT_ENTITIES as readonly string[]).includes(entity)) return ok({});
  if (!z.string().uuid().safeParse(id).success) return fail("Elemento inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("deletion_impact", { p_entity_type: entity, p_id: id });
  if (error) return failFrom(error);
  return ok((data ?? {}) as ImpactCounts);
}

const deleteSchema = z.object({
  entity: z.enum(["program", "line", "metric", "stage", "problem", "experiment", "variant", "attachment", "calendar_event"]),
  id: z.string().uuid(),
  programId: z.string().uuid(),
  strategy: z.enum(["reassign", "cascade"]).optional(),
  target: z.string().uuid().optional(),
  confirmName: z.string().optional(),
});

export type DeleteInput = z.input<typeof deleteSchema>;

export async function deleteEntity(input: DeleteInput): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const { entity, id, programId, strategy, target, confirmName } = parsed.data;
  const supabase = await createClient();

  let result;
  switch (entity) {
    case "program":
      result = await supabase.rpc("delete_program", { p_id: id, p_confirm_name: confirmName ?? "" });
      break;
    case "line":
      result = await supabase.rpc("delete_line", { p_id: id });
      break;
    case "metric":
      result = await supabase.rpc("delete_metric", { p_id: id, p_strategy: strategy ?? null, p_target: target ?? null });
      break;
    case "stage":
      result = await supabase.rpc("delete_stage", { p_id: id, p_strategy: strategy ?? null, p_target: target ?? null });
      break;
    case "problem":
      result = await supabase.rpc("delete_problem", { p_id: id, p_strategy: strategy ?? null, p_target: target ?? null });
      break;
    case "experiment":
      result = await supabase.rpc("delete_experiment", { p_id: id });
      break;
    case "variant":
      result = await supabase.rpc("delete_variant", { p_id: id });
      break;
    case "attachment":
      result = await supabase.rpc("delete_attachment", { p_id: id });
      break;
    case "calendar_event":
      result = await supabase.rpc("delete_calendar_event", { p_id: id });
      break;
  }
  if (result.error) return failFrom(result.error);

  if (entity === "program") revalidatePath("/programas", "layout");
  else revalidatePath(`/programas/${programId}`, "layout");
  return ok(undefined, "Enviado a la papelera. Ese camino no era.");
}
