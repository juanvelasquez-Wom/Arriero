"use server";

import { revalidatePath } from "next/cache";
import { fail, failFrom, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { scoringSchema, type ScoringInput } from "@/lib/validation/programs";
import { can } from "@/domain/permissions";
import { getActionActor } from "@/server/auth";

// Los pasos del asistente de configuración viven en ./setup.ts.

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
  revalidatePath("/programas", "layout");
  revalidatePath(`/programas/${programId}`, "layout");
  return ok(undefined, finish ? "¡Qué belleza! Configuración completa." : "Puntaje guardado.");
}
