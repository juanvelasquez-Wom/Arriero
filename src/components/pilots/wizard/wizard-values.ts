// Valores iniciales de cada paso a partir de lo guardado (se arman en el servidor).
import { DEFAULT_DECISION_RULES, type DecisionRules, type PowerInputs } from "@/domain/pilots/types";
import { defaultPowerInputs, stepsDone, type WizardProgressInput } from "@/domain/pilots/wizard";
import type { PilotDesignInput, PilotMetricsInput, PilotProblemInput } from "@/lib/validation/pilots";
import type { PilotCatalogs, PilotDetail } from "@/server/queries/pilots";
import type { PilotLinksValue } from "./links-fields";

export const EMPTY_PROGRESS: WizardProgressInput = {
  problem: null,
  hypothesis_change: null,
  hypothesis_scope: null,
  hypothesis_metric: null,
  hypothesis_expected_pct: null,
  hypothesis_reason: null,
  variable_id: null,
  test_type: null,
  primary_metric_id: null,
  has_power: false,
  has_rules: false,
  arms: 0,
  media: 0,
  checklist: 0,
};

export function progressOf(d: PilotDetail) {
  return stepsDone({
    ...d.pilot,
    has_power: d.pilot.power_result != null,
    has_rules: d.pilot.decision_rules != null,
    arms: d.arms.length,
    media: d.media.length,
    checklist: d.checklist.length,
  });
}

export const EMPTY_PROBLEM: PilotProblemInput = {
  title: "",
  problem: "",
  problem_evidence: "",
  hypothesis_change: "",
  hypothesis_scope: "",
  hypothesis_metric: "",
  hypothesis_expected_pct: null,
  hypothesis_reason: "",
};

export function problemValues(d: PilotDetail): PilotProblemInput {
  const p = d.pilot;
  return {
    title: p.title,
    problem: p.problem ?? "",
    problem_evidence: p.problem_evidence ?? "",
    hypothesis_change: p.hypothesis_change ?? "",
    hypothesis_scope: p.hypothesis_scope ?? "",
    hypothesis_metric: p.hypothesis_metric ?? "",
    hypothesis_expected_pct: p.hypothesis_expected_pct,
    hypothesis_reason: p.hypothesis_reason ?? "",
  };
}

export function linksValues(d: PilotDetail): PilotLinksValue {
  return {
    owner_id: d.pilot.owner_id,
    program_id: d.pilot.program_id,
    experiment_id: d.pilot.experiment_id,
    tree_metric_id: d.pilot.tree_metric_id,
  };
}

export function designValues(d: PilotDetail): PilotDesignInput {
  const p = d.pilot;
  const c = p.design_config ?? {};
  return {
    variable_id: p.variable_id ?? "",
    test_type: p.test_type,
    design_justification: p.design_justification ?? "",
    design_config: {
      holdout_pct: c.holdout_pct ?? null,
      pre_start: c.pre_start ?? "",
      granularity: c.granularity ?? "day",
      notes: c.notes ?? null,
    },
    planned_start: p.planned_start ?? "",
    planned_end: p.planned_end ?? "",
    planned_budget_cop: p.planned_budget_cop,
    arms: d.arms.map((a) => ({
      id: a.id,
      name: a.name,
      is_control: a.is_control,
      split_pct: a.split_pct,
      cities: a.cities,
      description: a.description,
    })),
    media: d.media.map((m) => ({
      id: m.id,
      media_id: m.media_id,
      account: m.account ?? "",
      campaign: m.campaign ?? "",
      audience: m.audience ?? "",
      destination: m.destination ?? "",
      cities: m.cities,
    })),
  };
}

export function metricsValues(d: PilotDetail, catalogs: PilotCatalogs): Omit<PilotMetricsInput, "power_inputs"> & { power_inputs: PowerInputs } {
  const p = d.pilot;
  const primary = catalogs.metrics.find((m) => m.id === p.primary_metric_id) ?? null;
  return {
    primary_metric_id: p.primary_metric_id ?? "",
    guardrails: d.guardrails.map((g) => ({ metric_id: g.metric_id, limit_pct: g.limit_pct, note: g.note })),
    power_inputs: defaultPowerInputs({
      calc: primary?.calc ?? null,
      saved: p.power_inputs,
      plannedStart: p.planned_start,
      plannedEnd: p.planned_end,
      budgetCop: p.planned_budget_cop,
      expectedPct: p.hypothesis_expected_pct,
    }),
  };
}

export function rulesValues(d: PilotDetail): DecisionRules {
  return { ...DEFAULT_DECISION_RULES, ...(d.pilot.decision_rules ?? {}) };
}

export function checklistValues(d: PilotDetail) {
  return d.checklist.map((c) => ({ id: c.id, platform: c.platform, event_name: c.event_name, description: c.description ?? "" }));
}

/** Catálogos activos, sin perder lo que el piloto ya usa aunque esté archivado. */
export function activeCatalogs(catalogs: PilotCatalogs, d: PilotDetail | null) {
  const usedMedia = new Set(d?.media.map((m) => m.media_id) ?? []);
  const usedMetrics = new Set([d?.pilot.primary_metric_id, ...(d?.guardrails.map((g) => g.metric_id) ?? [])].filter(Boolean));
  return {
    variables: catalogs.variables.filter((v) => !v.archived_at || v.id === d?.pilot.variable_id),
    media: catalogs.media.filter((m) => (!m.archived_at && !m.merged_into_id) || usedMedia.has(m.id)),
    metrics: catalogs.metrics.filter((m) => !m.archived_at || usedMetrics.has(m.id)),
  };
}
