"use server";

import { z } from "zod";
import { fail, failFrom, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";

/** Prende o apaga el resumen semanal por correo de la persona que está usando la app. */
export async function setWeeklyDigest(enabled: boolean): Promise<ActionResult<{ enabled: boolean }>> {
  const parsed = z.boolean().safeParse(enabled);
  if (!parsed.success) return fail("Valor inválido.");
  const user = await getSessionUser();
  if (!user) return fail("Su sesión venció. Vuelva a entrar.");
  const supabase = await createClient();
  // RLS (profiles_update_self) solo deja cambiar el propio perfil.
  const { error } = await supabase.from("profiles").update({ weekly_digest: parsed.data }).eq("id", user.id);
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") return fail("Esta opción todavía no está lista en la base de datos. Intente más tarde.");
    return failFrom(error);
  }
  return ok(
    { enabled: parsed.data },
    parsed.data ? "¡Listo! Los lunes le llega el resumen por correo." : "Listo, ya no le llega el resumen por correo.",
  );
}
