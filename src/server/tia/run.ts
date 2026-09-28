import "server-only";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { dailyLimit, quotaLeft, TIA_LINES, tiaSystem, withNumberCheck, type TiaFeature } from "@/domain/tia";
import { getSessionUser, type ProgramContext } from "@/server/auth";
import { askTia, TiaError, tiaConfigured, type TiaMessage, type TiaUsage } from "./client";
import { programContextForTia } from "./context";

/** Estado de La Tía para la interfaz (sin revelar nada del servidor). */
export async function tiaStatus(): Promise<{ configured: boolean; left: number | null }> {
  if (!tiaConfigured()) return { configured: false, left: null };
  const used = await usedToday();
  return { configured: true, left: used == null ? null : quotaLeft(used, dailyLimit(process.env.TIA_DAILY_LIMIT)) };
}

/** Consultas de hoy (Bogotá) de la persona; null si la tabla aún no existe. */
async function usedToday(): Promise<number | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const start = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" })}T00:00:00-05:00`).toISOString();
  const { count, error } = await supabase
    .from("tia_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", start);
  if (error) return null;
  return count ?? 0;
}

/**
 * Registra el consumo real de una consulta. Si hay un cupo reservado (ensureTiaAvailable),
 * lo completa; si no, inserta una fila nueva.
 */
export async function recordTiaUsage(programId: string | null, feature: TiaFeature, usage: TiaUsage) {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (user) {
    const { data: reserved } = await supabase
      .from("tia_usage")
      .select("id")
      .eq("user_id", user.id)
      .eq("model", "reservado")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (reserved?.id) {
      const { error } = await supabase
        .from("tia_usage")
        .update({ model: usage.model, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens })
        .eq("id", reserved.id);
      if (!error) return;
    }
  }
  const { error } = await supabase.from("tia_usage").insert({
    program_id: programId,
    feature,
    model: usage.model,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
  });
  if (error && error.code !== "PGRST205") console.error("[tia] no se pudo registrar el consumo", error.code);
}

/**
 * Verifica que La Tía esté conectada y RESERVA una consulta del cupo diario de forma
 * atómica (RPC tia_reserve, con candado por persona). Si no se puede verificar el
 * cupo, no deja pasar: mejor sin respuesta que con sobrecosto.
 */
export async function ensureTiaAvailable(programId: string | null = null, feature: TiaFeature = "chat"): Promise<ActionResult<null>> {
  if (!tiaConfigured()) return fail(TIA_LINES.notConfigured);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tia_reserve", {
    p_program: programId,
    p_feature: feature,
    p_limit: dailyLimit(process.env.TIA_DAILY_LIMIT),
  });
  if (error) {
    console.error("[tia] no se pudo verificar el cupo", error.code);
    return fail("No se pudo verificar el cupo de La Tía. Intente de nuevo en un momentico.");
  }
  if (!data) return fail(TIA_LINES.quotaExceeded);
  return ok(null);
}

/**
 * Hace una consulta a La Tía sobre un programa: arma el contexto con los datos
 * que la persona puede ver, llama a Claude y registra el consumo.
 */
export async function runTia(opts: {
  ctx: ProgramContext;
  feature: TiaFeature;
  task: string;
  /** Datos adicionales de la pantalla (p. ej. el borrador del ejercicio). */
  extra?: Record<string, unknown>;
  messages?: TiaMessage[];
  maxTokens?: number;
}): Promise<ActionResult<string>> {
  const available = await ensureTiaAvailable(opts.ctx.program.id, opts.feature);
  if (!available.ok) return available;
  try {
    const context = await programContextForTia(opts.ctx);
    const reply = await askTia({
      system: tiaSystem(opts.task, opts.extra ? { ...context, pantalla: opts.extra } : context),
      messages: opts.messages ?? [{ role: "user", content: "Hágale pues." }],
      maxTokens: opts.maxTokens,
    });
    await recordTiaUsage(opts.ctx.program.id, opts.feature, reply.usage);
    if (!reply.text.trim()) return fail("La Tía se quedó callada. Intente de nuevo.");
    return ok(withNumberCheck(reply.text.trim(), opts.extra ? { ...context, pantalla: opts.extra } : context));
  } catch (e) {
    if (e instanceof TiaError) return fail(e.message);
    console.error("[tia] error inesperado", e instanceof Error ? e.message : e);
    return fail("La Tía no pudo responder. Intente de nuevo en un momentico.");
  }
}
