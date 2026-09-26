"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { drainStorageDeletionQueue } from "@/lib/supabase/admin";

const uuid = z.string().uuid();

function revalidate(programId?: string) {
  revalidatePath("/programas", "layout");
  if (programId) revalidatePath(`/programas/${programId}`, "layout");
}

/** Borra de Storage lo que quedó en cola. Si falla, el cron lo reintenta. */
async function drainStorage() {
  try {
    await drainStorageDeletionQueue();
  } catch (e) {
    console.error("[papelera] No se pudieron borrar archivos de Storage; se reintentará en la purga programada.", e);
  }
}

export async function restoreTrashItem(trashId: string, programId?: string): Promise<ActionResult> {
  if (!uuid.safeParse(trashId).success) return fail("Elemento inválido.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_trash_item", { p_trash: trashId });
  if (error) return failFrom(error);
  revalidate(programId);
  return ok(undefined, "Restaurado: volvió al camino.");
}

export async function purgeTrashItem(trashId: string, programId?: string): Promise<ActionResult> {
  if (!uuid.safeParse(trashId).success) return fail("Elemento inválido.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("purge_trash_item", { p_trash: trashId });
  if (error) return failFrom(error);
  await drainStorage();
  revalidate(programId);
  return ok(undefined, "Eliminado definitivamente. No cargue por cargar.");
}

export async function emptyTrash(programId: string): Promise<ActionResult<{ count: number }>> {
  if (!uuid.safeParse(programId).success) return fail("Programa inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("empty_trash", { p_program: programId });
  if (error) return failFrom(error);
  await drainStorage();
  revalidate(programId);
  return ok({ count: (data as number) ?? 0 }, "Papelera vaciada.");
}
