import "server-only";
import { cache } from "react";
import { authorLabel, type IdeaRow, type IdeaScore, type IdeaSessionRow } from "@/domain/ideas";
import { createClient } from "@/lib/supabase/server";

type Author = { name: string | null; email: string } | null;
const nameOf = (a: Author) => a?.name?.trim() || a?.email?.split("@")[0] || "Alguien";

const SESSION_COLUMNS =
  "id, title, context, line_hint, deadline, phase, phase_changed_at, closed_at, created_by, created_at, owner:profiles!idea_sessions_created_by_fkey(name, email)";

type RawSession = Omit<IdeaSessionRow, "owner_name" | "mine" | "idea_count" | "chosen_count" | "buried_count"> & {
  created_by: string;
  owner: Author;
  ideas?: { decision: string | null }[] | null;
};

function toSession(r: RawSession, meId: string): IdeaSessionRow & { owner_id: string } {
  const ideas = r.ideas ?? [];
  return {
    id: r.id,
    title: r.title,
    context: r.context,
    line_hint: r.line_hint,
    deadline: r.deadline,
    phase: r.phase,
    phase_changed_at: r.phase_changed_at,
    closed_at: r.closed_at,
    created_at: r.created_at,
    owner_name: nameOf(r.owner),
    owner_id: r.created_by,
    mine: r.created_by === meId,
    idea_count: ideas.length,
    chosen_count: ideas.filter((i) => i.decision && i.decision !== "buried").length,
    buried_count: ideas.filter((i) => i.decision === "buried").length,
  };
}

export interface IdeaSessionsData {
  /** false si falta aplicar la migración de la lluvia de ideas. */
  ready: boolean;
  items: IdeaSessionRow[];
}

/** Todos los aguaceros visibles (la RLS deja fuera lo borrado), con el conteo de ideas. */
export const listIdeaSessions = cache(async (meId: string): Promise<IdeaSessionsData> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("idea_sessions")
    .select(`${SESSION_COLUMNS}, ideas(decision)`)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return { ready: false, items: [] };
  return { ready: true, items: ((data ?? []) as unknown as RawSession[]).map((r) => toSession(r, meId)) };
});

const IDEA_COLUMNS =
  "id, session_id, title, detail, anonymous, decision, decision_note, decided_at, program_id, pilot_id, insight_id, linked_at, created_by, created_at, author:profiles!ideas_created_by_fkey(name, email)";

type RawIdea = Omit<IdeaRow, "author_name" | "mine"> & { created_by: string; author: Author };

/** El id del autor no viaja al navegador; si la idea es anónima y ajena, tampoco su nombre. */
function toIdea(r: RawIdea, meId: string): IdeaRow {
  const mine = r.created_by === meId;
  const { author, created_by: _by, ...rest } = r;
  void _by;
  return { ...rest, mine, author_name: r.anonymous && !mine ? null : nameOf(author) };
}

export interface IdeaSessionDetail {
  session: IdeaSessionRow & { owner_id: string };
  ideas: IdeaRow[];
  /** Con la votación abierta, solo los propios (a ciegas); cerrada, todos. */
  scores: IdeaScore[];
  progress: { voters: number; scores: number };
}

export async function getIdeaSession(id: string, meId: string): Promise<IdeaSessionDetail | null> {
  const supabase = await createClient();
  const { data: raw } = await supabase.from("idea_sessions").select(SESSION_COLUMNS).eq("id", id).maybeSingle();
  if (!raw) return null;
  const [ideasRes, progressRes] = await Promise.all([
    supabase.from("ideas").select(IDEA_COLUMNS).eq("session_id", id).order("created_at", { ascending: true }).limit(500),
    supabase.rpc("idea_session_progress", { p_session: id }),
  ]);
  const ideas = ((ideasRes.data ?? []) as unknown as RawIdea[]).map((r) => toIdea(r, meId));
  const ids = ideas.map((i) => i.id);
  const scoresRes = ids.length
    ? await supabase.from("idea_scores").select("idea_id, user_id, impact, ease, favorite").in("idea_id", ids)
    : { data: [] };
  const scores = ((scoresRes.data ?? []) as { idea_id: string; user_id: string; impact: number | null; ease: number | null; favorite: boolean }[]).map(
    (s) => ({ idea_id: s.idea_id, mine: s.user_id === meId, impact: s.impact, ease: s.ease, favorite: s.favorite }),
  );
  const p = (Array.isArray(progressRes.data) ? progressRes.data[0] : progressRes.data) as { voters: number; scores: number } | null;
  const session = toSession({ ...(raw as unknown as RawSession), ideas: ideas.map((i) => ({ decision: i.decision })) }, meId);
  return { session, ideas, scores, progress: { voters: p?.voters ?? 0, scores: p?.scores ?? 0 } };
}

export interface IdeaForLink {
  id: string;
  title: string;
  detail: string | null;
  decision: IdeaRow["decision"];
  sessionId: string;
  sessionTitle: string;
  author: string;
}

/** La idea que da origen a un programa o piloto (para el aviso y el vínculo). */
export async function getIdeaForLink(id: string, meId: string): Promise<IdeaForLink | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ideas")
    .select(`${IDEA_COLUMNS}, session:idea_sessions!inner(id, title)`)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const raw = data as unknown as RawIdea & { session: { id: string; title: string } };
  const idea = toIdea(raw, meId);
  return {
    id: idea.id,
    title: idea.title,
    detail: idea.detail,
    decision: idea.decision,
    sessionId: raw.session.id,
    sessionTitle: raw.session.title,
    author: authorLabel(idea),
  };
}

export interface LinkedTargets {
  program: { id: string; name: string } | null;
  pilot: { id: string; title: string } | null;
}

/** Nombres de lo que nació de las ideas, solo si la persona lo puede ver (RLS de cada tabla). */
export async function linkedTargets(ideas: readonly IdeaRow[]): Promise<Record<string, LinkedTargets>> {
  const programIds = [...new Set(ideas.map((i) => i.program_id).filter(Boolean))] as string[];
  const pilotIds = [...new Set(ideas.map((i) => i.pilot_id).filter(Boolean))] as string[];
  const supabase = await createClient();
  const [programs, pilots] = await Promise.all([
    programIds.length ? supabase.from("programs").select("id, name").in("id", programIds) : { data: [] },
    pilotIds.length ? supabase.from("pilots").select("id, title").in("id", pilotIds) : { data: [] },
  ]);
  const pm = new Map(((programs.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p]));
  const pi = new Map(((pilots.data ?? []) as { id: string; title: string }[]).map((p) => [p.id, p]));
  return Object.fromEntries(
    ideas.map((i) => [i.id, { program: (i.program_id && pm.get(i.program_id)) || null, pilot: (i.pilot_id && pi.get(i.pilot_id)) || null }]),
  );
}
