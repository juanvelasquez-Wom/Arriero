// Lectura de un piloto para las pantallas: convierte las filas de la base en la
// entrada del motor (analysis.ts), arma la serie del gráfico, suma la inversión
// ejecutada y escribe el resultado en palabras simples para gerencia.
// Funciones puras con tipos estructurales (no importan nada del servidor).
import { todayIso } from "../dates";
import { formatNumber, formatPercent } from "../format";
import type { IsoDate } from "../types";
import { formatCop } from "../value";
import type { PilotAnalysis, PilotAnalysisInput } from "./analysis";
import { pctText } from "./numbers";
import {
  DEFAULT_DECISION_RULES,
  type DecisionRules,
  type Granularity,
  type Measurement,
  type PilotArm,
  type PilotGuardrail,
  type PilotMetricDef,
  type PilotTestType,
} from "./types";

export interface ReadingPilot {
  test_type: PilotTestType | null;
  primary_metric_id: string | null;
  design_config: { granularity?: Granularity | null } | null;
  power_inputs: { planned_days?: number | null; daily_volume_per_arm?: number | null } | null;
  decision_rules: DecisionRules | null;
  planned_start: IsoDate | null;
  planned_end: IsoDate | null;
  actual_start: IsoDate | null;
  actual_end: IsoDate | null;
}

export interface ReadingMeasurement extends Measurement {
  granularity: Granularity;
}

export interface ReadingSource {
  pilot: ReadingPilot;
  arms: PilotArm[];
  guardrails: PilotGuardrail[];
  measurements: ReadingMeasurement[];
}

/** Granularidad del piloto (por defecto, día). */
export function pilotGranularity(pilot: Pick<ReadingPilot, "design_config">): Granularity {
  return pilot.design_config?.granularity === "week" ? "week" : "day";
}

/** ¿El tipo de prueba necesita un periodo previo ("antes")? */
export function needsPrePeriod(testType: PilotTestType | null): boolean {
  return testType === "geo" || testType === "pre_post";
}

/** Métricas del catálogo que necesita el motor: principal, guardrails, sus bases y la inversión. */
export function metricsForReading(ids: string[], catalog: PilotMetricDef[]): PilotMetricDef[] {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const out = new Map<string, PilotMetricDef>();
  const add = (id: string | null) => {
    const m = id ? byId.get(id) : undefined;
    if (!m || out.has(m.id)) return;
    out.set(m.id, m);
    if (m.calc !== "sum") {
      add(m.numerator_id);
      add(m.denominator_id);
    }
  };
  ids.forEach(add);
  for (const m of catalog) if (m.is_spend && m.calc === "sum") out.set(m.id, m);
  return [...out.values()];
}

/** Filas de la base → entrada del motor. Null si falta el tipo, la métrica principal o los grupos. */
export function buildAnalysisInput(src: ReadingSource, catalog: PilotMetricDef[], today: IsoDate = todayIso()): PilotAnalysisInput | null {
  const { pilot } = src;
  if (!pilot.test_type || !pilot.primary_metric_id || src.arms.length === 0) return null;
  if (!catalog.some((m) => m.id === pilot.primary_metric_id)) return null;
  const granularity = pilotGranularity(pilot);
  const plannedDays = pilot.power_inputs?.planned_days ?? null;
  const dailyVolume = pilot.power_inputs?.daily_volume_per_arm ?? null;
  return {
    testType: pilot.test_type,
    metrics: metricsForReading([pilot.primary_metric_id, ...src.guardrails.map((g) => g.metric_id)], catalog),
    primaryMetricId: pilot.primary_metric_id,
    guardrails: src.guardrails.map((g) => ({ id: g.id, metric_id: g.metric_id, limit_pct: g.limit_pct })),
    arms: src.arms.map((a) => ({ id: a.id, name: a.name, is_control: a.is_control, split_pct: a.split_pct, cities: a.cities ?? [] })),
    measurements: src.measurements
      .filter((m) => m.granularity === granularity)
      .map((m) => ({ arm_id: m.arm_id, metric_id: m.metric_id, unit_label: m.unit_label, period_start: m.period_start, value: m.value })),
    postStart: pilot.actual_start ?? pilot.planned_start,
    postEnd: pilot.actual_end ?? pilot.planned_end ?? today,
    plannedDays: plannedDays != null && plannedDays > 0 ? plannedDays : null,
    plannedVolumePerArm: dailyVolume != null && plannedDays != null && dailyVolume > 0 && plannedDays > 0 ? dailyVolume * plannedDays : null,
    rules: pilot.decision_rules ?? DEFAULT_DECISION_RULES,
  };
}

// -----------------------------------------------------------------------------
// Serie del gráfico
// -----------------------------------------------------------------------------

export interface ChartPoint {
  period: IsoDate;
  /** armId → valor de la métrica principal en ese periodo. */
  values: Record<string, number | null>;
}

/** Valor de la métrica (suma, tasa o costo por) en un conjunto de valores; null sin datos. */
export function metricValue(metric: PilotMetricDef, values: readonly Measurement[]): number | null {
  const total = (id: string | null) => {
    let s = 0;
    let n = 0;
    for (const v of values) {
      if (v.metric_id === id && Number.isFinite(v.value)) {
        s += v.value;
        n++;
      }
    }
    return n ? s : null;
  };
  if (metric.calc === "sum") return total(metric.id);
  const num = total(metric.numerator_id);
  const den = total(metric.denominator_id);
  return num == null || den == null || den <= 0 ? null : num / den;
}

/** Métrica principal por grupo y periodo (todos los periodos cargados hasta el fin), ordenada. */
export function primarySeries(input: PilotAnalysisInput): ChartPoint[] {
  const metric = input.metrics.find((m) => m.id === input.primaryMetricId);
  if (!metric) return [];
  const ids = metric.calc === "sum" ? [metric.id] : [metric.numerator_id, metric.denominator_id];
  const relevant = input.measurements.filter((m) => ids.includes(m.metric_id) && (input.postEnd == null || m.period_start <= input.postEnd));
  const periods = [...new Set(relevant.map((m) => m.period_start))].sort();
  return periods.map((period) => {
    const inPeriod = relevant.filter((m) => m.period_start === period);
    return {
      period,
      values: Object.fromEntries(input.arms.map((a) => [a.id, metricValue(metric, inPeriod.filter((m) => m.arm_id === a.id))])),
    };
  });
}

// -----------------------------------------------------------------------------
// Inversión ejecutada
// -----------------------------------------------------------------------------

/** Suma de la métrica de inversión desde el inicio real (igual que el portafolio). */
export function executedSpend(
  measurements: readonly ReadingMeasurement[],
  catalog: readonly PilotMetricDef[],
  actualStart: IsoDate | null,
  granularity?: Granularity,
): number | null {
  const spendIds = new Set(catalog.filter((m) => m.is_spend && m.calc === "sum").map((m) => m.id));
  if (!spendIds.size) return null;
  let total = 0;
  let found = false;
  for (const m of measurements) {
    if (!spendIds.has(m.metric_id)) continue;
    if (granularity && m.granularity !== granularity) continue;
    if (actualStart && m.period_start < actualStart) continue;
    total += m.value;
    found = true;
  }
  return found ? total : null;
}

// -----------------------------------------------------------------------------
// Resultado en palabras
// -----------------------------------------------------------------------------

function probabilityWords(p: number): string {
  if (p >= 0.995) return "más de 99 %";
  if (p < 0.005) return "menos de 1 %";
  return `${Math.round(p * 100)} %`;
}

/**
 * El resultado de la métrica principal en una o dos frases para gerencia.
 * Ej.: "Con la variante Video UGC, Ventas quedó 18 % por encima del control. Hay 96 % de probabilidad de que sea mejor."
 */
export function resultSentence(input: {
  analysis: PilotAnalysis | null;
  testType: PilotTestType | null;
  metric: Pick<PilotMetricDef, "name" | "direction"> | null;
  arms: Pick<PilotArm, "id" | "name">[];
}): string {
  const { analysis, testType, metric, arms } = input;
  if (!analysis || !metric || !analysis.ready || !analysis.primary) return "Todavía no hay datos suficientes para leer el resultado.";
  const primary = analysis.primary;
  const comparison = primary.comparisons.find((c) => c.armId === primary.bestArmId) ?? primary.comparisons[0];
  if (!comparison || comparison.liftPct == null) return "Todavía no hay datos suficientes para comparar contra el control.";

  const armName = arms.find((a) => a.id === comparison.armId)?.name ?? "la variante";
  const who =
    testType === "holdout"
      ? { subject: "Con la campaña", same: "el grupo sin anuncios (holdout)", of: "del grupo sin anuncios (holdout)" }
      : testType === "geo"
        ? { subject: "En las ciudades de prueba", same: "las de control", of: "de las de control" }
        : testType === "pre_post"
          ? { subject: "Después del cambio", same: "el control", of: "del control" }
          : { subject: `Con la variante ${armName}`, same: "el control", of: "del control" };

  const lift = comparison.liftPct;
  const size = pctText(Math.abs(lift));
  const movement = lift === 0 ? `quedó igual que ${who.same}` : `quedó ${size} ${lift > 0 ? "por encima" : "por debajo"} ${who.of}`;
  const good = lift !== 0 && (metric.direction === "down" ? lift < 0 : lift > 0);
  const note = lift === 0 ? "" : metric.direction === "down" ? (good ? " (aquí menos es mejor)" : " (aquí menos es mejor, así que empeoró)") : "";
  const parts = [`${who.subject}, ${metric.name} ${movement}${note}.`];

  const p = comparison.probabilityBetter;
  if (p != null) parts.push(`Hay ${probabilityWords(p)} de probabilidad de que sea mejor.`);
  else parts.push("No hay una probabilidad calculada: tómelo como evidencia direccional.");
  if (comparison.lowPct != null && comparison.highPct != null) {
    const signed = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${pctText(Math.abs(x))}`;
    parts.push(`El rango probable (90 %) va de ${signed(comparison.lowPct)} a ${signed(comparison.highPct)}.`);
  }
  return parts.join(" ");
}

/** Reglas de decisión en palabras simples. */
export function rulesInWords(rules: DecisionRules): string[] {
  const out = [
    `Escalar si la probabilidad de ganar es de al menos ${pctText(rules.scale_min_probability * 100)} y la mejora es de al menos ${pctText(rules.scale_min_lift_pct)}.`,
    `Apagar si la probabilidad de ganar es de ${pctText(rules.kill_max_probability * 100)} o menos.`,
    "En otro caso, ajustar y volver a probar.",
  ];
  out.push(rules.guardrails_block_scale ? "Si un guardrail se rompe, no se escala." : "Un guardrail roto no impide escalar, pero se revisa.");
  return out;
}

// -----------------------------------------------------------------------------
// Presentación
// -----------------------------------------------------------------------------

/** Valor de una métrica según su tipo: tasa en %, pesos en COP, cantidades con separador de miles. */
export function formatPilotValue(metric: Pick<PilotMetricDef, "calc" | "unit"> | null | undefined, value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (metric?.calc === "rate") return formatPercent(value);
  if (metric?.unit === "cop" || metric?.calc === "cost_per") return formatCop(value);
  if (metric?.unit === "percent") return `${formatNumber(value)} %`;
  return formatNumber(value);
}

/** Probabilidad que cuenta como ganador confiable (misma banda "Confiable" de Arriero). */
export const PILOT_WINNER_PROBABILITY = 0.95;

/**
 * Grupo ganador para resaltarlo en amarillo: el mejor, si su probabilidad de ganar es
 * confiable (≥ 95 %) o si la decisión firmada lo declaró ganador. Null si no hay.
 */
export function winnerArmId(analysis: PilotAnalysis | null, signedVerdict: string | null = null): string | null {
  const primary = analysis?.primary;
  if (!analysis?.ready || !primary?.bestArmId) return null;
  if (signedVerdict === "winner") return primary.bestArmId;
  const best = primary.comparisons.find((c) => c.armId === primary.bestArmId);
  return best?.probabilityBetter != null && best.probabilityBetter >= PILOT_WINNER_PROBABILITY ? primary.bestArmId : null;
}
