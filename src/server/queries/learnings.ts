import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Fila de la vista `all_learnings` (aprendizajes de ejercicios y de pilotos, con el RLS de cada origen). */
export interface AllLearningRow {
  source: "experiment" | "pilot";
  id: string;
  text: string;
  created_at: string;
  item_id: string;
  item_title: string;
  program_id: string | null;
  program_name: string | null;
  line_name: string | null;
  verdict: string | null;
  decision: string | null;
  test_type: string | null;
  /** Palanca: en ejercicios la que se marcó al aprender; en pilotos, la categoría de la variable. */
  lever: string | null;
  channel: string | null;
  decided_at: string | null;
}

const COLUMNS =
  "source, id, text, created_at, item_id, item_title, program_id, program_name, line_name, verdict, decision, test_type, lever, channel, decided_at";

/**
 * Biblioteca unificada. Vacía (sin fallar) si la vista todavía no existe en la base.
 * `source` limita a un origen; `programId` limita los ejercicios a un programa.
 */
export async function listAllLearnings(opts: { source?: "experiment" | "pilot"; programId?: string } = {}): Promise<AllLearningRow[]> {
  const supabase = await createClient();
  let q = supabase.from("all_learnings").select(COLUMNS).order("created_at", { ascending: false }).limit(500);
  if (opts.source) q = q.eq("source", opts.source);
  if (opts.programId) q = q.eq("program_id", opts.programId);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as unknown as AllLearningRow[];
}
