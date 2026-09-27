import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface CommentRow {
  id: string;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  author_name: string | null;
}

export interface CommentsResult {
  /** False si la tabla todavía no existe (la migración no se ha aplicado). */
  ready: boolean;
  comments: CommentRow[];
}

/** PGRST205 / 42P01 = la tabla no existe en el esquema. */
function isMissingTable(error: { code?: string; message?: string }) {
  return error.code === "PGRST205" || error.code === "42P01" || /experiment_comments/.test(error.message ?? "");
}

/** Comentarios de un ejercicio, del más viejo al más nuevo. RLS filtra por membresía. */
export async function listComments(experimentId: string): Promise<CommentsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experiment_comments")
    .select("id, body, created_by, created_at, updated_at")
    .eq("experiment_id", experimentId)
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return { ready: false, comments: [] };
    throw new Error(error.message);
  }
  const rows = data ?? [];
  // created_by apunta a auth.users (no a profiles): los nombres se buscan aparte.
  const authorIds = [...new Set(rows.map((r) => r.created_by).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (authorIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, name, email").in("id", authorIds);
    for (const p of profiles ?? []) names.set(p.id, p.name || p.email);
  }
  return {
    ready: true,
    comments: rows.map((r) => ({ ...r, author_name: r.created_by ? (names.get(r.created_by) ?? null) : null })),
  };
}
