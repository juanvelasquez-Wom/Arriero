import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProgramRole } from "@/domain/types";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  status: "active" | "pending" | "blocked";
  lastSignInAt: string | null;
  createdAt: string;
  programs: { id: string; name: string; role: ProgramRole }[];
}

/**
 * Todos los usuarios (solo para la administración global; la página verifica
 * que quien consulta sea admin antes de llamar esta función).
 */
export async function listAllUsers(): Promise<UserRow[]> {
  const admin = createAdminClient();
  const authUsers: { id: string; email?: string; last_sign_in_at?: string | null; banned_until?: string | null; created_at: string; email_confirmed_at?: string | null; invited_at?: string | null }[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    authUsers.push(...data.users);
    if (data.users.length < 200) break;
  }
  const [{ data: profiles }, { data: memberships }] = await Promise.all([
    admin.from("profiles").select("id, name, email, is_admin"),
    admin.from("program_members").select("user_id, role, program:programs!program_members_program_id_fkey(id, name, deleted_at)"),
  ]);
  const profileBy = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  const now = Date.now();
  return authUsers
    .filter((u) => !(u as { app_metadata?: { demo?: boolean; test?: boolean } }).app_metadata?.demo)
    .map((u) => {
      const p = profileBy.get(u.id);
      const blocked = !!u.banned_until && new Date(u.banned_until).getTime() > now;
      return {
        id: u.id,
        email: (p?.email as string) ?? u.email ?? "",
        name: (p?.name as string) || u.email || "",
        isAdmin: !!p?.is_admin,
        status: blocked ? "blocked" : u.last_sign_in_at ? "active" : "pending",
        lastSignInAt: u.last_sign_in_at ?? null,
        createdAt: u.created_at,
        programs: (memberships ?? [])
          .filter((m) => m.user_id === u.id)
          .map((m) => {
            const prog = m.program as unknown as { id: string; name: string; deleted_at: string | null } | null;
            return prog && !prog.deleted_at ? { id: prog.id, name: prog.name, role: m.role as ProgramRole } : null;
          })
          .filter((x): x is { id: string; name: string; role: ProgramRole } => !!x),
      } satisfies UserRow;
    })
    .sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.name.localeCompare(b.name, "es"));
}
