import "server-only";
import { redirect, notFound } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Actor, ProgramRole } from "@/domain/types";
import { parseScoringConfig } from "@/domain/scoring";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

/** Usuario autenticado (verificado contra Auth) o null. Se deduplica por petición. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, is_admin")
    .eq("id", data.user.id)
    .maybeSingle();
  return {
    id: data.user.id,
    email: profile?.email ?? data.user.email ?? "",
    name: profile?.name || data.user.email || "",
    isAdmin: !!profile?.is_admin,
  };
});

/**
 * ¿Ya se aplicaron las migraciones? PGRST205 = la tabla no existe en la API.
 * Permite mostrar un aviso útil en vez de un error cuando la base está vacía.
 */
export const isDatabaseReady = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { error } = await supabase.from("programs").select("id").limit(1);
  return error?.code !== "PGRST205";
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export interface ProgramSummary {
  id: string;
  name: string;
  description: string | null;
  is_demo: boolean;
  start_date: string | null;
  end_date: string | null;
  setup_step: number;
  setup_completed_at: string | null;
  scoring_config: ReturnType<typeof parseScoringConfig>;
}

export interface ProgramContext {
  user: SessionUser;
  program: ProgramSummary;
  role: ProgramRole | null;
  actor: Actor;
}

/** Programa + rol del usuario. 404 si no existe o no tiene acceso (RLS). */
export const getProgramContext = cache(async (programId: string): Promise<ProgramContext> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: program } = await supabase
    .from("programs")
    .select("id, name, description, is_demo, start_date, end_date, setup_step, setup_completed_at, scoring_config")
    .eq("id", programId)
    .maybeSingle();
  if (!program) notFound();
  const { data: membership } = await supabase
    .from("program_members")
    .select("role")
    .eq("program_id", programId)
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (membership?.role ?? null) as ProgramRole | null;
  return {
    user,
    program: { ...program, scoring_config: parseScoringConfig(program.scoring_config) } as ProgramSummary,
    role,
    actor: { userId: user.id, isAdmin: user.isAdmin, role },
  };
});

/** Para server actions: devuelve el actor sin redirigir (las acciones no deben lanzar). */
export async function getActionActor(programId: string): Promise<{ user: SessionUser; actor: Actor } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("program_members")
    .select("role")
    .eq("program_id", programId)
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (membership?.role ?? null) as ProgramRole | null;
  if (!role && !user.isAdmin) return null;
  return { user, actor: { userId: user.id, isAdmin: user.isAdmin, role } };
}
