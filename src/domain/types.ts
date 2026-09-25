// Tipos del dominio. Los valores coinciden con los enums de Postgres
// (supabase/migrations/20260925000001_schema.sql).

export const PROGRAM_ROLES = ["owner", "collaborator", "agency", "viewer"] as const;
export type ProgramRole = (typeof PROGRAM_ROLES)[number];

export const METRIC_TYPES = ["north_star", "efficiency", "input"] as const;
export type MetricType = (typeof METRIC_TYPES)[number];

export const METRIC_BRANCHES = ["demand_volume", "conversion", "efficiency", "recovery_recurrence"] as const;
export type MetricBranch = (typeof METRIC_BRANCHES)[number];

export const METRIC_DIRECTIONS = ["up", "down"] as const;
export type MetricDirection = (typeof METRIC_DIRECTIONS)[number];

export const IMPACT_LEVELS = ["high", "medium", "low"] as const;
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];

export const CONTROL_LEVELS = ["ours", "shared", "external"] as const;
export type ControlLevel = (typeof CONTROL_LEVELS)[number];

export const PROBLEM_STATUSES = ["to_validate", "validated", "discarded"] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

export const EXPERIMENT_STATUSES = [
  "idea",
  "prioritized",
  "in_design",
  "in_test",
  "in_reading",
  "decided",
  "scaled",
  "discarded",
] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const OWNER_TYPES = ["internal", "agency", "mixed"] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];

export const TEST_TYPES = ["ab", "geo", "before_after"] as const;
export type TestType = (typeof TEST_TYPES)[number];

export const VERDICTS = ["winner", "loser", "inconclusive"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const DECISIONS = ["scale", "adjust", "kill"] as const;
export type Decision = (typeof DECISIONS)[number];

export const CALENDAR_EVENT_TYPES = ["peak", "freeze", "decision"] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

/** Fecha sin hora en formato ISO `YYYY-MM-DD`. */
export type IsoDate = string;

export interface ScoringConfig {
  calendar_bonus: number;
  /** Se resta: un valor de 1 significa −1. */
  shared_penalty: number;
  /** Se resta: un valor de 3 significa −3. */
  external_penalty: number;
}

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  name: string;
  start_date: IsoDate;
  end_date: IsoDate;
}

export interface Variant {
  id: string;
  name: string;
  is_control: boolean;
  description?: string | null;
  sample: number | null;
  conversions: number | null;
  metric_value: number | null;
  notes?: string | null;
}

/** Campos del ejercicio que usan las reglas de negocio. */
export interface ExperimentCore {
  id: string;
  status: ExperimentStatus;
  created_by: string | null;
  owner_id: string | null;
  impact: number | null;
  confidence: number | null;
  ease: number | null;
  fits_calendar: boolean;
  control: ControlLevel;
  test_type: TestType | null;
  primary_metric: string | null;
  min_duration_days: number | null;
  decision_rule: string | null;
  planned_start: IsoDate | null;
  planned_end: IsoDate | null;
  actual_start: IsoDate | null;
  actual_end: IsoDate | null;
  design_locked_at: string | null;
  verdict: Verdict | null;
  decision: Decision | null;
}

export interface Actor {
  userId: string;
  isAdmin: boolean;
  /** Rol en el programa; null si no es miembro (un admin puede no serlo). */
  role: ProgramRole | null;
}
