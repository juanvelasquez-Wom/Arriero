// Destino seguro después de entrar o de seguir un enlace de correo: solo rutas
// internas de la app. Evita redirecciones abiertas como "//evil.com" o "/\evil.com"
// (el navegador convierte "\" en "/").
export const DEFAULT_AFTER_LOGIN = "/programas";

export function safeNext(next: string | null | undefined, fallback = DEFAULT_AFTER_LOGIN): string {
  if (!next || typeof next !== "string") return fallback;
  const s = next.trim();
  if (!s.startsWith("/") || s.startsWith("//") || s.includes("\\") || /[\u0000-\u001f\u007f]/.test(s)) return fallback;
  try {
    const base = "https://arriero.invalid";
    const url = new URL(s, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
