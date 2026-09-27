"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { groupResults, likePattern, rankResults, type SearchCandidate, type SearchGroup } from "@/domain/search";
import { getSessionUser } from "@/server/auth";

const inputSchema = z.object({
  query: z.string().max(120),
  programId: z.string().uuid().nullish(),
});

/** Filas que se traen por tabla antes del ranking (el prefiltro ya es estrecho). */
const ROWS_PER_TABLE = 40;

/**
 * Búsqueda global en los programas que el usuario puede ver. Actúa como el
 * usuario: RLS decide qué filas llegan (y oculta lo que está en la papelera).
 */
export async function searchEverything(input: { query: string; programId?: string | null }): Promise<ActionResult<SearchGroup[]>> {
  try {
    return await search(input);
  } catch {
    return fail("No se pudo buscar. Revise su conexión e intente de nuevo.");
  }
}

async function search(input: { query: string; programId?: string | null }): Promise<ActionResult<SearchGroup[]>> {
  const user = await getSessionUser();
  if (!user) return fail("Su sesión se venció. Vuelva a entrar, que aquí lo esperamos.");
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return fail("Búsqueda inválida.");
  const pattern = likePattern(parsed.data.query);
  if (!pattern) return ok([]);

  const supabase = await createClient();
  const [programs, problems, experiments, learnings, metrics] = await Promise.all([
    supabase.from("programs").select("id, name"),
    supabase
      .from("problems")
      .select("id, program_id, title, evidence, channel")
      .or(`title.ilike.${pattern},evidence.ilike.${pattern},root_cause.ilike.${pattern}`)
      .limit(ROWS_PER_TABLE),
    supabase
      .from("experiments")
      .select("id, program_id, title, hypothesis_if, hypothesis_then")
      .or(`title.ilike.${pattern},hypothesis_if.ilike.${pattern},hypothesis_then.ilike.${pattern}`)
      .limit(ROWS_PER_TABLE),
    supabase
      .from("learnings")
      .select("id, program_id, experiment_id, text, experiments!learnings_experiment_id_fkey(title)")
      .ilike("text", pattern)
      .limit(ROWS_PER_TABLE),
    supabase
      .from("metrics")
      .select("id, program_id, line_id, name, definition")
      .or(`name.ilike.${pattern},definition.ilike.${pattern}`)
      .limit(ROWS_PER_TABLE),
  ]);
  const failed = [programs, problems, experiments, learnings, metrics].find((r) => r.error);
  if (failed?.error) return fail("No se pudo buscar. Intente de nuevo en un momentico.");

  const names = new Map((programs.data ?? []).map((p) => [p.id as string, p.name as string]));
  const base = (programId: string) => `/programas/${programId}`;
  const candidates: SearchCandidate[] = [];

  for (const p of programs.data ?? []) {
    candidates.push({ kind: "program", id: p.id, programId: p.id, programName: p.name, title: p.name, href: base(p.id) });
  }
  for (const r of problems.data ?? []) {
    if (!names.has(r.program_id)) continue;
    candidates.push({
      kind: "problem",
      id: r.id,
      programId: r.program_id,
      programName: names.get(r.program_id)!,
      title: r.title,
      detail: [r.evidence, r.channel].filter(Boolean).join(" · "),
      href: `${base(r.program_id)}/problemas/${r.id}`,
    });
  }
  for (const r of experiments.data ?? []) {
    if (!names.has(r.program_id)) continue;
    candidates.push({
      kind: "experiment",
      id: r.id,
      programId: r.program_id,
      programName: names.get(r.program_id)!,
      title: r.title,
      detail: [r.hypothesis_if, r.hypothesis_then].filter(Boolean).join(" · "),
      href: `${base(r.program_id)}/ejercicios/${r.id}`,
    });
  }
  for (const r of learnings.data ?? []) {
    const exp = (Array.isArray(r.experiments) ? r.experiments[0] : r.experiments) as { title?: string } | null;
    if (!names.has(r.program_id) || !exp) continue;
    candidates.push({
      kind: "learning",
      id: r.id,
      programId: r.program_id,
      programName: names.get(r.program_id)!,
      title: exp.title ?? "Aprendizaje",
      detail: r.text,
      href: `${base(r.program_id)}/ejercicios/${r.experiment_id}?tab=aprendizaje`,
    });
  }
  for (const r of metrics.data ?? []) {
    if (!names.has(r.program_id)) continue;
    candidates.push({
      kind: "metric",
      id: r.id,
      programId: r.program_id,
      programName: names.get(r.program_id)!,
      title: r.name,
      detail: r.definition,
      href: `${base(r.program_id)}/lineas/${r.line_id}?tab=arbol`,
    });
  }

  const hits = rankResults(candidates, parsed.data.query, { currentProgramId: parsed.data.programId ?? null });
  return ok(groupResults(hits));
}
