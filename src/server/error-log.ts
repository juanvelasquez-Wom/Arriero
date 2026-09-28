import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const SECRETISH = /(sb_secret_[\w-]+|sk-ant-[\w-]+|eyJ[\w-]{20,}\.[\w-]+\.[\w-]+|Bearer\s+[\w.-]+)/g;

/** Quita cualquier cosa que parezca una llave o un token antes de guardar. */
export function redact(text: string): string {
  return text.replace(SECRETISH, "[oculto]");
}

/** Guarda un error del servidor en public.error_log (con la secret key; ignora fallos). */
export async function reportServerError(input: { error: unknown; source: string }) {
  const err = input.error;
  const message = redact(err instanceof Error ? err.message : String(err)).slice(0, 1000) || "Error sin mensaje";
  // Ruido, no errores: la persona se fue de la página antes de que terminara de cargar.
  if (/destination stream closed early|aborted|NEXT_REDIRECT|NEXT_NOT_FOUND/i.test(message)) return;
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : null;
  const detail = err instanceof Error && err.stack ? redact(err.stack).split("\n").slice(0, 8).join("\n").slice(0, 2000) : null;
  try {
    const admin = createAdminClient();
    await admin.from("error_log").insert({ source: input.source.slice(0, 200), message, digest, detail });
  } catch {
    // Sin base o sin tabla (migración pendiente): no se hace nada.
  }
}
