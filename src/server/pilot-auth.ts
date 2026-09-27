import "server-only";
import { cache } from "react";
import { effectivePilotRole, type PilotActor } from "@/domain/pilots/flow";
import type { PilotRole } from "@/domain/pilots/types";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser, requireUser, type SessionUser } from "@/server/auth";

export interface PilotContext {
  user: SessionUser;
  actor: PilotActor;
}

async function roleOf(userId: string): Promise<PilotRole | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pilot_roles").select("role").eq("user_id", userId).maybeSingle();
  // PGRST205: la migración de pilotos aún no está aplicada.
  if (error) return null;
  return (data?.role ?? null) as PilotRole | null;
}

/** Usuario y rol efectivo en el módulo de pilotos (el admin global es aprobador). */
export const getPilotContext = cache(async (): Promise<PilotContext> => {
  const user = await requireUser();
  const role = effectivePilotRole(user.isAdmin, await roleOf(user.id));
  return { user, actor: { userId: user.id, role } };
});

/** Para server actions: sin redirigir (las acciones no deben lanzar). */
export async function getPilotActionActor(): Promise<PilotContext | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const role = effectivePilotRole(user.isAdmin, await roleOf(user.id));
  if (!role) return null;
  return { user, actor: { userId: user.id, role } };
}

/** ¿Ya existe el módulo en la base? (migración 012 aplicada). */
export const isPilotsReady = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { error } = await supabase.from("pilots").select("id").limit(1);
  return error?.code !== "PGRST205" && error?.code !== "42P01";
});
