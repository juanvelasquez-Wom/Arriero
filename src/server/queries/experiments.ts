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
import type { ExperimentPowerInputs } from "@/domain/experiment-power";
import type { PowerResult } from "@/domain/pilots/types";
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
  /** Canal del problema del que nace (para ver cruces entre ejercicios). */
  problem_channel: string | null;
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
  problem:problems!experiments_problem_id_fkey(title, stage_id, channel, stage:funnel_stages!problems_stage_id_fkey(name)),
  metric:metrics!experiments_metric_id_fkey(name),
  owner:profiles!experiments_owner_id_fkey(name, email)
`;

type Row = Record<string, unknown> & {
  line: { name: string } | null;
  problem: { title: string; stage_id: string; channel: string | null; stage: { name: string } | null } | null;
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
    problem_channel: r.problem?.channel ?? null,
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

/**
 * ¿El error es porque falta una columna o tabla de una migración pendiente?
 * (42703 columna, 42P01 tabla, PGRST204/205 no está en el esquema de la API.)
 */
function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return ["42703", "42P01", "PGRST204", "PGRST205", "PGRST200"].includes(error.code ?? "") || /does not exist|schema cache/i.test(error.message ?? "");
}

export interface VariantRow extends Variant {
  experiment_id: string;
  sort_order: number;
  /** Valor de cada guardrail en esta variante: { guardrail_id: valor }. */
  guardrail_values: Record<string, number>;
}

const VARIANT_COLUMNS = "id, experiment_id, name, is_control, description, sample, conversions, metric_value, notes, sort_order";

export async function listVariants(filter: { programId?: string; experimentId?: string }): Promise<VariantRow[]> {
  const supabase = await createClient();
  const run = (columns: string) => {
    let q = supabase
      .from("experiment_variants")
      .select(columns)
      .order("is_control", { ascending: false })
      .order("sort_order")
      .order("created_at");
    if (filter.programId) q = q.eq("program_id", filter.programId);
    if (filter.experimentId) q = q.eq("experiment_id", filter.experimentId);
    return q;
  };
  let res = await run(`${VARIANT_COLUMNS}, guardrail_values`);
  // Sin la migración de guardrails, se lee sin esa columna.
  if (res.error && isMissingSchema(res.error)) res = await run(VARIANT_COLUMNS);
  if (res.error) throw new Error(res.error.message);
  return ((res.data ?? []) as unknown as Record<string, unknown>[]).map((v) => ({
    ...(v as unknown as VariantRow),
    sample: v.sample == null ? null : Number(v.sample),
    conversions: v.conversions == null ? null : Number(v.conversions),
    metric_value: v.metric_value == null ? null : Number(v.metric_value),
    guardrail_values: numberRecord(v.guardrail_values),
  }));
}

function numberRecord(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, val] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(val);
    if (val != null && val !== "" && Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export interface LearningRow {
  id: string;
  experiment_id: string;
  text: string;
  applies_to_line_ids: string[];
  suggested_hypothesis: string | null;
  created_at: string;
  /** Palanca (clave de VARIABLE_CATEGORY_LABEL) y canal: taxonomía común con Pilotos. */
  lever: string | null;
  channel: string | null;
}

const LEARNING_COLUMNS = "id, experiment_id, text, applies_to_line_ids, suggested_hypothesis, created_at";

export async function getLearning(experimentId: string): Promise<LearningRow | null> {
  const supabase = await createClient();
  const run = (columns: string) => supabase.from("learnings").select(columns).eq("experiment_id", experimentId).maybeSingle();
  let res = await run(`${LEARNING_COLUMNS}, lever, channel`);
  if (res.error && isMissingSchema(res.error)) res = await run(LEARNING_COLUMNS);
  const data = res.data as unknown as (Omit<LearningRow, "lever" | "channel"> & { lever?: string | null; channel?: string | null }) | null;
  return data ? { ...data, lever: data.lever ?? null, channel: data.channel ?? null } : null;
}

export interface ExperimentGuardrailRow {
  id: string;
  metric_id: string;
  metric_name: string;
  direction: MetricDirection;
  unit: string | null;
  limit_pct: number;
  note: string | null;
}

/** Potencia y guardrails del ejercicio (X1). `ready` es false si la migración no se ha aplicado. */
export interface ExperimentRigor {
  ready: boolean;
  expected_effect_pct: number | null;
  power_inputs: ExperimentPowerInputs | null;
  power_result: PowerResult | null;
  guardrails: ExperimentGuardrailRow[];
}

export async function getExperimentRigor(experimentId: string): Promise<ExperimentRigor> {
  const empty: ExperimentRigor = { ready: false, expected_effect_pct: null, power_inputs: null, power_result: null, guardrails: [] };
  const supabase = await createClient();
  const [exp, gs] = await Promise.all([
    supabase.from("experiments").select("expected_effect_pct, power_inputs, power_result").eq("id", experimentId).maybeSingle(),
    supabase
      .from("experiment_guardrails")
      .select("id, metric_id, limit_pct, note, created_at, metric:metrics!experiment_guardrails_metric_id_fkey(name, direction, unit)")
      .eq("experiment_id", experimentId)
      .order("created_at"),
  ]);
  if (exp.error) {
    if (isMissingSchema(exp.error)) return empty;
    throw new Error(exp.error.message);
  }
  if (gs.error && !isMissingSchema(gs.error)) throw new Error(gs.error.message);
  const row = exp.data as { expected_effect_pct: number | string | null; power_inputs: ExperimentPowerInputs | null; power_result: PowerResult | null } | null;
  return {
    ready: !gs.error,
    expected_effect_pct: row?.expected_effect_pct == null ? null : Number(row.expected_effect_pct),
    power_inputs: row?.power_inputs ?? null,
    power_result: row?.power_result ?? null,
    guardrails: ((gs.data ?? []) as unknown as {
      id: string;
      metric_id: string;
      limit_pct: number | string;
      note: string | null;
      metric: { name: string; direction: MetricDirection; unit: string | null } | null;
    }[]).map((g) => ({
      id: g.id,
      metric_id: g.metric_id,
      metric_name: g.metric?.name ?? "Métrica borrada",
      direction: g.metric?.direction ?? "up",
      unit: g.metric?.unit ?? null,
      limit_pct: Number(g.limit_pct),
      note: g.note,
    })),
  };
}

/** ¿Ya existen los guardrails y la potencia en la base (migración X1 aplicada)? */
export async function rigorAvailable(): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("experiment_guardrails").select("id").limit(1);
  return !isMissingSchema(error);
}

/** Efecto esperado de cada ejercicio del programa (para ubicar el impacto sugerido). */
export async function listExpectedEffects(programId: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experiments")
    .select("id, expected_effect_pct")
    .eq("program_id", programId)
    .not("expected_effect_pct", "is", null);
  if (error) {
    if (isMissingSchema(error)) return new Map();
    throw new Error(error.message);
  }
  return new Map((data ?? []).map((e) => [e.id as string, Number(e.expected_effect_pct)]));
}

/** Valores semanales de una métrica, del más viejo al más nuevo. */
export async function listMetricWeeklyValues(metricId: string): Promise<{ week_start: string; value: number }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("metric_values").select("week_start, value").eq("metric_id", metricId).order("week_start");
  if (error) throw new Error(error.message);
  return (data ?? []).map((v) => ({ week_start: v.week_start as string, value: Number(v.value) }));
}

/** Cuántos adjuntos tiene cada problema del programa (para la confianza sugerida). */
export async function countProblemAttachments(programId: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("attachments").select("problem_id").eq("program_id", programId).not("problem_id", "is", null);
  if (error) throw new Error(error.message);
  const out = new Map<string, number>();
  for (const a of data ?? []) out.set(a.problem_id as string, (out.get(a.problem_id as string) ?? 0) + 1);
  return out;
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
