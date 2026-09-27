// Borrador de problema a partir de una métrica: título sugerido y evidencia
// con las últimas semanas, la línea base y la meta del horizonte. Funciones puras.
import { daysBetween } from "./dates";
import { formatMetricValue, formatNumber, formatPercent } from "./format";
import type { IsoDate, MetricDirection } from "./types";

/** Semanas que se citan en la evidencia (las más recientes). */
export const EVIDENCE_MAX_WEEKS = 8;

export interface EvidenceHorizon {
  name: string;
  start_date: IsoDate;
  end_date: IsoDate;
  target: number;
}

export interface MetricEvidenceInput {
  name: string;
  unit: string | null;
  direction: MetricDirection;
  baseline: number | null;
  /** Valores semanales en cualquier orden. */
  values: { week_start: IsoDate; value: number }[];
  horizon: EvidenceHorizon | null;
}

export interface ProblemDraft {
  title: string;
  evidence: string;
  /** Brecha relativa contra lo esperado (+ = peor que lo esperado), o null si no hay con qué comparar. */
  gap: number | null;
}

/**
 * Horizonte vigente: el que contiene `today`; si ninguno, el próximo; si ya
 * pasaron todos, el último.
 */
export function pickHorizon<T extends { start_date: IsoDate; end_date: IsoDate }>(horizons: T[], today: IsoDate): T | null {
  const sorted = [...horizons].sort((a, b) => a.start_date.localeCompare(b.start_date));
  return (
    sorted.find((h) => h.start_date <= today && today <= h.end_date) ??
    sorted.find((h) => h.start_date > today) ??
    sorted.at(-1) ??
    null
  );
}

/**
 * Valor esperado en `date` si la métrica avanzara en línea recta desde la
 * línea base (inicio del horizonte) hasta la meta (fin del horizonte). Sin
 * meta, lo esperado es mantener la línea base.
 */
export function expectedValue(baseline: number | null, horizon: EvidenceHorizon | null, date: IsoDate): number | null {
  if (!horizon) return baseline;
  if (baseline == null) return horizon.target;
  const total = daysBetween(horizon.start_date, horizon.end_date);
  if (total <= 0) return horizon.target;
  const elapsed = Math.min(total, Math.max(0, daysBetween(horizon.start_date, date)));
  return baseline + ((horizon.target - baseline) * elapsed) / total;
}

/**
 * Brecha relativa del valor real contra lo esperado, con el signo del lado
 * malo: positiva = peor (por debajo si la métrica debe subir, por encima si
 * debe bajar). `null` si lo esperado es 0 o no existe.
 */
export function relativeGap(actual: number, expected: number | null, direction: MetricDirection): number | null {
  if (expected == null || expected === 0) return null;
  const diff = (actual - expected) / Math.abs(expected);
  return direction === "up" ? -diff : diff;
}

function listValues(values: number[], unit: string | null): string {
  const allIntegers = values.every((v) => Number.isInteger(v));
  // Con decimales la coma ya es el separador decimal (es-CO): se separa con «;».
  const joined = values.map((v) => formatNumber(v)).join(allIntegers ? ", " : "; ");
  if (!unit) return joined;
  if (unit === "%" || unit === "COP") return `${joined} (${unit})`;
  return `${joined} ${unit}`;
}

/** Título y evidencia sugeridos para un problema nacido de la métrica. */
export function draftProblemFromMetric(input: MetricEvidenceInput): ProblemDraft {
  const recent = [...input.values].sort((a, b) => a.week_start.localeCompare(b.week_start)).slice(-EVIDENCE_MAX_WEEKS);
  const parts: string[] = [];
  const fmt = (v: number | null) => formatMetricValue(v, input.unit);

  if (!recent.length) {
    parts.push("Todavía no hay valores semanales cargados para esta métrica: complete la evidencia con los datos que tenga.");
  } else {
    const n = recent.length;
    parts.push(`${n === 1 ? "Última semana" : `Últimas ${n} semanas`}: ${listValues(recent.map((r) => r.value), input.unit)}.`);
    if (n > 1 && recent[0].value !== 0) {
      const change = (recent[n - 1].value - recent[0].value) / Math.abs(recent[0].value);
      if (change !== 0) parts.push(`Cambio en el periodo: ${change > 0 ? "+" : "−"}${formatPercent(Math.abs(change))}.`);
    }
  }
  if (input.baseline != null) parts.push(`Línea base: ${fmt(input.baseline)}.`);
  if (input.horizon) parts.push(`Meta ${input.horizon.name}: ${fmt(input.horizon.target)}.`);

  const last = recent.at(-1);
  const expected = last ? expectedValue(input.baseline, input.horizon, last.week_start) : null;
  const gap = last ? relativeGap(last.value, expected, input.direction) : null;
  const side = input.direction === "up" ? "por debajo" : "por encima";

  let title: string;
  if (gap != null && gap > 0.0005) {
    const reference = input.horizon ? "del camino esperado" : "de la línea base";
    parts.push(`Va ${formatPercent(gap)} ${side} ${reference} (a esta semana se esperaba ${fmt(expected)}).`);
    title = `${input.name} va ${formatPercent(gap)} ${side} de lo esperado`;
  } else if (gap != null) {
    parts.push(`Por ahora va en línea o mejor de lo esperado (a esta semana se esperaba ${fmt(expected)}).`);
    title = `${input.name}: revisar dónde se está perdiendo valor`;
  } else {
    title = `${input.name}: revisar dónde se está perdiendo valor`;
  }

  return { title, evidence: parts.join(" "), gap };
}
