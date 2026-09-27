// Avisos dentro de la app: etiquetas y tiempo relativo. Funciones puras.

export const NOTIFICATION_KINDS = [
  "assigned",
  "status",
  "comment",
  "mention",
  "ready_to_read",
  "stale",
  "freeze",
  "load_reminder",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  assigned: "Asignación",
  status: "Cambio de estado",
  comment: "Comentario",
  mention: "Mención",
  ready_to_read: "Listo para leer",
  stale: "Idea quieta",
  freeze: "Congelamiento",
  load_reminder: "Carga semanal",
};

export function isNotificationKind(k: string): k is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(k);
}

export interface NotificationItem {
  id: string;
  program_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  created_at: string;
  read_at: string | null;
}

export function countUnread(items: Pick<NotificationItem, "read_at">[]): number {
  return items.filter((n) => !n.read_at).length;
}

/** Texto del contador: más de 9 se muestra "9+". */
export function badgeText(unread: number): string | null {
  if (unread <= 0) return null;
  return unread > 9 ? "9+" : String(unread);
}

/** Solo rutas internas: un href que no empiece por "/" (o que sea "//…") no se sigue. */
export function safeHref(href: string | null | undefined): string | null {
  if (!href || !href.startsWith("/") || href.startsWith("//")) return null;
  return href;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "hace un momento", "hace 5 min", "hace 3 h", "ayer", "hace 4 días", "12 sept". */
export function relativeTime(ts: string, now: Date = new Date()): string {
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(0, now.getTime() - t);
  if (diff < MINUTE) return "hace un momento";
  if (diff < HOUR) return `hace ${Math.floor(diff / MINUTE)} min`;
  if (diff < DAY) return `hace ${Math.floor(diff / HOUR)} h`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" }).format(new Date(t));
}
