"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { inviteSchema, type InviteInput } from "@/lib/validation/programs";
import { PROGRAM_ROLES } from "@/domain/types";
import { can } from "@/domain/permissions";
import { getActionActor } from "@/server/auth";

export interface InviteResult {
  /** Se envió el correo de invitación. */
  emailed: boolean;
  /** El usuario ya existía y solo se agregó al programa. */
  existing: boolean;
  /** Enlace para compartir a mano cuando el correo no se pudo enviar. */
  link?: string;
}

function inviteRedirect() {
  return `${publicEnv.siteUrl}/auth/confirm?next=${encodeURIComponent("/restablecer?invitacion=1")}`;
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

  const admin = createAdminClient();
  const supabase = await createClient();

  const { data: existingProfile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  let userId = existingProfile?.id as string | undefined;
  const result: InviteResult = { emailed: false, existing: !!userId };

  if (!userId) {
    const invited = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name: name || undefined },
      redirectTo: inviteRedirect(),
    });
    if (!invited.error && invited.data.user) {
      userId = invited.data.user.id;
      result.emailed = true;
    } else {
      // Sin SMTP propio (o límite de envíos): generamos un enlace para compartir a mano.
      console.warn("[invitación] No se pudo enviar el correo:", invited.error?.message);
      let link = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { data: { name: name || undefined }, redirectTo: inviteRedirect() },
      });
      if (link.error) {
        link = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: inviteRedirect() } });
      }
      if (link.error || !link.data.user) {
        return fail("No se pudo crear la invitación. Revisa el correo e intenta de nuevo.");
      }
      userId = link.data.user.id;
      const type = link.data.properties.verification_type ?? "invite";
      result.link = `${publicEnv.siteUrl}/auth/confirm?token_hash=${link.data.properties.hashed_token}&type=${type}&next=${encodeURIComponent("/restablecer?invitacion=1")}`;
    }
  }

  const { error } = await supabase
    .from("program_members")
    .upsert({ program_id: programId, user_id: userId, role }, { onConflict: "program_id,user_id" });
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
  return ok(undefined, "Rol actualizado.");
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
