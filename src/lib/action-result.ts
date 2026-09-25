// Contrato de las server actions: nunca lanzan errores hacia la UI.
import type { ZodError } from "zod";

export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

export function fromZod(error: ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, error: "Revisa los campos marcados.", fieldErrors };
}

interface PgLikeError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/** Traduce un error de Supabase/Postgres a un mensaje en español para el usuario. */
export function toUserMessage(error: PgLikeError | null | undefined): string {
  if (!error) return "Ocurrió un error inesperado.";
  const msg = error.message ?? "";
  if (error.code === "P0001" && msg) return msg; // mensajes de nuestras RPC y triggers
  if (error.code === "42501" || /row-level security/i.test(msg)) return "No tienes permiso para esta acción.";
  if (error.code === "23505") return "Ya existe un registro con esos datos.";
  if (error.code === "23503") return "El elemento relacionado no existe o fue borrado.";
  if (error.code === "23514") return "Algún dato no cumple las reglas (revisa fechas y valores).";
  if (error.code === "PGRST116") return "No se encontró el elemento o no tienes acceso.";
  if (/fetch failed|network/i.test(msg)) return "No se pudo conectar con la base de datos. Intenta de nuevo.";
  // Mensajes de triggers (raise exception sin código explícito también llegan como P0001).
  return msg || "Ocurrió un error inesperado.";
}

export function failFrom(error: PgLikeError | null | undefined): ActionResult<never> {
  return fail(toUserMessage(error));
}
