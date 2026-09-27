// Lógica pura del asistente de pilotos: qué pasos están listos, grupos por tipo
// de prueba, reparto del tráfico, resumen para los cruces y reglas en palabras.
import { daysBetween } from "../dates";
import type { IsoDate } from "../types";
import { PILOT_STEPS, type PilotStepKey, type ReadinessInput } from "./flow";
import { pctText } from "./numbers";
import type { DecisionRules, PilotMetricCalc, PilotStatus, PilotSummary, PilotTestType, PowerInputs } from "./types";

// -----------------------------------------------------------------------------
// Pasos listos
// -----------------------------------------------------------------------------

/** Lo mínimo del piloto para saber qué pasos ya tienen algo guardado. */
export interface WizardProgressInput {
  problem: string | null;
  hypothesis_change: string | null;
  hypothesis_scope: string | null;
  hypothesis_metric: string | null;
  hypothesis_expected_pct: number | null;
  hypothesis_reason: string | null;
  variable_id: string | null;
  test_type: PilotTestType | null;
  primary_metric_id: string | null;
  has_power: boolean;
  has_rules: boolean;
  arms: number;
  media: number;
  checklist: number;
}

const filled = (s: string | null | undefined) => !!s && s.trim().length > 0;

export function stepsDone(p: WizardProgressInput): Record<PilotStepKey, boolean> {
  return {
    problema:
      filled(p.problem) &&
      filled(p.hypothesis_change) &&
      filled(p.hypothesis_scope) &&
      filled(p.hypothesis_metric) &&
      p.hypothesis_expected_pct != null &&
      filled(p.hypothesis_reason),
    prueba: !!p.variable_id && !!p.test_type && p.arms >= 2 && p.media >= 1,
    metricas: !!p.primary_metric_id && p.has_power,
    reglas: p.has_rules,
    medicion: p.checklist > 0,
  };
}

/**
 * ¿Se puede abrir este paso? Con el piloto creado se abre todo lo que ya está
 * listo, el paso actual y el primero que falta; sin piloto, solo el primero.
 */
export function isStepReachable(step: PilotStepKey, done: Record<PilotStepKey, boolean>, exists: boolean): boolean {
  if (!exists) return step === "problema";
  const index = PILOT_STEPS.findIndex((s) => s.key === step);
  const firstPending = PILOT_STEPS.findIndex((s) => !done[s.key]);
  return done[step] || firstPending === -1 || index <= firstPending;
}

/** Porcentaje de pasos listos (0–100). */
export function wizardProgress(done: Record<PilotStepKey, boolean>): number {
  const n = PILOT_STEPS.filter((s) => done[s.key]).length;
  return Math.round((n / PILOT_STEPS.length) * 100);
}

// -----------------------------------------------------------------------------
// Grupos por tipo de prueba
// -----------------------------------------------------------------------------

export interface ArmDraft {
  id?: string | null;
  name: string;
  is_control: boolean;
  split_pct: number | null;
  cities: string[];
  description?: string | null;
}

/** Nombres por defecto: [control, variante 1, variante 2…]. */
export const ARM_TEMPLATE_NAMES: Record<PilotTestType, { control: string; variant: (i: number) => string }> = {
  ab_creative: { control: "Control", variant: (i) => `Variante ${String.fromCharCode(66 + i)}` },
  ab_platform: { control: "Control", variant: (i) => `Variante ${String.fromCharCode(66 + i)}` },
  holdout: { control: "Holdout", variant: () => "Expuesto" },
  geo: { control: "Ciudades de control", variant: (i) => (i === 0 ? "Ciudades de prueba" : `Ciudades de prueba ${i + 1}`) },
  pre_post: { control: "Serie de control", variant: (i) => (i === 0 ? "Serie de prueba" : `Serie de prueba ${i + 1}`) },
};

export const DEFAULT_HOLDOUT_PCT = 10;

/** ¿El nombre es uno de los que pone Arriero (y se puede renombrar al cambiar de tipo)? */
function isTemplateName(name: string): boolean {
  const n = name.trim();
  if (!n) return true;
  return Object.values(ARM_TEMPLATE_NAMES).some((t) => t.control === n || Array.from({ length: 12 }, (_, i) => t.variant(i)).includes(n));
}

/** Reparte 100 % en `n` partes con un decimal; la primera absorbe el redondeo. */
export function splitEvenly(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor((1000 / n)) / 10;
  const rest = Math.round((100 - base * n) * 10) / 10;
  return Array.from({ length: n }, (_, i) => (i === 0 ? Math.round((base + rest) * 10) / 10 : base));
}

/** Reparto de un holdout: [expuesto, holdout]. */
export function holdoutSplits(holdoutPct: number): [number, number] {
  const h = Math.min(90, Math.max(1, holdoutPct));
  return [Math.round((100 - h) * 10) / 10, h];
}

/**
 * Ajusta los grupos al tipo de prueba elegido, conservando ids y lo que la
 * persona escribió. Los nombres que puso Arriero se cambian por los del tipo.
 * - A/B: al menos 2 grupos, un control, reparto parejo si falta.
 * - Holdout: exactamente 2 (Expuesto y Holdout = control) con el reparto del holdout.
 * - Geo y antes/después: al menos 2 grupos, un control, sin reparto.
 */
export function armsForTestType(type: PilotTestType, current: ArmDraft[], holdoutPct: number | null = null): ArmDraft[] {
  const names = ARM_TEMPLATE_NAMES[type];
  const control = current.find((a) => a.is_control) ?? null;
  let variants = current.filter((a) => a !== control);
  if (type === "holdout") variants = variants.slice(0, 1);
  while (variants.length < 1) variants.push({ name: "", is_control: false, split_pct: null, cities: [] });
  const ctrl: ArmDraft = control ?? { name: "", is_control: true, split_pct: null, cities: [] };

  const rename = (a: ArmDraft, fallback: string) => (isTemplateName(a.name) ? fallback : a.name);
  const out: ArmDraft[] = [
    { ...ctrl, is_control: true, name: rename(ctrl, names.control) },
    ...variants.map((v, i) => ({ ...v, is_control: false, name: rename(v, names.variant(i)) })),
  ];

  if (type === "holdout") {
    const [exposed, holdout] = holdoutSplits(holdoutPct ?? DEFAULT_HOLDOUT_PCT);
    return [
      { ...out[1], split_pct: exposed },
      { ...out[0], split_pct: holdout },
    ];
  }
  if (type === "geo" || type === "pre_post") return out.map((a) => ({ ...a, split_pct: null }));
  const hasSplits = out.every((a) => a.split_pct != null) && Math.abs(out.reduce((s, a) => s + (a.split_pct ?? 0), 0) - 100) <= 0.5;
  if (hasSplits) return out;
  const even = splitEvenly(out.length);
  return out.map((a, i) => ({ ...a, split_pct: even[i] }));
}

/** Nombre para un grupo nuevo que no repita los existentes. */
export function nextArmName(type: PilotTestType, current: Pick<ArmDraft, "name">[]): string {
  const taken = new Set(current.map((a) => a.name.trim().toLocaleLowerCase("es-CO")));
  for (let i = 0; i < 26; i++) {
    const name = ARM_TEMPLATE_NAMES[type].variant(i);
    if (!taken.has(name.toLocaleLowerCase("es-CO"))) return name;
  }
  return `Grupo ${current.length + 1}`;
}

export function splitTotal(arms: Pick<ArmDraft, "split_pct">[]): number {
  return Math.round(arms.reduce((s, a) => s + (a.split_pct ?? 0), 0) * 10) / 10;
}

// -----------------------------------------------------------------------------
// Resumen para los cruces (a partir del formulario)
// -----------------------------------------------------------------------------

export interface DesignSnapshot {
  id: string;
  title: string;
  status: PilotStatus;
  test_type: PilotTestType | null;
  planned_start: IsoDate | null;
  planned_end: IsoDate | null;
  media: { media_id: string; account?: string | null; campaign?: string | null; audience?: string | null; destination?: string | null; cities?: string[] }[];
  arms: { cities?: string[] }[];
}

export function summaryFromDesign(d: DesignSnapshot, mediaNames: Record<string, string>): PilotSummary {
  const blank = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);
  return {
    id: d.id,
    title: d.title,
    status: d.status,
    test_type: d.test_type,
    start: d.planned_start,
    end: d.planned_end,
    media: d.media
      .filter((m) => !!m.media_id)
      .map((m) => ({
        media_id: m.media_id,
        media_name: mediaNames[m.media_id] ?? "Medio",
        account: blank(m.account),
        campaign: blank(m.campaign),
        audience: blank(m.audience),
        destination: blank(m.destination),
        cities: m.cities ?? [],
      })),
    arm_cities: d.arms.flatMap((a) => a.cities ?? []),
  };
}

// -----------------------------------------------------------------------------
// Potencia: valores por defecto
// -----------------------------------------------------------------------------

/** Días de un rango, contando el primero y el último; null si falta una fecha. */
export function plannedDays(start: IsoDate | null, end: IsoDate | null): number | null {
  if (!start || !end || end < start) return null;
  return daysBetween(start, end) + 1;
}

/**
 * Entradas de la calculadora cuando todavía no hay nada guardado: días de las
 * fechas, inversión diaria = presupuesto / días y MDE objetivo = lo esperado en la hipótesis.
 */
export function defaultPowerInputs(input: {
  calc: PilotMetricCalc | null;
  saved: PowerInputs | null;
  plannedStart: IsoDate | null;
  plannedEnd: IsoDate | null;
  budgetCop: number | null;
  expectedPct: number | null;
}): PowerInputs {
  const days = plannedDays(input.plannedStart, input.plannedEnd);
  const base: PowerInputs = {
    baseline: Number.NaN,
    daily_cv: input.calc === "rate" ? null : 0.3,
    daily_volume_per_arm: null,
    planned_days: days ?? 28,
    target_mde_pct: input.expectedPct == null ? null : Math.abs(input.expectedPct) || null,
    daily_spend_cop: input.budgetCop && days ? Math.round(input.budgetCop / days) : null,
    alpha: 0.05,
    power: 0.8,
  };
  if (!input.saved) return base;
  return { ...base, ...input.saved };
}

// -----------------------------------------------------------------------------
// Reglas de decisión en palabras
// -----------------------------------------------------------------------------

export function rulesSentence(r: DecisionRules): string {
  const scale = `Escalar si la probabilidad de ganar es ≥ ${pctText(r.scale_min_probability * 100)}, la mejora es ≥ ${pctText(r.scale_min_lift_pct)}${
    r.guardrails_block_scale ? " y ningún guardrail se rompe" : " (aunque un guardrail se rompa)"
  }.`;
  const kill = `Apagar si la probabilidad es ≤ ${pctText(r.kill_max_probability * 100)}.`;
  return `${scale} ${kill} En los demás casos, ajustar.`;
}

// -----------------------------------------------------------------------------
// Qué falta para enviar a revisión, desde lo guardado
// -----------------------------------------------------------------------------

export interface ReadinessSource {
  pilot: {
    problem: string | null;
    hypothesis_change: string | null;
    hypothesis_scope: string | null;
    hypothesis_metric: string | null;
    hypothesis_expected_pct: number | null;
    hypothesis_reason: string | null;
    variable_id: string | null;
    test_type: PilotTestType | null;
    design_justification: string | null;
    primary_metric_id: string | null;
    power_result: unknown;
    decision_rules: unknown;
    planned_start: string | null;
    planned_end: string | null;
  };
  guardrails: unknown[];
  media: unknown[];
  arms: { is_control: boolean; cities: string[] }[];
}

export function readinessFrom(
  d: ReadinessSource,
  variables: { id: string; recommended_test_type: PilotTestType; alternative_test_type: PilotTestType | null }[],
): ReadinessInput {
  const v = variables.find((x) => x.id === d.pilot.variable_id) ?? null;
  return {
    problem: d.pilot.problem,
    hypothesis_change: d.pilot.hypothesis_change,
    hypothesis_scope: d.pilot.hypothesis_scope,
    hypothesis_metric: d.pilot.hypothesis_metric,
    hypothesis_expected_pct: d.pilot.hypothesis_expected_pct,
    hypothesis_reason: d.pilot.hypothesis_reason,
    variable: v ? { recommended_test_type: v.recommended_test_type, alternative_test_type: v.alternative_test_type } : null,
    test_type: d.pilot.test_type,
    design_justification: d.pilot.design_justification,
    primary_metric_id: d.pilot.primary_metric_id,
    guardrails: d.guardrails.length,
    has_power: d.pilot.power_result != null,
    has_rules: d.pilot.decision_rules != null,
    planned_start: d.pilot.planned_start,
    planned_end: d.pilot.planned_end,
    media: d.media.length,
    arms: d.arms,
  };
}
