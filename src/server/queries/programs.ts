import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent, ProgramRole } from "@/domain/types";
import type { OnboardingCounts } from "@/domain/onboarding";

export interface ProgramListItem {
  id: string;
  name: string;
  description: string | null;
  is_demo: boolean;
  start_date: string | null;
  end_date: string | null;
  setup_completed_at: string | null;
  role: ProgramRole | null;
  lines: number;
  experiments: number;
}

export async function listMyPrograms(userId: string): Promise<ProgramListItem[]> {
  const supabase = await createClient();
  const [{ data: programs, error }, { data: memberships }] = await Promise.all([
    supabase
      .from("programs")
      .select("id, name, description, is_demo, start_date, end_date, setup_completed_at, business_lines(count), experiments(count)")
      .is("deleted_at", null)
      .order("is_demo", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase.from("program_members").select("program_id, role").eq("user_id", userId),
  ]);
  if (error) throw new Error(error.message);
  const roleBy = new Map((memberships ?? []).map((m) => [m.program_id as string, m.role as ProgramRole]));
  return (programs ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    is_demo: p.is_demo,
    start_date: p.start_date,
    end_date: p.end_date,
    setup_completed_at: p.setup_completed_at,
    role: roleBy.get(p.id) ?? null,
    lines: (p.business_lines as { count: number }[] | null)?.[0]?.count ?? 0,
    experiments: (p.experiments as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
}

export interface DeletedProgram {
  trashId: string;
  programId: string;
  name: string;
  deleted_at: string;
  deleted_by_name: string | null;
}

/** Programas en la papelera que el usuario puede restaurar (owner/admin). */
export async function listDeletedPrograms(): Promise<DeletedProgram[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("trash_items")
    .select("id, entity_id, label, deleted_at, deleted_by:profiles!trash_items_deleted_by_fkey(name, email)")
    .eq("entity_type", "program")
    .order("deleted_at", { ascending: false });
  return (data ?? []).map((t) => {
    const by = t.deleted_by as unknown as { name: string; email: string } | null;
    return {
      trashId: t.id,
      programId: t.entity_id,
      name: t.label,
      deleted_at: t.deleted_at,
      deleted_by_name: by ? by.name || by.email : null,
    };
  });
}

export interface TrashItem {
  id: string;
  entity_type: string;
  label: string;
  deleted_at: string;
  deleted_by: string | null;
}

/** Papelera del programa (RLS: solo owner/admin). */
export async function listTrash(programId: string): Promise<TrashItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trash_items")
    .select("id, entity_type, label, deleted_at, deleted_by:profiles!trash_items_deleted_by_fkey(name, email)")
    .eq("program_id", programId)
    .neq("entity_type", "program")
    .order("deleted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => {
    const by = t.deleted_by as unknown as { name: string; email: string } | null;
    return { id: t.id, entity_type: t.entity_type, label: t.label, deleted_at: t.deleted_at, deleted_by: by ? by.name || by.email : null };
  });
}

export interface LineRef {
  id: string;
  name: string;
  sort_order: number;
}

export async function listLines(programId: string): Promise<LineRef[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_lines")
    .select("id, name, sort_order")
    .eq("program_id", programId)
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listCalendar(programId: string): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, type, name, start_date, end_date")
    .eq("program_id", programId)
    .order("start_date");
  if (error) throw new Error(error.message);
  return (data ?? []) as CalendarEvent[];
}

export interface Horizon {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  sort_order: number;
}

export async function listHorizons(programId: string): Promise<Horizon[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("program_horizons")
    .select("id, name, start_date, end_date, sort_order")
    .eq("program_id", programId)
    .order("sort_order")
    .order("start_date");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface Member {
  id: string;
  user_id: string;
  role: ProgramRole;
  name: string;
  email: string;
}

export async function listMembers(programId: string): Promise<Member[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("program_members")
    .select("id, user_id, role, profile:profiles!program_members_user_id_fkey(name, email)")
    .eq("program_id", programId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => {
    const p = m.profile as unknown as { name: string; email: string } | null;
    return { id: m.id, user_id: m.user_id, role: m.role as ProgramRole, name: p?.name || p?.email || "", email: p?.email ?? "" };
  });
}

export async function onboardingCounts(programId: string): Promise<OnboardingCounts> {
  const supabase = await createClient();
  const count = async (table: string, extra?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    let q = base(table);
    if (extra) q = extra(q);
    const { count: n } = await q;
    return n ?? 0;
  };
  function base(table: string) {
    return supabase.from(table).select("id", { count: "exact", head: true }).eq("program_id", programId);
  }
  const [lines, northStars, inputMetrics, stages, problems, experiments] = await Promise.all([
    count("business_lines"),
    supabase.from("metrics").select("line_id").eq("program_id", programId).eq("type", "north_star"),
    count("metrics", (q) => q.eq("type", "input")),
    count("funnel_stages"),
    count("problems"),
    count("experiments"),
  ]);
  const linesWithNorthStar = new Set((northStars.data ?? []).map((m) => m.line_id)).size;
  return { lines, linesWithNorthStar, inputMetrics, stages, problems, experiments };
}
