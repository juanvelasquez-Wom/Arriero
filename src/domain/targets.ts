// Semáforo "Frente a la meta": compara el último valor cargado con el camino
// esperado (línea recta) entre el punto de partida y la meta del horizonte en
// curso. Funciones puras, sin React ni Supabase.
import { addDays, daysBetween } from "./dates";
import type { IsoDate, MetricDirection } from "./types";

export type TargetStatus = "on_track" | "behind" | "off_track" | "no_data";

/** Por qué no hay semáforo. */
export type NoDataReason = "no_horizon" | "no_target" | "no_start" | "no_values";

export interface TargetHorizon {
  id: string;
  name: string;
  start_date: IsoDate;
  end_date: IsoDate;
}

export interface TargetInput {
  baseline: number | null;
  direction: MetricDirection;
  targets: { horizon_id: string; target: number }[];
  horizons: TargetHorizon[];
  values: { week_start: IsoDate; value: number }[];
  today: IsoDate;
  /** Inicio del programa: desde ahí parte la línea base. Si falta, el inicio del primer horizonte. */
  programStart?: IsoDate | null;
}

export interface TargetEvaluation {
  status: TargetStatus;
  reason: NoDataReason | null;
  horizonId: string | null;
  horizonName: string | null;
  target: number | null;
  /** Valor esperado en la fecha del último dato, sobre la línea recta. */
  expected: number | null;
  latest: number | null;
  latestWeek: IsoDate | null;
  /**
   * Diferencia relativa frente a lo esperado, con signo "a favor": positivo =
   * adelante, negativo = atrás (ya corregido por la dirección de la métrica).
   */
  gap: number | null;
}

/**
 * Umbrales del semáforo sobre `gap` (diferencia relativa a favor):
 * - on_track: gap ≥ −5 % (en la meta, adelante o apenas por debajo)
 * - behind:   −15 % ≤ gap < −5 %
 * - off_track: gap < −15 %
 */
export const TARGET_THRESHOLDS = { onTrack: -0.05, behind: -0.15 } as const;

export const TARGET_STATUS_LABEL: Record<TargetStatus, string> = {
  on_track: "Vamos bien",
  behind: "Un poco atrás",
  off_track: "Muy atrás",
  no_data: "Sin datos",
};

export const NO_DATA_REASON_LABEL: Record<NoDataReason, string> = {
  no_horizon: "El programa no tiene horizontes.",
  no_target: "Falta la meta del horizonte en curso.",
  no_start: "Falta la línea base para trazar el camino.",
  no_values: "Todavía no hay valores cargados.",
};

/**
 * Horizonte en curso: el que contiene `today`. Antes del primero, el primero;
 * después del último, el último (se sigue midiendo contra la última meta).
 */
export function currentHorizon<H extends TargetHorizon>(horizons: H[], today: IsoDate): H | null {
  if (!horizons.length) return null;
  const sorted = [...horizons].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const within = sorted.find((h) => h.start_date <= today && today <= h.end_date);
  if (within) return within;
  if (today < sorted[0].start_date) return sorted[0];
  const past = sorted.filter((h) => h.end_date < today);
  return past.at(-1) ?? sorted[0];
}

/** Valor en `date` sobre la recta (startDate, startValue) → (endDate, endValue), acotado a los extremos. */
export function linearExpected(
  startDate: IsoDate,
  startValue: number,
  endDate: IsoDate,
  endValue: number,
  date: IsoDate,
): number {
  const span = daysBetween(startDate, endDate);
  if (span <= 0) return endValue;
  const t = Math.min(1, Math.max(0, daysBetween(startDate, date) / span));
  return startValue + (endValue - startValue) * t;
}

/** Diferencia relativa a favor (positivo = adelante). */
export function favorableGap(latest: number, expected: number, direction: MetricDirection, fallbackScale: number): number {
  const diff = direction === "up" ? latest - expected : expected - latest;
  const scale = Math.abs(expected) || Math.abs(fallbackScale);
  if (!scale) return diff === 0 ? 0 : diff > 0 ? 1 : -1;
  return diff / scale;
}

export function statusFromGap(gap: number): Exclude<TargetStatus, "no_data"> {
  if (gap >= TARGET_THRESHOLDS.onTrack) return "on_track";
  if (gap >= TARGET_THRESHOLDS.behind) return "behind";
  return "off_track";
}

/**
 * Evalúa una métrica frente a su meta.
 *
 * Camino esperado: línea recta desde el punto de partida hasta la meta del
 * horizonte en curso al cierre del horizonte. El punto de partida es la meta
 * del horizonte anterior (al cierre de ese horizonte) si existe; si no, la
 * línea base al inicio del programa (o del horizonte). Se compara el último
 * valor cargado con lo esperado al final de su semana (sin pasar de hoy).
 */
export function evaluateTarget(input: TargetInput): TargetEvaluation {
  const empty = (reason: NoDataReason, h: TargetHorizon | null = null, target: number | null = null): TargetEvaluation => ({
    status: "no_data",
    reason,
    horizonId: h?.id ?? null,
    horizonName: h?.name ?? null,
    target,
    expected: null,
    latest: null,
    latestWeek: null,
    gap: null,
  });

  const sorted = [...input.horizons].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const horizon = currentHorizon(sorted, input.today);
  if (!horizon) return empty("no_horizon");
  const targetBy = new Map(input.targets.map((t) => [t.horizon_id, t.target]));
  const target = targetBy.get(horizon.id);
  if (target == null) return empty("no_target", horizon);

  const idx = sorted.findIndex((h) => h.id === horizon.id);
  const prev = idx > 0 ? sorted[idx - 1] : null;
  const prevTarget = prev ? targetBy.get(prev.id) : undefined;
  let startDate: IsoDate;
  let startValue: number;
  if (prev && prevTarget != null) {
    startDate = prev.end_date;
    startValue = prevTarget;
  } else if (input.baseline != null) {
    const first = sorted[0].start_date;
    startDate = input.programStart && input.programStart < first ? input.programStart : first;
    if (startDate > horizon.start_date) startDate = horizon.start_date;
    startValue = input.baseline;
  } else {
    return empty("no_start", horizon, target);
  }

  const last = [...input.values].sort((a, b) => a.week_start.localeCompare(b.week_start)).at(-1);
  if (!last) return empty("no_values", horizon, target);

  const weekEnd = addDays(last.week_start, 6);
  const asOf = weekEnd < input.today ? weekEnd : input.today;
  const expected = linearExpected(startDate, startValue, horizon.end_date, target, asOf);
  const gap = favorableGap(last.value, expected, input.direction, target - startValue);
  return {
    status: statusFromGap(gap),
    reason: null,
    horizonId: horizon.id,
    horizonName: horizon.name,
    target,
    expected,
    latest: last.value,
    latestWeek: last.week_start,
    gap,
  };
}
