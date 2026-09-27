// Conversación de un ejercicio: presentación de fechas relativas. Funciones puras.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const absoluteFmt = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Bogota",
});

/** "hace un momento", "hace 5 min", "hace 3 h", "ayer", "hace 4 días" o la fecha (más de 30 días). */
export function relativeTime(ts: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(ts).getTime();
  if (!Number.isFinite(diff)) return "—";
  if (diff < MINUTE) return "hace un momento";
  if (diff < HOUR) return `hace ${Math.floor(diff / MINUTE)} min`;
  if (diff < DAY) return `hace ${Math.floor(diff / HOUR)} h`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return "ayer";
  if (days <= 30) return `hace ${days} días`;
  return absoluteFmt.format(new Date(ts));
}

/** ¿Puede borrar este comentario? El autor o un admin global (igual que la política de la base). */
export function canDeleteComment(actor: { userId: string; isAdmin: boolean }, comment: { created_by: string | null }): boolean {
  return actor.isAdmin || (comment.created_by != null && comment.created_by === actor.userId);
}
