"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { inviteSchema, type InviteInput } from "@/lib/validation/programs";
import { PROGRAM_ROLES } from "@/domain/types";
import { can } from "@/domain/permissions";
import { getActionActor } from "@/server/auth";
import { provisionUser } from "@/server/users";

export interface InviteResult {
  /** Se envió el correo de invitación. */
  emailed: boolean;
  /** El usuario ya existía y solo se agregó al programa. */
  existing: boolean;
  /** Enlace para compartir a mano cuando el correo no se pudo enviar. */
  link?: string;
}

/**
 * Invita por correo y asigna el rol (admin u owner). Usa la secret key solo
 * para crear el usuario de Auth; la membresía se inserta con la sesión del
 * invitador para que RLS la valide.
 */
export async function inviteMember(programId: string, input: InviteInput): Promise<ActionResult<InviteResult>> {
  const ctx = await getActionActor(programId);
  if (!ctx || !can.manageMembers(ctx.actor)) return fail("Solo el owner o un admin puede invitar.");
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const { email, name, role } = parsed.data;

  // Solo el admin global crea cuentas nuevas; un owner suma a quien ya tiene cuenta.
  if (!ctx.user.isAdmin) {
    const admin = createAdminClient();
    const { data: existing } = await admin.from("profiles").select("id").eq("email", email.trim().toLowerCase()).maybeSingle();
    if (!existing?.id) {
      return fail("Esa persona todavía no tiene cuenta en Arriero. Pídale a un admin que la cree en Usuarios y luego súmela aquí.");
    }
  }

  let provisioned;
  try {
    provisioned = await provisionUser(createAdminClient(), { email, name });
  } catch (e) {
    console.error("[invitación]", e);
    return fail("No se pudo crear la invitación. Revise el correo e intente de nuevo.");
  }
  const result: InviteResult = { emailed: provisioned.emailed, existing: provisioned.existing, link: provisioned.link };

  const supabase = await createClient();
  const { error } = await supabase
    .from("program_members")
    .upsert({ program_id: programId, user_id: provisioned.userId, role }, { onConflict: "program_id,user_id" });
  if (error) return failFrom(error);
  revalidatePath(`/programas/${programId}`, "layout");
  return ok(
    result,
    result.existing
      ? "La persona ya tenía cuenta: quedó agregada al programa."
      : result.emailed
        ? "Invitación enviada por correo."
        : "No se pudo enviar el correo: comparte el enlace de invitación.",
  );
}

export async function changeMemberRole(programId: string, memberId: string, role: string): Promise<ActionResult> {
  const ctx = await getActionActor(programId);
  if (!ctx || !can.manageMembers(ctx.actor)) return fail("Solo el owner o un admin puede cambiar roles.");
  const parsed = z.enum(PROGRAM_ROLES).safeParse(role);
  if (!parsed.success) return fail("Rol inválido.");
  const supabase = await createClient();
  const { error } = await supabase.from("program_members").update({ role: parsed.data }).eq("id", memberId);
  if (error) return failFrom(error);
  revalidatePath(`/programas/${programId}`, "layout");
  return ok(undefined, "Rol actualizado. Listo pues.");
}

export async function removeMember(programId: string, memberId: string): Promise<ActionResult> {
  const ctx = await getActionActor(programId);
  if (!ctx || !can.manageMembers(ctx.actor)) return fail("Solo el owner o un admin puede quitar miembros.");
  const supabase = await createClient();
  const { error } = await supabase.from("program_members").delete().eq("id", memberId);
  if (error) return failFrom(error);
  revalidatePath(`/programas/${programId}`, "layout");
  return ok(undefined, "Miembro quitado del programa.");
}
