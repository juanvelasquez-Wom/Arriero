import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  ControlLevel,
  Decision,
  ExperimentCore,
  ExperimentStatus,
  MetricDirection,
  OwnerType,
  TestType,
  Variant,
  Verdict,
} from "@/domain/types";
import type { MetricEconomics } from "@/domain/value";

export interface ExperimentListItem extends ExperimentCore {
  title: string;
  program_id: string;
  line_id: string;
  line_name: string;
  problem_id: string;
  problem_title: string;
  stage_id: string | null;
  stage_name: string | null;
  metric_id: string;
  metric_name: string;
  owner_name: string | null;
  owner_type: OwnerType | null;
  ice_score: number | null;
  final_score: number | null;
  status_changed_at: string;
  decided_at: string | null;
  created_at: string;
  hypothesis_if: string | null;
  hypothesis_then: string | null;
  hypothesis_because: string | null;
  control_metrics: string[];
  decision_rationale: string | null;
  derived_from_learning_id: string | null;
}

const LIST_SELECT = `
  id, program_id, line_id, problem_id, metric_id, title, status, created_by, owner_id, owner_type,
  impact, confidence, ease, fits_calendar, control, ice_score, final_score,
  test_type, primary_metric, control_metrics, min_duration_days, decision_rule,
  planned_start, planned_end, actual_start, actual_end, design_locked_at, decided_at,
  verdict, decision, decision_rationale, status_changed_at, created_at, derived_from_learning_id,
  hypothesis_if, hypothesis_then, hypothesis_because,
  line:business_lines!experiments_line_id_fkey(name),
  problem:problems!experiments_problem_id_fkey(title, stage_id, stage:funnel_stages!problems_stage_id_fkey(name)),
  metric:metrics!experiments_metric_id_fkey(name),
  owner:profiles!experiments_owner_id_fkey(name, email)
`;

type Row = Record<string, unknown> & {
  line: { name: string } | null;
  problem: { title: string; stage_id: string; stage: { name: string } | null } | null;
  metric: { name: string } | null;
  owner: { name: string; email: string } | null;
};

function mapRow(r: Row): ExperimentListItem {
  return {
    id: r.id as string,
    program_id: r.program_id as string,
    title: r.title as string,
    status: r.status as ExperimentStatus,
    created_by: (r.created_by as string) ?? null,
    owner_id: (r.owner_id as string) ?? null,
    owner_type: (r.owner_type as OwnerType) ?? null,
    impact: (r.impact as number) ?? null,
    confidence: (r.confidence as number) ?? null,
    ease: (r.ease as number) ?? null,
    fits_calendar: !!r.fits_calendar,
    control: r.control as ControlLevel,
    ice_score: r.ice_score == null ? null : Number(r.ice_score),
    final_score: r.final_score == null ? null : Number(r.final_score),
    test_type: (r.test_type as TestType) ?? null,
    primary_metric: (r.primary_metric as string) ?? null,
    control_metrics: (r.control_metrics as string[]) ?? [],
    min_duration_days: (r.min_duration_days as number) ?? null,
    decision_rule: (r.decision_rule as string) ?? null,
    planned_start: (r.planned_start as string) ?? null,
    planned_end: (r.planned_end as string) ?? null,
    actual_start: (r.actual_start as string) ?? null,
    actual_end: (r.actual_end as string) ?? null,
    design_locked_at: (r.design_locked_at as string) ?? null,
    decided_at: (r.decided_at as string) ?? null,
    verdict: (r.verdict as Verdict) ?? null,
    decision: (r.decision as Decision) ?? null,
    decision_rationale: (r.decision_rationale as string) ?? null,
    status_changed_at: r.status_changed_at as string,
    created_at: r.created_at as string,
    derived_from_learning_id: (r.derived_from_learning_id as string) ?? null,
    hypothesis_if: (r.hypothesis_if as string) ?? null,
    hypothesis_then: (r.hypothesis_then as string) ?? null,
    hypothesis_because: (r.hypothesis_because as string) ?? null,
    line_id: r.line_id as string,
    line_name: r.line?.name ?? "",
    problem_id: r.problem_id as string,
    problem_title: r.problem?.title ?? "",
    stage_id: r.problem?.stage_id ?? null,
    stage_name: r.problem?.stage?.name ?? null,
    metric_id: r.metric_id as string,
    metric_name: r.metric?.name ?? "",
    owner_name: r.owner ? r.owner.name || r.owner.email : null,
  };
}

export async function listExperiments(programId: string): Promise<ExperimentListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experiments")
    .select(LIST_SELECT)
    .eq("program_id", programId)
    .order("final_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map(mapRow);
}

export async function getExperiment(experimentId: string): Promise<ExperimentListItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("experiments").select(LIST_SELECT).eq("id", experimentId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as unknown as Row) : null;
}

export interface VariantRow extends Variant {
  experiment_id: string;
  sort_order: number;
}

export async function listVariants(filter: { programId?: string; experimentId?: string }): Promise<VariantRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("experiment_variants")
    .select("id, experiment_id, name, is_control, description, sample, conversions, metric_value, notes, sort_order")
    .order("is_control", { ascending: false })
    .order("sort_order")
    .order("created_at");
  if (filter.programId) q = q.eq("program_id", filter.programId);
  if (filter.experimentId) q = q.eq("experiment_id", filter.experimentId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((v) => ({
    ...v,
    sample: v.sample == null ? null : Number(v.sample),
    conversions: v.conversions == null ? null : Number(v.conversions),
    metric_value: v.metric_value == null ? null : Number(v.metric_value),
  })) as VariantRow[];
}

export interface LearningRow {
  id: string;
  experiment_id: string;
  text: string;
  applies_to_line_ids: string[];
  suggested_hypothesis: string | null;
  created_at: string;
}

export async function getLearning(experimentId: string): Promise<LearningRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("learnings")
    .select("id, experiment_id, text, applies_to_line_ids, suggested_hypothesis, created_at")
    .eq("experiment_id", experimentId)
    .maybeSingle();
  return (data as LearningRow | null) ?? null;
}

export interface AttachmentRow {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  created_at: string;
  uploaded_by_name: string | null;
}

export async function listAttachments(entity: "problem" | "experiment", id: string): Promise<AttachmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attachments")
    .select("id, name, mime_type, size_bytes, storage_path, created_at, uploader:profiles!attachments_uploaded_by_fkey(name, email)")
    .eq(entity === "problem" ? "problem_id" : "experiment_id", id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => {
    const u = a.uploader as unknown as { name: string; email: string } | null;
    return {
      id: a.id,
      name: a.name,
      mime_type: a.mime_type,
      size_bytes: Number(a.size_bytes),
      storage_path: a.storage_path,
      created_at: a.created_at,
      uploaded_by_name: u ? u.name || u.email : null,
    };
  });
}

export interface ActivityRow {
  id: string;
  action: string;
  summary: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
}

export async function listActivity(filter: { programId: string; entityId?: string; limit?: number }): Promise<ActivityRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("activity_log")
    .select("id, action, summary, payload, created_at, actor:profiles!activity_log_actor_id_fkey(name, email)")
    .eq("program_id", filter.programId)
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 50);
  if (filter.entityId) q = q.eq("entity_id", filter.entityId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => {
    const actor = a.actor as unknown as { name: string; email: string } | null;
    return {
      id: a.id,
      action: a.action,
      summary: a.summary,
      payload: (a.payload ?? {}) as Record<string, unknown>,
      created_at: a.created_at,
      actor_name: actor ? actor.name || actor.email : null,
    };
  });
}

/**
 * Datos económicos de las métricas (unidad, dirección, línea base, valor por
 * unidad y último valor semanal) para estimar el valor de un resultado. Si la
 * columna `unit_value` todavía no existe en la base, sigue sin ella.
 */
export async function listMetricEconomics(metricIds: string[]): Promise<Map<string, MetricEconomics>> {
  const out = new Map<string, MetricEconomics>();
  const ids = [...new Set(metricIds)];
  if (!ids.length) return out;
  const supabase = await createClient();
  type MetricRow = { id: string; unit: string | null; direction: MetricDirection; baseline: number | string | null; unit_value?: number | string | null };
  let rows: MetricRow[] = [];
  const withValue = await supabase.from("metrics").select("id, unit, direction, baseline, unit_value").in("id", ids);
  if (withValue.error) {
    // 42703 = columna inexistente (la migración de valor por unidad no se ha aplicado).
    if (withValue.error.code !== "42703" && !/unit_value/.test(withValue.error.message)) throw new Error(withValue.error.message);
    const basic = await supabase.from("metrics").select("id, unit, direction, baseline").in("id", ids);
    if (basic.error) throw new Error(basic.error.message);
    rows = (basic.data ?? []) as MetricRow[];
  } else {
    rows = (withValue.data ?? []) as MetricRow[];
  }
  const { data: values, error } = await supabase
    .from("metric_values")
    .select("metric_id, week_start, value")
    .in("metric_id", ids)
    .order("week_start", { ascending: false });
  if (error) throw new Error(error.message);
  const latest = new Map<string, { week_start: string; value: number }>();
  for (const v of values ?? []) if (!latest.has(v.metric_id)) latest.set(v.metric_id, { week_start: v.week_start, value: Number(v.value) });
  for (const m of rows) {
    const l = latest.get(m.id);
    out.set(m.id, {
      id: m.id,
      unit: m.unit,
      direction: m.direction,
      baseline: m.baseline == null ? null : Number(m.baseline),
      unit_value: m.unit_value == null ? null : Number(m.unit_value),
      latest_value: l?.value ?? null,
      latest_week: l?.week_start ?? null,
    });
  }
  return out;
}
