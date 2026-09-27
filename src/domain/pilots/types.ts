// Tipos del módulo Pilotos de medios. Los valores coinciden con los enums de
// Postgres (supabase/migrations/20260927000012_pilotos.sql).
import type { Decision, IsoDate, MetricDirection, Verdict } from "../types";

export const PILOT_ROLES = ["approver", "creator", "reader"] as const;
export type PilotRole = (typeof PILOT_ROLES)[number];

export const PILOT_STATUSES = ["draft", "in_review", "approved", "in_test", "in_reading", "decided", "cancelled"] as const;
export type PilotStatus = (typeof PILOT_STATUSES)[number];

export const PILOT_TEST_TYPES = ["ab_creative", "ab_platform", "holdout", "geo", "pre_post"] as const;
export type PilotTestType = (typeof PILOT_TEST_TYPES)[number];

export const MEDIA_DATA_MODES = ["manual", "mcp"] as const;
export type MediaDataMode = (typeof MEDIA_DATA_MODES)[number];

/** Cómo se calcula una métrica del catálogo. */
export const PILOT_METRIC_CALCS = ["sum", "rate", "cost_per"] as const;
export type PilotMetricCalc = (typeof PILOT_METRIC_CALCS)[number];

export const PILOT_METRIC_SCOPES = ["platform", "business"] as const;
export type PilotMetricScope = (typeof PILOT_METRIC_SCOPES)[number];

export const PILOT_UNITS = ["count", "cop", "percent"] as const;
export type PilotUnit = (typeof PILOT_UNITS)[number];

export const MEASUREMENT_SOURCES = ["manual", "csv", "mcp"] as const;
export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[number];

export const GRANULARITIES = ["day", "week"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export const CHECKLIST_PLATFORMS = ["ga4", "gtm", "pixel", "capi", "other"] as const;
export type ChecklistPlatform = (typeof CHECKLIST_PLATFORMS)[number];

export const CHECKLIST_STATUSES = ["pending", "ok", "failed"] as const;
export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number];

export const VARIABLE_CATEGORIES = [
  "creative",
  "audience",
  "structure",
  "placements",
  "destination",
  "channel",
  "investment",
  "signal",
  "offer",
] as const;
export type VariableCategory = (typeof VARIABLE_CATEGORIES)[number];

export { type Decision, type Verdict, type MetricDirection };

/** Métrica del catálogo. Las de tipo `rate` y `cost_per` se derivan de dos métricas `sum`. */
export interface PilotMetricDef {
  id: string;
  name: string;
  unit: PilotUnit;
  direction: MetricDirection;
  scope: PilotMetricScope;
  calc: PilotMetricCalc;
  /** rate: conversiones · cost_per: inversión. */
  numerator_id: string | null;
  /** rate: base (muestra, conversaciones) · cost_per: resultados. */
  denominator_id: string | null;
  is_spend: boolean;
}

export interface PilotArm {
  id: string;
  name: string;
  is_control: boolean;
  /** Porcentaje del tráfico o del presupuesto (0–100). */
  split_pct: number | null;
  /** Solo pruebas por geografía: ciudades del grupo. */
  cities: string[];
}

/** Un valor cargado: grupo × métrica base × periodo (y ciudad en geo). */
export interface Measurement {
  arm_id: string;
  metric_id: string;
  /** Ciudad (geo) o "" cuando el valor es del grupo completo. */
  unit_label: string;
  period_start: IsoDate;
  value: number;
}

export interface PilotGuardrail {
  id: string;
  metric_id: string;
  /** Cuánto se permite empeorar, en % relativo (15 = "no empeora más de 15 %"). */
  limit_pct: number;
}

/** Reglas de decisión que se registran antes de lanzar. */
export interface DecisionRules {
  /** Escalar si la probabilidad de ganar es al menos esto (0–1). */
  scale_min_probability: number;
  /** …y la diferencia vs. control es al menos esto (% relativo). */
  scale_min_lift_pct: number;
  /** Apagar si la probabilidad de ganar es a lo sumo esto (0–1). */
  kill_max_probability: number;
  /** Un guardrail roto obliga a no escalar. */
  guardrails_block_scale: boolean;
}

export const DEFAULT_DECISION_RULES: DecisionRules = {
  scale_min_probability: 0.9,
  scale_min_lift_pct: 0,
  kill_max_probability: 0.2,
  guardrails_block_scale: true,
};

/** Entradas de la calculadora de potencia. */
export interface PowerInputs {
  /** Tasa base (0–1) para métricas `rate`; valor diario promedio para `sum` y `cost_per`. */
  baseline: number;
  /** Solo `sum`/`cost_per`: variación diaria (coeficiente de variación, 0–1+). */
  daily_cv?: number | null;
  /** `rate`: base diaria por grupo (p. ej. conversaciones por día). Otros: no aplica. */
  daily_volume_per_arm?: number | null;
  /** Días que se planea correr. */
  planned_days: number;
  /** Efecto que se quiere poder ver (% relativo); por defecto el esperado de la hipótesis. */
  target_mde_pct?: number | null;
  /** Inversión diaria total planeada (COP), para saber cuántos días alcanza el presupuesto. */
  daily_spend_cop?: number | null;
  alpha?: number;
  power?: number;
}

export interface PowerResult {
  /** MDE alcanzable con los días planeados (% relativo), null si no se puede calcular. */
  mde_pct: number | null;
  /** Días necesarios para ver `target_mde_pct`, null si no se puede calcular. */
  days_needed: number | null;
  /** Días que alcanza el presupuesto. */
  budget_days: number | null;
  warnings: string[];
}

export interface PilotMediaRef {
  media_id: string;
  media_name: string;
  account: string | null;
  campaign: string | null;
  audience: string | null;
  destination: string | null;
  cities: string[];
}

export interface PilotSummary {
  id: string;
  title: string;
  status: PilotStatus;
  test_type: PilotTestType | null;
  start: IsoDate | null;
  end: IsoDate | null;
  media: PilotMediaRef[];
  /** Ciudades de los grupos (geo). */
  arm_cities: string[];
}
