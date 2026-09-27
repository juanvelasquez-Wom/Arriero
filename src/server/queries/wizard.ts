import "server-only";
import type { SimilarExperimentCandidate, SimilarLearningCandidate, WizardData } from "@/components/experiments/wizard-values";
import { can } from "@/domain/permissions";
import type { ExperimentStatus, Verdict } from "@/domain/types";
import { createClient } from "@/lib/supabase/server";
import type { ProgramContext } from "@/server/auth";
import { listCalendar, listLines, listMembers } from "./programs";
import { listLearnings, listMetrics, listProblems } from "./structure";

/** Ejercicios del programa con lo necesario para compararlos con un borrador. */
async function listSimilarExperiments(programId: string): Promise<SimilarExperimentCandidate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experiments")
    .select(
      "id, title, hypothesis_if, hypothesis_then, hypothesis_because, status, verdict, decided_at, created_at, line:business_lines!experiments_line_id_fkey(name)",
    )
    .eq("program_id", programId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    text: [e.title, e.hypothesis_if, e.hypothesis_then, e.hypothesis_because].filter(Boolean).join(" "),
    line_name: (e.line as unknown as { name: string } | null)?.name ?? "",
    status: e.status as ExperimentStatus,
    verdict: (e.verdict as Verdict | null) ?? null,
    date: e.decided_at ?? e.created_at ?? null,
  }));
}

export async function loadWizardData(ctx: ProgramContext): Promise<WizardData> {
  const programId = ctx.program.id;
  const [lines, problems, metrics, members, calendar, similarExperiments, learnings] = await Promise.all([
    listLines(programId),
    listProblems(programId),
    listMetrics({ programId }),
    listMembers(programId),
    listCalendar(programId),
    listSimilarExperiments(programId),
    listLearnings(programId),
  ]);
  const similarLearnings: SimilarLearningCandidate[] = learnings.map((l) => ({
    id: l.id,
    text: l.text,
    experiment_id: l.experiment_id,
    experiment_title: l.experiment_title,
    line_name: l.line_name,
    verdict: (l.verdict as Verdict | null) ?? null,
  }));
  return {
    programId,
    lines: lines.map((l) => ({ id: l.id, name: l.name })),
    problems: problems.map((p) => ({ id: p.id, line_id: p.line_id, title: p.title, stage_name: p.stage_name, status: p.status, control: p.control })),
    metrics: metrics.map((m) => ({ id: m.id, line_id: m.line_id, name: m.name, type: m.type, parent_id: m.parent_id, direction: m.direction })),
    members: members.map((m) => ({ user_id: m.user_id, name: m.name, role: m.role })),
    calendar,
    scoring: ctx.program.scoring_config,
    canScore: can.scoreIce(ctx.actor),
    isAgency: ctx.role === "agency",
    similar: { experiments: similarExperiments, learnings: similarLearnings },
  };
}

/** Versión (updated_at) del ejercicio, para la concurrencia optimista del asistente. */
export async function getExperimentVersion(experimentId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("experiments").select("updated_at").eq("id", experimentId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.updated_at as string | undefined) ?? null;
}
