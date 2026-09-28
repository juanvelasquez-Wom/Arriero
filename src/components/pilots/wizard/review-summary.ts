// Resumen "Así queda el piloto" de la última pantalla del asistente, armado en
// el servidor con lo guardado. Solo texto: cada fila dice en qué paso se cambia.
import { formatDateRange } from "@/domain/format";
import { hypothesisSentence, type PilotStepKey } from "@/domain/pilots/flow";
import { PILOT_TEST_TYPE_LABEL } from "@/domain/pilots/labels";
import type { DecisionRules, PilotTestType } from "@/domain/pilots/types";
import { rulesSentence } from "@/domain/pilots/wizard";
import { formatCop } from "@/domain/value";

export interface ReviewRow {
  label: string;
  value: string;
  step: PilotStepKey;
  /** false = falta completarlo. */
  filled: boolean;
}

export interface ReviewInput {
  pilot: {
    title: string;
    problem: string | null;
    hypothesis_change: string | null;
    hypothesis_scope: string | null;
    hypothesis_metric: string | null;
    hypothesis_expected_pct: number | null;
    hypothesis_reason: string | null;
    variable_id: string | null;
    test_type: PilotTestType | null;
    planned_start: string | null;
    planned_end: string | null;
    planned_budget_cop: number | null;
    primary_metric_id: string | null;
    decision_rules: Partial<DecisionRules> | null;
  };
  arms: { name: string; is_control: boolean }[];
  media: { media_name: string }[];
  guardrails: { metric_id: string }[];
  checklist: unknown[];
}

const PENDING = "Falta";

export function pilotReviewRows(
  d: ReviewInput,
  names: { variables: Record<string, string>; metrics: Record<string, string> },
  defaults: DecisionRules,
): ReviewRow[] {
  const p = d.pilot;
  const sentence = hypothesisSentence({
    change: p.hypothesis_change,
    scope: p.hypothesis_scope,
    metric: p.hypothesis_metric,
    expectedPct: p.hypothesis_expected_pct,
    reason: p.hypothesis_reason,
  });
  const control = d.arms.find((a) => a.is_control);
  const primary = p.primary_metric_id ? names.metrics[p.primary_metric_id] : null;
  const guardrails = d.guardrails.map((g) => names.metrics[g.metric_id]).filter(Boolean);
  const dates = p.planned_start || p.planned_end ? formatDateRange(p.planned_start, p.planned_end) : null;
  const plan = [dates, p.planned_budget_cop != null ? formatCop(p.planned_budget_cop) : null].filter(Boolean).join(" · ");

  return [
    { label: "Piloto", value: p.title, step: "problema", filled: true },
    { label: "Oportunidad de mejora", value: p.problem?.trim() || PENDING, step: "problema", filled: !!p.problem?.trim() },
    { label: "Hipótesis", value: sentence, step: "problema", filled: !sentence.includes("[") },
    {
      label: "Qué se prueba",
      value:
        [p.variable_id ? names.variables[p.variable_id] : null, p.test_type ? PILOT_TEST_TYPE_LABEL[p.test_type] : null].filter(Boolean).join(" · ") ||
        PENDING,
      step: "prueba",
      filled: !!p.variable_id && !!p.test_type,
    },
    {
      label: "Grupos",
      value: d.arms.length
        ? `${d.arms.length} ${d.arms.length === 1 ? "grupo" : "grupos"}${control ? ` · control: ${control.name}` : ""}`
        : PENDING,
      step: "prueba",
      filled: d.arms.length >= 2,
    },
    { label: "Medios", value: d.media.map((m) => m.media_name).join(", ") || PENDING, step: "prueba", filled: d.media.length > 0 },
    { label: "Fechas y presupuesto", value: plan || PENDING, step: "prueba", filled: !!plan },
    {
      label: "Métricas",
      value: primary ? `${primary}${guardrails.length ? ` · guardrails: ${guardrails.join(", ")}` : ""}` : PENDING,
      step: "metricas",
      filled: !!primary,
    },
    {
      label: "Reglas de decisión",
      value: p.decision_rules ? rulesSentence({ ...defaults, ...p.decision_rules }) : PENDING,
      step: "reglas",
      filled: p.decision_rules != null,
    },
    {
      label: "Eventos a verificar",
      value: d.checklist.length ? `${d.checklist.length} ${d.checklist.length === 1 ? "evento" : "eventos"}` : PENDING,
      step: "medicion",
      filled: d.checklist.length > 0,
    },
  ];
}
