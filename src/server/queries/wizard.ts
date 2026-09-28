import "server-only";
import type { SimilarExperimentCandidate, SimilarLearningCandidate, WizardData } from "@/components/experiments/wizard-values";
import { expectedMonthlyValue } from "@/domain/ice-assist";
import { learningHref } from "@/domain/learning-search";
import { can } from "@/domain/permissions";
import type { ExperimentStatus, Verdict } from "@/domain/types";
import { createClient } from "@/lib/supabase/server";
import type { ProgramContext } from "@/server/auth";
import { countProblemAttachments, listExpectedEffects, listMetricEconomics, rigorAvailable } from "./experiments";
import { listAllLearnings } from "./learnings";
import { listCalendar, listLines, listMembers } from "./programs";
import { listLearnings, listMetrics, listProblems } from "./structure";

type SimilarWithMetric = SimilarExperimentCandidate & { metric_id: string };

/** Ejercicios del programa con lo necesario para compararlos con un borrador. */
async function listSimilarExperiments(programId: string): Promise<SimilarWithMetric[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experiments")
    .select(
      "id, title, metric_id, hypothesis_if, hypothesis_then, hypothesis_because, status, verdict, decided_at, created_at, line:business_lines!experiments_line_id_fkey(name)",
    )
    .eq("program_id", programId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    metric_id: e.metric_id,
    text: [e.title, e.hypothesis_if, e.hypothesis_then, e.hypothesis_because].filter(Boolean).join(" "),
    line_name: (e.line as unknown as { name: string } | null)?.name ?? "",
    status: e.status as ExperimentStatus,
    verdict: (e.verdict as Verdict | null) ?? null,
    date: e.decided_at ?? e.created_at ?? null,
  }));
}

export async function loadWizardData(ctx: ProgramContext): Promise<WizardData> {
  const programId = ctx.program.id;
  const [lines, problems, metrics, members, calendar, similarExperiments, learnings, attachments, effects, rigorReady, pilotLearnings] = await Promise.all([
    listLines(programId),
    listProblems(programId),
    listMetrics({ programId }),
    listMembers(programId),
    listCalendar(programId),
    listSimilarExperiments(programId),
    listLearnings(programId),
    countProblemAttachments(programId),
    listExpectedEffects(programId),
    rigorAvailable(),
    // Los de ejercicios ya vienen en `learnings`; de la biblioteca unificada solo faltan los de Pilotos.
    listAllLearnings({ source: "pilot" }),
  ]);
  const economics = await listMetricEconomics(metrics.map((m) => m.id));
  const similarLearnings: SimilarLearningCandidate[] = learnings.map((l) => ({
    id: l.id,
    text: l.text,
    experiment_id: l.experiment_id,
    experiment_title: l.experiment_title,
    line_name: l.line_name,
    verdict: (l.verdict as Verdict | null) ?? null,
  }));
  // Valor mensual esperado de los demás ejercicios: con eso se ubica el impacto sugerido.
  const peerValues = similarExperiments
    .map((e) => ({ id: e.id, monthly: expectedMonthlyValue(effects.get(e.id), economics.get(e.metric_id)) }))
    .filter((p): p is { id: string; monthly: number } => p.monthly != null);
  return {
    programId,
    lines: lines.map((l) => ({ id: l.id, name: l.name })),
    problems: problems.map((p) => ({
      id: p.id,
      line_id: p.line_id,
      title: p.title,
      stage_name: p.stage_name,
      status: p.status,
      control: p.control,
      evidence: p.evidence,
      impact: p.impact,
      channel: p.channel,
      attachments: attachments.get(p.id) ?? 0,
    })),
    metrics: metrics.map((m) => {
      const eco = economics.get(m.id);
      return {
        id: m.id,
        line_id: m.line_id,
        name: m.name,
        type: m.type,
        parent_id: m.parent_id,
        direction: m.direction,
        unit: m.unit,
        baseline: m.baseline,
        unit_value: m.unit_value,
        latest_value: eco?.latest_value ?? null,
      };
    }),
    members: members.map((m) => ({ user_id: m.user_id, name: m.name, role: m.role })),
    calendar,
    scoring: ctx.program.scoring_config,
    canScore: can.scoreIce(ctx.actor),
    isAgency: ctx.role === "agency",
    rigorReady,
    peerValues,
    similar: {
      experiments: similarExperiments,
      learnings: similarLearnings,
      pilotLearnings: pilotLearnings.map((l) => ({
        source: "pilot" as const,
        id: l.id,
        text: l.text,
        item_title: l.item_title,
        lever: l.lever,
        channel: l.channel,
        href: learningHref(l),
      })),
    },
  };
}

/** Versión (updated_at) del ejercicio, para la concurrencia optimista del asistente. */
export async function getExperimentVersion(experimentId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("experiments").select("updated_at").eq("id", experimentId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.updated_at as string | undefined) ?? null;
}
