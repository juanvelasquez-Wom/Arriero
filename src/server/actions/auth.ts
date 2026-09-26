"use server";

import { redirect } from "next/navigation";
import { fail, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, recoverSchema, resetPasswordSchema } from "@/lib/validation/auth";

function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/programas";
}

export async function signIn(input: unknown): Promise<ActionResult<{ next: string }>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    if (error.code === "invalid_credentials") return fail("Correo o contraseña incorrectos.");
    if (error.code === "email_not_confirmed") return fail("Su correo aún no está confirmado. Revise la invitación.");
    return fail("¡Uy, qué pena! No pudimos iniciar sesión. Intente de nuevo en unos minutos.");
  }
  return ok({ next: safeNext(parsed.data.next) });
}

export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = recoverSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/restablecer`,
  });
  if (error && error.status === 429) {
    return fail("Se enviaron demasiados correos. Sin afán: espere unos minutos e intente de nuevo.");
  }
  // Por seguridad no revelamos si el correo existe.
  return ok(undefined, "Listo pues: si el correo está registrado, le enviamos un enlace para crear una nueva contraseña.");
}

export async function updatePassword(input: unknown): Promise<ActionResult<{ next: string }>> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return fail("El enlace venció. Pida uno nuevo desde “Olvidé mi contraseña”.");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return fail("La nueva contraseña debe ser distinta de la anterior.");
    if (error.code === "weak_password") return fail("La contraseña es muy débil. Use al menos 8 caracteres.");
    return fail("No se pudo guardar la contraseña. Intente de nuevo.");
  }
  if (parsed.data.name) {
    await supabase.from("profiles").update({ name: parsed.data.name }).eq("id", userData.user.id);
  }
  return ok({ next: "/programas" });
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
