"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";
import { deleteDemoProgram as deleteDemo, loadDemoProgram as loadDemo } from "@/server/demo/loader";

export async function loadDemoProgram(): Promise<ActionResult<{ programId: string }>> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return fail("Solo un admin puede cargar el programa de ejemplo.");
  try {
    const programId = await loadDemo(await createClient(), createAdminClient(), user.id);
    revalidatePath("/programas", "layout");
    return ok({ programId }, "¡Eso! Programa de ejemplo cargado.");
  } catch (e) {
    console.error("[demo] Error al cargar el programa de ejemplo", e);
    return fail(e instanceof Error ? `No se pudo cargar el ejemplo. ${e.message}` : "No se pudo cargar el ejemplo.");
  }
}

export async function deleteDemoProgram(): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return fail("Solo un admin puede borrar el programa de ejemplo.");
  try {
    const deleted = await deleteDemo(createAdminClient());
    revalidatePath("/programas", "layout");
    return deleted ? ok(undefined, "Programa de ejemplo borrado. Listo pues.") : fail("No hay un programa de ejemplo.");
  } catch (e) {
    console.error("[demo] Error al borrar el programa de ejemplo", e);
    return fail("No se pudo borrar el programa de ejemplo. Intente de nuevo.");
  }
}
