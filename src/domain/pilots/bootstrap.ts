// Bootstrap por periodos para métricas que no son tasas: costo por resultado
// (inversión / resultados) o un promedio por periodo (den = 1).
//
// En cada iteración se remuestrean con reemplazo los periodos de cada grupo por
// separado y se calcula el estadístico suma(num) / suma(den). Con las iteraciones
// salen la mejora relativa (v − c) / c, su intervalo al 90 % (percentiles 5 y 95)
// y la probabilidad de que la variante sea mejor (según `direction`).
import type { MetricDirection } from "../types";
import { DEFAULT_SEED, mulberry32, quantileSorted, type Rng } from "./random";

export interface RatioPeriod {
  num: number;
  den: number;
}

export interface BootstrapOptions {
  iterations?: number;
  seed?: number;
}

export interface BootstrapResult {
  /** Estadístico observado del control. */
  control: number;
  /** Estadístico observado de la variante. */
  variant: number;
  /** Mejora relativa observada (fracción). */
  lift: number;
  lift_low: number;
  lift_high: number;
  probability_better: number;
}

export const DEFAULT_ITERATIONS = 4000;
/** Periodos mínimos por grupo para remuestrear. */
export const MIN_BOOTSTRAP_PERIODS = 2;

function ratio(periods: readonly RatioPeriod[]): number {
  let n = 0;
  let d = 0;
  for (const p of periods) {
    n += p.num;
    d += p.den;
  }
  return d === 0 ? Number.NaN : n / d;
}

function resampleRatio(rng: Rng, periods: readonly RatioPeriod[]): number {
  let n = 0;
  let d = 0;
  for (let i = 0; i < periods.length; i++) {
    const p = periods[Math.floor(rng() * periods.length)];
    n += p.num;
    d += p.den;
  }
  return d === 0 ? Number.NaN : n / d;
}

function validPeriods(periods: readonly RatioPeriod[]): boolean {
  return (
    periods.length >= MIN_BOOTSTRAP_PERIODS &&
    periods.every((p) => Number.isFinite(p.num) && Number.isFinite(p.den) && p.den >= 0) &&
    ratio(periods) !== 0 &&
    Number.isFinite(ratio(periods))
  );
}

/**
 * Compara suma(num)/suma(den) de la variante contra el control. Null si algún grupo
 * tiene menos de 2 periodos, el denominador total es cero o el control da cero.
 * Las iteraciones con denominador cero se descartan.
 */
export function bootstrapRatio(
  controlPeriods: readonly RatioPeriod[],
  variantPeriods: readonly RatioPeriod[],
  direction: MetricDirection = "up",
  options: BootstrapOptions = {},
): BootstrapResult | null {
  if (!validPeriods(controlPeriods) || variantPeriods.length < MIN_BOOTSTRAP_PERIODS) return null;
  const control = ratio(controlPeriods);
  const variant = ratio(variantPeriods);
  if (!Number.isFinite(variant)) return null;
  const iterations = Math.max(1, Math.floor(options.iterations ?? DEFAULT_ITERATIONS));
  const rng = mulberry32(options.seed ?? DEFAULT_SEED);
  const lifts: number[] = [];
  let wins = 0;
  for (let i = 0; i < iterations; i++) {
    const c = resampleRatio(rng, controlPeriods);
    const v = resampleRatio(rng, variantPeriods);
    if (!Number.isFinite(c) || !Number.isFinite(v) || c === 0) continue;
    lifts.push((v - c) / c);
    if (direction === "down" ? v < c : v > c) wins++;
  }
  if (lifts.length === 0) return null;
  lifts.sort((a, b) => a - b);
  return {
    control,
    variant,
    lift: (variant - control) / control,
    lift_low: quantileSorted(lifts, 0.05),
    lift_high: quantileSorted(lifts, 0.95),
    probability_better: wins / lifts.length,
  };
}
