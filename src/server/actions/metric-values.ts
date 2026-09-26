"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { weeklyValuesSchema, type WeeklyValuesInput } from "@/lib/validation/structure";
import { can } from "@/domain/permissions";
import { getActionActor } from "@/server/auth";

const uuid = z.string().uuid();

/**
 * Guardado en lote de la carga semanal: upsert por (métrica, semana). La UI
 * solo envía las filas que cambiaron; el historial lo guarda un trigger.
 */
export async function saveWeeklyValues(
  programId: string,
  input: WeeklyValuesInput,
): Promise<ActionResult<{ saved: number }>> {
  if (!uuid.safeParse(programId).success) return fail("Programa inválido.");
  const ctx = await getActionActor(programId);
  if (!ctx) return fail("Su sesión venció o no tiene acceso a este programa.");
  if (!can.loadMetricValues(ctx.actor)) return fail("Su rol no puede cargar valores semanales.");
  const parsed = weeklyValuesSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const { week_start, rows } = parsed.data;

  const ids = [...new Set(rows.map((r) => r.metric_id))];
  if (ids.length !== rows.length) return fail("Hay métricas repetidas en el guardado.");

  const supabase = await createClient();
  const { data: metrics, error: mError } = await supabase
    .from("metrics")
    .select("id")
    .eq("program_id", programId)
    .in("id", ids);
  if (mError) return failFrom(mError);
  if ((metrics ?? []).length !== ids.length) {
    return fail("Alguna métrica ya no existe o no es de este programa. Recargue la página e intente de nuevo.");
  }

  const { error } = await supabase.from("metric_values").upsert(
    rows.map((r) => ({ metric_id: r.metric_id, week_start, value: r.value, note: r.note })),
    { onConflict: "metric_id,week_start" },
  );
  if (error) return failFrom(error);
  revalidatePath(`/programas/${programId}`, "layout");
  return ok({ saved: rows.length }, rows.length === 1 ? "¡Eso! Se guardó 1 valor." : `¡Qué belleza! Se guardaron ${rows.length} valores.`);
}
