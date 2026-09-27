import "server-only";
import type { DecisionRules, PilotMetricDef, PilotRole, PilotStatus, PilotSummary, PilotTestType, PowerInputs, PowerResult } from "@/domain/pilots/types";
import type { Decision, ImpactLevel, Verdict } from "@/domain/types";
import { createClient } from "@/lib/supabase/server";

// -----------------------------------------------------------------------------
// Tipos de lectura (lo que reciben las pantallas)
// -----------------------------------------------------------------------------

export interface MediaChannel {
  id: string;
  name: string;
  kind: string | null;
  provider: string | null;
  data_mode: "manual" | "mcp";
  integration: string | null;
  archived_at: string | null;
  merged_into_id: string | null;
}

export interface PilotVariable {
  id: string;
  category: string;
  name: string;
  description: string | null;
  recommended_test_type: PilotTestType;
  alternative_test_type: PilotTestType | null;
  sort_order: number;
  archived_at: string | null;
}

export interface CatalogMetric extends PilotMetricDef {
  description: string | null;
  media_id: string | null;
  archived_at: string | null;
}

export interface PilotCatalogs {
  media: MediaChannel[];
  variables: PilotVariable[];
  metrics: CatalogMetric[];
}

export interface PilotRow {
  id: string;
  title: string;
  problem: string | null;
  problem_evidence: string | null;
  hypothesis_change: string | null;
  hypothesis_scope: string | null;
  hypothesis_metric: string | null;
  hypothesis_expected_pct: number | null;
  hypothesis_reason: string | null;
  variable_id: string | null;
  test_type: PilotTestType | null;
  design_justification: string | null;
  design_config: { holdout_pct?: number | null; pre_start?: string | null; granularity?: "day" | "week"; notes?: string | null };
  primary_metric_id: string | null;
  power_inputs: PowerInputs | null;
  power_result: PowerResult | null;
  decision_rules: DecisionRules | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  planned_budget_cop: number | null;
  owner_id: string | null;
  status: PilotStatus;
  status_changed_at: string;
  submitted_at: string | null;
  design_locked_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  verdict: Verdict | null;
  decision: Decision | null;
  decision_justification: string | null;
  decided_by: string | null;
  decided_at: string | null;
  cancel_reason: string | null;
  program_id: string | null;
  experiment_id: string | null;
  tree_metric_id: string | null;
  is_example: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  deleted_at: string | null;
}

export interface PilotArmRow {
  id: string;
  name: string;
  is_control: boolean;
  split_pct: number | null;
  cities: string[];
  description: string | null;
  sort_order: number;
}

export interface PilotMediaRow {
  id: string;
  media_id: string;
  media_name: string;
  data_mode: "manual" | "mcp";
  account: string | null;
  campaign: string | null;
  audience: string | null;
  destination: string | null;
  cities: string[];
}

export interface PilotGuardrailRow {
  id: string;
  metric_id: string;
  limit_pct: number;
  note: string | null;
}

export interface ChecklistRow {
  id: string;
  platform: "ga4" | "gtm" | "pixel" | "capi" | "other";
  event_name: string;
  description: string | null;
  status: "pending" | "ok" | "failed";
  evidence: string | null;
  checked_by: string | null;
  checked_at: string | null;
}

export interface MeasurementRow {
  id: string;
  arm_id: string;
  metric_id: string;
  unit_label: string;
  period_start: string;
  granularity: "day" | "week";
  value: number;
  source: "manual" | "csv" | "mcp";
  snapshot_id: string | null;
  original_value: number | null;
  adjusted_at: string | null;
  adjusted_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface IncidentRow {
  id: string;
  occurred_on: string;
  description: string;
  expected_impact: ImpactLevel;
  created_by: string | null;
  created_at: string;
}

export interface ReviewRow {
  id: string;
  action: "submitted" | "returned" | "approved" | "started" | "to_reading" | "decided" | "cancelled" | "deleted" | "restored";
  comment: string | null;
  actor_id: string | null;
  created_at: string;
}

export interface AuditRow {
  id: number;
  table_name: string;
  row_id: string | null;
  op: "insert" | "update" | "delete";
  actor_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_at: string;
}

export interface PilotDetail {
  pilot: PilotRow;
  arms: PilotArmRow[];
  media: PilotMediaRow[];
  guardrails: PilotGuardrailRow[];
  checklist: ChecklistRow[];
  measurements: MeasurementRow[];
  incidents: IncidentRow[];
  reviews: ReviewRow[];
  learning: { text: string; created_at: string } | null;
  missing: string[];
  /** id → nombre de las personas que aparecen en el piloto. */
  people: Record<string, string>;
}

export interface PilotListItem {
  id: string;
  title: string;
  status: PilotStatus;
  test_type: PilotTestType | null;
  variable_name: string | null;
  variable_category: string | null;
  primary_metric_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  planned_budget_cop: number | null;
  spent_cop: number;
  media_names: string[];
  decision: Decision | null;
  verdict: Verdict | null;
  is_example: boolean;
  deleted_at: string | null;
  updated_at: string;
  summary: PilotSummary;
}

const PILOT_COLUMNS =
  "id, title, problem, problem_evidence, hypothesis_change, hypothesis_scope, hypothesis_metric, hypothesis_expected_pct, hypothesis_reason, variable_id, test_type, design_justification, design_config, primary_metric_id, power_inputs, power_result, decision_rules, planned_start, planned_end, actual_start, actual_end, planned_budget_cop, owner_id, status, status_changed_at, submitted_at, design_locked_at, approved_by, approved_at, verdict, decision, decision_justification, decided_by, decided_at, cancel_reason, program_id, experiment_id, tree_metric_id, is_example, created_at, updated_at, created_by, deleted_at";

const num = (v: unknown): number | null => (v == null ? null : Number(v));

// -----------------------------------------------------------------------------
// Catálogos
// -----------------------------------------------------------------------------

export async function loadPilotCatalogs(): Promise<PilotCatalogs> {
  const supabase = await createClient();
  const [media, variables, metrics] = await Promise.all([
    supabase.from("media_channels").select("id, name, kind, provider, data_mode, integration, archived_at, merged_into_id").order("name"),
    supabase
      .from("pilot_variables")
      .select("id, category, name, description, recommended_test_type, alternative_test_type, sort_order, archived_at")
      .order("sort_order")
      .order("name"),
    supabase
      .from("pilot_metrics")
      .select("id, name, description, unit, direction, scope, calc, numerator_id, denominator_id, is_spend, media_id, archived_at")
      .order("calc")
      .order("name"),
  ]);
  return {
    media: (media.data ?? []) as MediaChannel[],
    variables: (variables.data ?? []) as PilotVariable[],
    metrics: (metrics.data ?? []) as CatalogMetric[],
  };
}

// -----------------------------------------------------------------------------
// Personas
// -----------------------------------------------------------------------------

export async function loadPeople(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, name, email").in("id", unique);
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.name || p.email]));
}

export interface PilotMember {
  user_id: string;
  name: string;
  email: string;
  role: PilotRole | null;
  is_admin: boolean;
}

/** Personas del módulo; el aprobador ve a todas (para asignar roles). */
export async function listPilotMembers(): Promise<PilotMember[]> {
  const supabase = await createClient();
  const [{ data: profiles }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("id, name, email, is_admin").order("name"),
    supabase.from("pilot_roles").select("user_id, role"),
  ]);
  const byUser = new Map((roles ?? []).map((r) => [r.user_id as string, r.role as PilotRole]));
  return (profiles ?? []).map((p) => ({
    user_id: p.id,
    name: p.name || p.email,
    email: p.email,
    role: byUser.get(p.id) ?? null,
    is_admin: !!p.is_admin,
  }));
}

// -----------------------------------------------------------------------------
// Pilotos
// -----------------------------------------------------------------------------

export async function listPilots(options: { includeDeleted?: boolean } = {}): Promise<PilotListItem[]> {
  const supabase = await createClient();
  let q = supabase
    .from("pilots")
    .select(
      "id, title, status, test_type, owner_id, planned_start, planned_end, actual_start, actual_end, planned_budget_cop, decision, verdict, is_example, deleted_at, updated_at, variable:pilot_variables(name, category), primary:pilot_metrics!pilots_primary_metric_id_fkey(name), pilot_media(media_id, account, campaign, audience, destination, cities, media:media_channels(name)), pilot_arms(cities)",
    )
    .order("updated_at", { ascending: false });
  if (!options.includeDeleted) q = q.is("deleted_at", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  // Inversión ejecutada: suma de la métrica de inversión desde el inicio real.
  const ids = rows.map((r) => r.id);
  const spent = new Map<string, number>();
  if (ids.length) {
    const { data: spendMetric } = await supabase.from("pilot_metrics").select("id").eq("is_spend", true).eq("calc", "sum");
    const spendIds = (spendMetric ?? []).map((m) => m.id);
    if (spendIds.length) {
      const { data: ms } = await supabase.from("pilot_measurements").select("pilot_id, value, period_start").in("pilot_id", ids).in("metric_id", spendIds);
      const starts = new Map(rows.map((r) => [r.id, r.actual_start as string | null]));
      for (const m of ms ?? []) {
        const start = starts.get(m.pilot_id);
        if (start && m.period_start < start) continue;
        spent.set(m.pilot_id, (spent.get(m.pilot_id) ?? 0) + Number(m.value));
      }
    }
  }
  const people = await loadPeople(rows.map((r) => r.owner_id));

  return rows.map((r) => {
    const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
    const variable = one(r.variable as { name: string; category: string } | { name: string; category: string }[] | null);
    const primary = one(r.primary as { name: string } | { name: string }[] | null);
    const media = ((r.pilot_media ?? []) as {
      media_id: string;
      account: string | null;
      campaign: string | null;
      audience: string | null;
      destination: string | null;
      cities: string[];
      media: { name: string } | { name: string }[] | null;
    }[]).map((m) => ({
      media_id: m.media_id,
      media_name: one(m.media)?.name ?? "Medio",
      account: m.account,
      campaign: m.campaign,
      audience: m.audience,
      destination: m.destination,
      cities: m.cities ?? [],
    }));
    const armCities = ((r.pilot_arms ?? []) as { cities: string[] }[]).flatMap((a) => a.cities ?? []);
    const start = (r.actual_start ?? r.planned_start) as string | null;
    const end = (r.actual_end ?? r.planned_end) as string | null;
    return {
      id: r.id,
      title: r.title,
      status: r.status as PilotStatus,
      test_type: r.test_type as PilotTestType | null,
      variable_name: variable?.name ?? null,
      variable_category: variable?.category ?? null,
      primary_metric_name: primary?.name ?? null,
      owner_id: r.owner_id,
      owner_name: r.owner_id ? (people[r.owner_id] ?? null) : null,
      planned_start: r.planned_start,
      planned_end: r.planned_end,
      actual_start: r.actual_start,
      actual_end: r.actual_end,
      planned_budget_cop: num(r.planned_budget_cop),
      spent_cop: spent.get(r.id) ?? 0,
      media_names: [...new Set(media.map((m) => m.media_name))],
      decision: r.decision as Decision | null,
      verdict: r.verdict as Verdict | null,
      is_example: r.is_example,
      deleted_at: r.deleted_at,
      updated_at: r.updated_at,
      summary: { id: r.id, title: r.title, status: r.status as PilotStatus, test_type: r.test_type as PilotTestType | null, start, end, media, arm_cities: armCities },
    };
  });
}

export async function loadPilotDetail(pilotId: string): Promise<PilotDetail | null> {
  const supabase = await createClient();
  const { data: pilot } = await supabase.from("pilots").select(PILOT_COLUMNS).eq("id", pilotId).maybeSingle();
  if (!pilot) return null;
  const [arms, media, guardrails, checklist, measurements, incidents, reviews, learning, missing] = await Promise.all([
    supabase.from("pilot_arms").select("id, name, is_control, split_pct, cities, description, sort_order").eq("pilot_id", pilotId).order("sort_order").order("created_at"),
    supabase
      .from("pilot_media")
      .select("id, media_id, account, campaign, audience, destination, cities, media:media_channels(name, data_mode)")
      .eq("pilot_id", pilotId)
      .order("sort_order")
      .order("created_at"),
    supabase.from("pilot_guardrails").select("id, metric_id, limit_pct, note").eq("pilot_id", pilotId).order("created_at"),
    supabase
      .from("pilot_checklist_items")
      .select("id, platform, event_name, description, status, evidence, checked_by, checked_at")
      .eq("pilot_id", pilotId)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("pilot_measurements")
      .select("id, arm_id, metric_id, unit_label, period_start, granularity, value, source, snapshot_id, original_value, adjusted_at, adjusted_by, created_by, updated_by, updated_at")
      .eq("pilot_id", pilotId)
      .order("period_start"),
    supabase.from("pilot_incidents").select("id, occurred_on, description, expected_impact, created_by, created_at").eq("pilot_id", pilotId).order("occurred_on", { ascending: false }),
    supabase.from("pilot_reviews").select("id, action, comment, actor_id, created_at").eq("pilot_id", pilotId).order("created_at"),
    supabase.from("pilot_learnings").select("text, created_at").eq("pilot_id", pilotId).maybeSingle(),
    pilot.deleted_at ? Promise.resolve({ data: [] as string[] }) : supabase.rpc("pilot_missing", { p_pilot: pilotId }),
  ]);
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const mediaRows: PilotMediaRow[] = ((media.data ?? []) as (Omit<PilotMediaRow, "media_name" | "data_mode"> & {
    media: { name: string; data_mode: "manual" | "mcp" } | { name: string; data_mode: "manual" | "mcp" }[] | null;
  })[]).map(({ media: m, ...rest }) => ({ ...rest, cities: rest.cities ?? [], media_name: one(m)?.name ?? "Medio", data_mode: one(m)?.data_mode ?? "manual" }));
  const measurementRows = ((measurements.data ?? []) as MeasurementRow[]).map((m) => ({
    ...m,
    value: Number(m.value),
    original_value: num(m.original_value),
  }));
  const incidentRows = (incidents.data ?? []) as IncidentRow[];
  const reviewRows = (reviews.data ?? []) as ReviewRow[];
  const checklistRows = (checklist.data ?? []) as ChecklistRow[];
  const people = await loadPeople([
    pilot.owner_id,
    pilot.created_by,
    pilot.approved_by,
    pilot.decided_by,
    ...reviewRows.map((r) => r.actor_id),
    ...incidentRows.map((i) => i.created_by),
    ...checklistRows.map((c) => c.checked_by),
    ...measurementRows.flatMap((m) => [m.updated_by, m.adjusted_by]),
  ]);
  return {
    pilot: {
      ...(pilot as unknown as PilotRow),
      hypothesis_expected_pct: num(pilot.hypothesis_expected_pct),
      planned_budget_cop: num(pilot.planned_budget_cop),
      design_config: (pilot.design_config ?? {}) as PilotRow["design_config"],
    },
    arms: ((arms.data ?? []) as PilotArmRow[]).map((a) => ({ ...a, split_pct: num(a.split_pct), cities: a.cities ?? [] })),
    media: mediaRows,
    guardrails: ((guardrails.data ?? []) as PilotGuardrailRow[]).map((g) => ({ ...g, limit_pct: Number(g.limit_pct) })),
    checklist: checklistRows,
    measurements: measurementRows,
    incidents: incidentRows,
    reviews: reviewRows,
    learning: (learning.data as { text: string; created_at: string } | null) ?? null,
    missing: ((missing as { data: string[] | null }).data ?? []) as string[],
    people,
  };
}

export async function loadPilotAudit(pilotId: string, limit = 300): Promise<AuditRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pilot_audit")
    .select("id, table_name, row_id, op, actor_id, old_data, new_data, changed_at")
    .eq("pilot_id", pilotId)
    .order("changed_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AuditRow[];
}

export interface PilotLearningItem {
  pilot_id: string;
  pilot_title: string;
  text: string;
  created_at: string;
  verdict: Verdict | null;
  decision: Decision | null;
  test_type: PilotTestType | null;
  variable_name: string | null;
  variable_category: string | null;
  media_names: string[];
  decided_at: string | null;
  is_example: boolean;
}

export async function listPilotLearnings(): Promise<PilotLearningItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pilot_learnings")
    .select(
      "text, created_at, pilot:pilots!inner(id, title, verdict, decision, test_type, decided_at, is_example, deleted_at, variable:pilot_variables(name, category), pilot_media(media:media_channels(name)))",
    )
    .order("created_at", { ascending: false });
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  type Raw = {
    text: string;
    created_at: string;
    pilot: {
      id: string;
      title: string;
      verdict: Verdict | null;
      decision: Decision | null;
      test_type: PilotTestType | null;
      decided_at: string | null;
      is_example: boolean;
      deleted_at: string | null;
      variable: { name: string; category: string } | { name: string; category: string }[] | null;
      pilot_media: { media: { name: string } | { name: string }[] | null }[];
    };
  };
  return ((data ?? []) as unknown as Raw[])
    .map((r) => ({ ...r, pilot: one(r.pilot as Raw["pilot"] | Raw["pilot"][])! }))
    .filter((r) => r.pilot && !r.pilot.deleted_at)
    .map((r) => {
      const variable = one(r.pilot.variable);
      return {
        pilot_id: r.pilot.id,
        pilot_title: r.pilot.title,
        text: r.text,
        created_at: r.created_at,
        verdict: r.pilot.verdict,
        decision: r.pilot.decision,
        test_type: r.pilot.test_type,
        variable_name: variable?.name ?? null,
        variable_category: variable?.category ?? null,
        media_names: [...new Set((r.pilot.pilot_media ?? []).map((m) => one(m.media)?.name).filter((x): x is string => !!x))],
        decided_at: r.pilot.decided_at,
        is_example: r.pilot.is_example,
      };
    });
}

// -----------------------------------------------------------------------------
// Vínculos con el resto de Arriero (lo que la persona ya puede ver por RLS)
// -----------------------------------------------------------------------------

export interface LinkOptions {
  programs: { id: string; name: string }[];
  experiments: { id: string; title: string; program_id: string }[];
  metrics: { id: string; name: string; program_id: string; line_name: string }[];
}

export async function loadLinkOptions(): Promise<LinkOptions> {
  const supabase = await createClient();
  const [programs, experiments, metrics] = await Promise.all([
    supabase.from("programs").select("id, name").is("deleted_at", null).order("name"),
    supabase.from("experiments").select("id, title, program_id").is("deleted_at", null).order("updated_at", { ascending: false }).limit(300),
    supabase.from("metrics").select("id, name, program_id, line:business_lines(name)").is("deleted_at", null).order("name").limit(500),
  ]);
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  return {
    programs: (programs.data ?? []) as LinkOptions["programs"],
    experiments: (experiments.data ?? []) as LinkOptions["experiments"],
    metrics: ((metrics.data ?? []) as { id: string; name: string; program_id: string; line: { name: string } | { name: string }[] | null }[]).map((m) => ({
      id: m.id,
      name: m.name,
      program_id: m.program_id,
      line_name: one(m.line)?.name ?? "",
    })),
  };
}

// -----------------------------------------------------------------------------
// Borradores de La Tía
// -----------------------------------------------------------------------------

export interface PilotDraftRow {
  id: string;
  kind: "diagnosis" | "design" | "conclusion";
  content: string;
  status: "draft" | "edited" | "approved";
  created_at: string;
  reviewed_at: string | null;
}

/** Último borrador de cada tipo (null si la tabla todavía no existe o no hay). */
export async function loadPilotDrafts(pilotId: string): Promise<PilotDraftRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pilot_ai_drafts")
    .select("id, kind, content, status, created_at, reviewed_at")
    .eq("pilot_id", pilotId)
    .order("created_at", { ascending: false });
  if (error) return [];
  const seen = new Set<string>();
  return ((data ?? []) as PilotDraftRow[]).filter((d) => (seen.has(d.kind) ? false : (seen.add(d.kind), true)));
}
