"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createUserSchema, type CreateUserInput } from "@/lib/validation/users";
import { getSessionUser } from "@/server/auth";
import { passwordLink, provisionUser } from "@/server/users";

// Administración de usuarios: solo el admin global. La secret key se usa para
// Auth (crear, bloquear, enlaces) y para cambiar is_admin, que la base solo
// permite desde el servidor.

const uuid = z.string().uuid();

async function requireAdmin() {
  const user = await getSessionUser();
  return user?.isAdmin ? user : null;
}

async function logAdmin(action: string, userId: string, summary: string, payload: Record<string, unknown> = {}) {
  const me = await getSessionUser();
  await createAdminClient()
    .from("activity_log")
    .insert({ program_id: null, actor_id: me?.id ?? null, action, entity_type: "user", entity_id: userId, summary, payload });
}

export interface CreateUserResult {
  userId: string;
  existing: boolean;
  emailed: boolean;
  link?: string;
}

export async function createUser(input: CreateUserInput): Promise<ActionResult<CreateUserResult>> {
  if (!(await requireAdmin())) return fail("Solo un admin global puede crear usuarios.");
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const { email, name, isAdmin, mode, programId, role } = parsed.data;
  const admin = createAdminClient();

  let result;
  try {
    result = await provisionUser(admin, { email, name, mode });
  } catch (e) {
    console.error("[usuarios]", e);
    return fail("No se pudo crear el usuario. Revisa el correo e intenta de nuevo.");
  }

  const { error: profileError } = await admin.from("profiles").update({ name, ...(isAdmin ? { is_admin: true } : {}) }).eq("id", result.userId);
  if (profileError) return failFrom(profileError);

  if (programId && role) {
    // La membresía se inserta con la sesión del admin para que RLS la valide.
    const supabase = await createClient();
    const { error } = await supabase
      .from("program_members")
      .upsert({ program_id: programId, user_id: result.userId, role }, { onConflict: "program_id,user_id" });
    if (error) return failFrom(error);
    revalidatePath(`/programas/${programId}`, "layout");
  }

  await logAdmin("user_created", result.userId, `${result.existing ? "Actualizó" : "Creó"} el usuario ${email}${isAdmin ? " como admin global" : ""}`, {
    is_admin: isAdmin,
  });
  revalidatePath("/admin/usuarios");
  return ok(
    { userId: result.userId, existing: result.existing, emailed: result.emailed, link: result.link },
    result.existing
      ? "El usuario ya existía: se actualizaron sus datos."
      : result.emailed
        ? "Usuario creado. Le llegará un correo para crear su contraseña."
        : "Usuario creado. Comparte el enlace para que cree su contraseña.",
  );
}

export async function setAdmin(userId: string, isAdmin: boolean): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!me) return fail("Solo un admin global puede cambiar este permiso.");
  if (!uuid.safeParse(userId).success) return fail("Usuario inválido.");
  if (!isAdmin && userId === me.id) return fail("No puedes quitarte a ti mismo el rol de admin global.");
  const admin = createAdminClient();
  if (!isAdmin) {
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("is_admin", true);
    if ((count ?? 0) <= 1) return fail("Debe quedar al menos un admin global.");
  }
  const { data, error } = await admin.from("profiles").update({ is_admin: isAdmin }).eq("id", userId).select("email").single();
  if (error) return failFrom(error);
  await logAdmin("admin_changed", userId, `${isAdmin ? "Dio" : "Quitó"} el rol de admin global a ${data.email}`, { is_admin: isAdmin });
  revalidatePath("/admin/usuarios");
  return ok(undefined, isAdmin ? "Ahora es admin global." : "Ya no es admin global.");
}

export async function createPasswordLink(userId: string): Promise<ActionResult<{ link: string }>> {
  if (!(await requireAdmin())) return fail("Solo un admin global puede generar enlaces.");
  if (!uuid.safeParse(userId).success) return fail("Usuario inválido.");
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
  if (!profile) return fail("El usuario no existe.");
  try {
    const link = await passwordLink(admin, profile.email as string);
    await logAdmin("password_link", userId, `Generó un enlace de contraseña para ${profile.email}`);
    return ok({ link }, "Enlace generado. Es de un solo uso y vence.");
  } catch (e) {
    console.error("[usuarios]", e);
    return fail("No se pudo generar el enlace.");
  }
}

export async function setBlocked(userId: string, blocked: boolean): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!me) return fail("Solo un admin global puede bloquear usuarios.");
  if (!uuid.safeParse(userId).success) return fail("Usuario inválido.");
  if (userId === me.id) return fail("No puedes bloquearte a ti mismo.");
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.updateUserById(userId, { ban_duration: blocked ? "876000h" : "none" });
  if (error) return fail("No se pudo actualizar el acceso.");
  await logAdmin(blocked ? "user_blocked" : "user_unblocked", userId, `${blocked ? "Bloqueó" : "Desbloqueó"} el acceso de ${data.user.email}`);
  revalidatePath("/admin/usuarios");
  return ok(undefined, blocked ? "Acceso bloqueado." : "Acceso restablecido.");
}
