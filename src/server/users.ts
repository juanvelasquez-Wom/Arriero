import "server-only";
import { publicEnv } from "@/lib/env";
import type { AdminSupabase } from "@/lib/supabase/admin";

export interface ProvisionResult {
  userId: string;
  /** La persona ya tenía cuenta. */
  existing: boolean;
  /** Se envió el correo de invitación de Supabase. */
  emailed: boolean;
  /** Enlace de un solo uso para compartir a mano (cuando no hay correo). */
  link?: string;
}

const AFTER_INVITE = "/restablecer?invitacion=1";

function confirmUrl(hashedToken: string, type: string) {
  return `${publicEnv.siteUrl}/auth/confirm?token_hash=${hashedToken}&type=${type}&next=${encodeURIComponent(AFTER_INVITE)}`;
}

/**
 * Crea (o encuentra) el usuario de Auth para un correo. Nunca define la
 * contraseña: la persona la crea desde el enlace de invitación.
 *  - mode "email": intenta el correo de Supabase y, si falla, genera un enlace.
 *  - mode "link": no envía correo; siempre devuelve un enlace para compartir.
 */
export async function provisionUser(
  admin: AdminSupabase,
  input: { email: string; name?: string | null; mode?: "email" | "link" },
): Promise<ProvisionResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || undefined;
  const mode = input.mode ?? "email";

  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing?.id) return { userId: existing.id as string, existing: true, emailed: false };

  const redirectTo = `${publicEnv.siteUrl}/auth/confirm?next=${encodeURIComponent(AFTER_INVITE)}`;

  if (mode === "email") {
    const invited = await admin.auth.admin.inviteUserByEmail(email, { data: { name }, redirectTo });
    if (!invited.error && invited.data.user) {
      return { userId: invited.data.user.id, existing: false, emailed: true };
    }
    console.warn("[usuarios] No se pudo enviar el correo de invitación:", invited.error?.message);
  }

  // Nunca se genera un enlace mágico para una cuenta que ya existe: quien lo reciba
  // entraría como esa persona. Si la invitación no se puede crear, se avisa y ya.
  const link = await admin.auth.admin.generateLink({ type: "invite", email, options: { data: { name }, redirectTo } });
  if (link.error || !link.data.user) {
    throw new Error(
      link.error?.message?.toLowerCase().includes("already")
        ? "Ese correo ya tiene una cuenta pendiente. Pídale a la persona que use «Se me olvidó la contraseña» en el login."
        : (link.error?.message ?? "No se pudo crear la invitación."),
    );
  }
  return {
    userId: link.data.user.id,
    existing: false,
    emailed: false,
    link: confirmUrl(link.data.properties.hashed_token, link.data.properties.verification_type ?? "invite"),
  };
}

/** Enlace de un solo uso para que un usuario existente cree una contraseña nueva. */
export async function passwordLink(admin: AdminSupabase, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data) throw new Error(error?.message ?? "No se pudo generar el enlace.");
  return `${publicEnv.siteUrl}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=/restablecer`;
}
