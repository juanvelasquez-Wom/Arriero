"use server";

import { z } from "zod";
import { fail, failFrom, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";
import { isMissingNotificationsTable, listMyNotifications, type NotificationsResult } from "@/server/queries/notifications";

const uuid = z.string().uuid();
const SESSION = "Su sesión venció. Vuelva a entrar.";

/** Avisos del usuario para la campana (la lee el cliente al abrir y con Realtime). */
export async function fetchNotifications(): Promise<ActionResult<NotificationsResult>> {
  const user = await getSessionUser();
  if (!user) return fail(SESSION);
  try {
    return ok(await listMyNotifications(20));
  } catch {
    return fail("No se pudieron cargar los avisos. Intente de nuevo en un momentico.");
  }
}

/** Marca un aviso como leído. RLS y la guarda solo dejan cambiar read_at de los propios. */
export async function markNotificationRead(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Aviso inválido.");
  const user = await getSessionUser();
  if (!user) return fail(SESSION);
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) return isMissingNotificationsTable(error) ? ok(undefined) : failFrom(error);
  return ok(undefined);
}

/** Marca todos los avisos del usuario como leídos. */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return fail(SESSION);
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) return isMissingNotificationsTable(error) ? ok(undefined) : failFrom(error);
  return ok(undefined, "¡Listo pues! Todo al día.");
}
