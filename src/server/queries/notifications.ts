import "server-only";
import type { NotificationItem } from "@/domain/notifications";
import { createClient } from "@/lib/supabase/server";

export interface NotificationsResult {
  /** False si la tabla todavía no existe (la migración de avisos no se ha aplicado). */
  ready: boolean;
  items: NotificationItem[];
  unread: number;
}

/** PGRST205 / 42P01 = la tabla no existe en el esquema. */
export function isMissingNotificationsTable(error: { code?: string; message?: string }) {
  return error.code === "PGRST205" || error.code === "42P01";
}

/** Últimos avisos del usuario de la sesión y cuántos no ha leído. RLS: solo los propios. */
export async function listMyNotifications(limit = 20): Promise<NotificationsResult> {
  const supabase = await createClient();
  const [list, unread] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, program_id, kind, title, body, href, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  if (list.error) {
    if (isMissingNotificationsTable(list.error)) return { ready: false, items: [], unread: 0 };
    throw new Error(list.error.message);
  }
  return { ready: true, items: (list.data ?? []) as NotificationItem[], unread: unread.count ?? 0 };
}
