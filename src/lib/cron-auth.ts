import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * ¿La petición trae el secreto del cron (Vercel lo envía como Bearer)? Se compara
 * en tiempo constante para no filtrar el secreto por tiempos de respuesta.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}
