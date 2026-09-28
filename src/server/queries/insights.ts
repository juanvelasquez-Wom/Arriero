import "server-only";
import { cache } from "react";
import type { InsightRow } from "@/domain/insights";
import { createClient } from "@/lib/supabase/server";

const COLUMNS =
  "id, title, detail, source, source_ref, line_hint, stage, channel, tags, status, program_id, problem_id, pilot_id, created_by, created_at, author:profiles!insights_created_by_fkey(name, email), insight_votes(user_id)";

type Raw = Omit<InsightRow, "author_name" | "votes" | "voted_by_me"> & {
  author: { name: string | null; email: string } | null;
  insight_votes: { user_id: string }[] | null;
};

function toRow(r: Raw, meId: string): InsightRow {
  const votes = (r.insight_votes ?? []).filter((v) => v.user_id !== r.created_by);
  const { author, insight_votes: _votes, ...rest } = r;
  void _votes;
  return {
    ...rest,
    tags: rest.tags ?? [],
    author_name: author?.name?.trim() || author?.email?.split("@")[0] || "Alguien",
    votes: votes.length,
    voted_by_me: (r.insight_votes ?? []).some((v) => v.user_id === meId),
  };
}

export interface InsightsData {
  /** false si falta aplicar la migración de insights. */
  ready: boolean;
  items: InsightRow[];
}

/** Todos los insights visibles (el RLS ya deja fuera lo borrado). Los últimos 500. */
export const listInsights = cache(async (meId: string): Promise<InsightsData> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("insights").select(COLUMNS).order("created_at", { ascending: false }).limit(500);
  if (error) return { ready: false, items: [] };
  return { ready: true, items: ((data ?? []) as unknown as Raw[]).map((r) => toRow(r, meId)) };
});

export async function getInsight(id: string, meId: string): Promise<InsightRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("insights").select(COLUMNS).eq("id", id).maybeSingle();
  return data ? toRow(data as unknown as Raw, meId) : null;
}

export interface PlantedIn {
  program: { id: string; name: string } | null;
  problem: { id: string; title: string; programId: string } | null;
  pilot: { id: string; title: string } | null;
}

/** Lo que sembró un insight, solo si la persona lo puede ver (RLS de cada tabla). */
export async function plantedIn(i: Pick<InsightRow, "program_id" | "problem_id" | "pilot_id">): Promise<PlantedIn> {
  const supabase = await createClient();
  const [program, problem, pilot] = await Promise.all([
    i.program_id ? supabase.from("programs").select("id, name").eq("id", i.program_id).maybeSingle() : null,
    i.problem_id ? supabase.from("problems").select("id, title, program_id").eq("id", i.problem_id).maybeSingle() : null,
    i.pilot_id ? supabase.from("pilots").select("id, title").eq("id", i.pilot_id).maybeSingle() : null,
  ]);
  return {
    program: (program?.data as { id: string; name: string } | null) ?? null,
    problem: problem?.data
      ? { id: problem.data.id as string, title: problem.data.title as string, programId: problem.data.program_id as string }
      : null,
    pilot: (pilot?.data as { id: string; title: string } | null) ?? null,
  };
}

/** Programas donde la persona puede crear problemas (para «Convertir en problema»). */
export async function programsForProblems(userId: string, isAdmin: boolean) {
  const supabase = await createClient();
  const { data: programs } = await supabase
    .from("programs")
    .select("id, name, is_demo, business_lines(id, name, deleted_at), program_members(user_id, role)")
    .order("created_at", { ascending: false });
  type P = {
    id: string;
    name: string;
    is_demo: boolean;
    business_lines: { id: string; name: string; deleted_at: string | null }[];
    program_members: { user_id: string; role: string }[];
  };
  return ((programs ?? []) as unknown as P[])
    .filter((p) => isAdmin || p.program_members.some((m) => m.user_id === userId && ["owner", "collaborator"].includes(m.role)))
    .map((p) => ({ id: p.id, name: p.name, isDemo: p.is_demo, lines: p.business_lines.filter((l) => !l.deleted_at).map((l) => ({ id: l.id, name: l.name })) }))
    .filter((p) => p.lines.length > 0);
}
