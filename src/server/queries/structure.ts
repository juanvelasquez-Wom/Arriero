import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  ControlLevel,
  ImpactLevel,
  MetricBranch,
  MetricDirection,
  MetricType,
  ProblemStatus,
} from "@/domain/types";

export interface MetricRow {
  id: string;
  line_id: string;
  parent_id: string | null;
  type: MetricType;
  branch: MetricBranch | null;
  name: string;
  definition: string | null;
  channel: string | null;
  unit: string | null;
  direction: MetricDirection;
  source: string | null;
  baseline: number | null;
  owner_id: string | null;
  owner_name: string | null;
  sort_order: number;
  targets: { horizon_id: string; target: number }[];
}

export async function listMetrics(filter: { programId?: string; lineId?: string }): Promise<MetricRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("metrics")
    .select(
      "id, line_id, parent_id, type, branch, name, definition, channel, unit, direction, source, baseline, owner_id, sort_order, owner:profiles!metrics_owner_id_fkey(name, email), metric_targets(horizon_id, target)",
    )
    .order("sort_order")
    .order("created_at");
  if (filter.programId) q = q.eq("program_id", filter.programId);
  if (filter.lineId) q = q.eq("line_id", filter.lineId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => {
    const owner = m.owner as unknown as { name: string; email: string } | null;
    return {
      id: m.id,
      line_id: m.line_id,
      parent_id: m.parent_id,
      type: m.type as MetricType,
      branch: m.branch as MetricBranch | null,
      name: m.name,
      definition: m.definition,
      channel: m.channel,
      unit: m.unit,
      direction: m.direction as MetricDirection,
      source: m.source,
      baseline: m.baseline == null ? null : Number(m.baseline),
      owner_id: m.owner_id,
      owner_name: owner ? owner.name || owner.email : null,
      sort_order: m.sort_order,
      targets: ((m.metric_targets ?? []) as { horizon_id: string; target: number }[]).map((t) => ({
        horizon_id: t.horizon_id,
        target: Number(t.target),
      })),
    };
  });
}

export interface MetricValueRow {
  id: string;
  metric_id: string;
  week_start: string;
  value: number;
  note: string | null;
}

export async function listMetricValues(filter: {
  programId?: string;
  metricIds?: string[];
  weekStart?: string;
}): Promise<MetricValueRow[]> {
  const supabase = await createClient();
  let q = supabase.from("metric_values").select("id, metric_id, week_start, value, note").order("week_start");
  if (filter.programId) q = q.eq("program_id", filter.programId);
  if (filter.metricIds) q = q.in("metric_id", filter.metricIds.length ? filter.metricIds : ["00000000-0000-0000-0000-000000000000"]);
  if (filter.weekStart) q = q.eq("week_start", filter.weekStart);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((v) => ({ ...v, value: Number(v.value) }));
}

export interface StageRow {
  id: string;
  line_id: string;
  name: string;
  sort_order: number;
  description: string | null;
  metric_id: string | null;
}

export async function listStages(filter: { programId?: string; lineId?: string }): Promise<StageRow[]> {
  const supabase = await createClient();
  let q = supabase.from("funnel_stages").select("id, line_id, name, sort_order, description, metric_id").order("sort_order");
  if (filter.programId) q = q.eq("program_id", filter.programId);
  if (filter.lineId) q = q.eq("line_id", filter.lineId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface ProblemRow {
  id: string;
  line_id: string;
  line_name: string;
  stage_id: string;
  stage_name: string;
  channel: string | null;
  title: string;
  evidence: string;
  root_cause: string | null;
  impact: ImpactLevel;
  control: ControlLevel;
  status: ProblemStatus;
  created_at: string;
  created_by: string | null;
  experiments: number;
}

export async function listProblems(programId: string, filter: { problemId?: string } = {}): Promise<ProblemRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("problems")
    .select(
      "id, line_id, stage_id, channel, title, evidence, root_cause, impact, control, status, created_at, created_by, line:business_lines!problems_line_id_fkey(name), stage:funnel_stages!problems_stage_id_fkey(name), experiments!experiments_problem_id_fkey(count)",
    )
    .eq("program_id", programId)
    .order("created_at", { ascending: false });
  if (filter.problemId) q = q.eq("id", filter.problemId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id,
    line_id: p.line_id,
    line_name: (p.line as unknown as { name: string } | null)?.name ?? "",
    stage_id: p.stage_id,
    stage_name: (p.stage as unknown as { name: string } | null)?.name ?? "",
    channel: p.channel,
    title: p.title,
    evidence: p.evidence,
    root_cause: p.root_cause,
    impact: p.impact as ImpactLevel,
    control: p.control as ControlLevel,
    status: p.status as ProblemStatus,
    created_at: p.created_at,
    created_by: p.created_by,
    experiments: (p.experiments as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
}

export interface LearningListItem {
  id: string;
  text: string;
  suggested_hypothesis: string | null;
  applies_to_line_ids: string[];
  created_at: string;
  experiment_id: string;
  experiment_title: string;
  experiment_status: string;
  verdict: string | null;
  decision: string | null;
  line_id: string;
  line_name: string;
  stage_name: string | null;
  stage_id: string | null;
}

export async function listLearnings(programId: string): Promise<LearningListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("learnings")
    .select(
      "id, text, suggested_hypothesis, applies_to_line_ids, created_at, experiment:experiments!learnings_experiment_id_fkey(id, title, status, verdict, decision, line_id, line:business_lines!experiments_line_id_fkey(name), problem:problems!experiments_problem_id_fkey(stage_id, stage:funnel_stages!problems_stage_id_fkey(name)))",
    )
    .eq("program_id", programId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((l) => l.experiment)
    .map((l) => {
      const e = l.experiment as unknown as {
        id: string;
        title: string;
        status: string;
        verdict: string | null;
        decision: string | null;
        line_id: string;
        line: { name: string } | null;
        problem: { stage_id: string; stage: { name: string } | null } | null;
      };
      return {
        id: l.id,
        text: l.text,
        suggested_hypothesis: l.suggested_hypothesis,
        applies_to_line_ids: l.applies_to_line_ids ?? [],
        created_at: l.created_at,
        experiment_id: e.id,
        experiment_title: e.title,
        experiment_status: e.status,
        verdict: e.verdict,
        decision: e.decision,
        line_id: e.line_id,
        line_name: e.line?.name ?? "",
        stage_id: e.problem?.stage_id ?? null,
        stage_name: e.problem?.stage?.name ?? null,
      };
    });
}
