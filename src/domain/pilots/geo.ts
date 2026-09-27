// Lectura de pruebas por geografía (y antes / después con control): diferencia en
// diferencias, prueba placebo y control sintético sobre series por periodo.
//
// Convención de fechas: `postStart` es el primer periodo con el cambio. Un periodo
// es "antes" si `period < postStart` y "después" si `period >= postStart`
// (comparación de cadenas ISO `YYYY-MM-DD`).
//
// Cuando hay varias ciudades de control, el control agregado es el PROMEDIO por
// periodo de las ciudades (una "ciudad típica"). Solo se usan los periodos que
// tienen dato en todas las series que se comparan.
import type { IsoDate } from "../types";
import { mean, sum } from "./numbers";

export interface SeriesPoint {
  period: IsoDate;
  value: number;
}
export type Series = SeriesPoint[];

export interface ControlUnit {
  label: string;
  series: Series;
}

export interface DiffInDiffResult {
  pre_test: number;
  post_test: number;
  pre_control: number;
  post_control: number;
  /** Efecto absoluto por periodo: (post_test − pre_test) − (post_control − pre_control). */
  effect: number;
  /** Efecto / contrafactual, con contrafactual = pre_test + (post_control − pre_control). */
  relative: number | null;
  pre_periods: number;
  post_periods: number;
}

export interface PlaceboEffect {
  label: string;
  effect: number;
  relative: number | null;
}

export interface PlaceboResult {
  effects: PlaceboEffect[];
  /** Proporción de placebos con |relativo| estrictamente menor que el real (0–1). Null sin efecto real. */
  placebo_confidence: number | null;
}

export interface SyntheticControlResult {
  weights: { label: string; weight: number }[];
  pre_rmse: number;
  /** Efecto absoluto promedio por periodo después del inicio. */
  effect: number;
  relative: number | null;
}

export interface GeoAnalysis {
  did: DiffInDiffResult | null;
  placebo: PlaceboResult | null;
  synthetic: SyntheticControlResult | null;
  control_units: number;
  warnings: string[];
}

export const MIN_CONTROL_UNITS = 3;
export const MIN_PRE_PERIODS = 4;
const SYNTHETIC_ITERATIONS = 5000;

function toMap(series: Series): Map<IsoDate, number> {
  const m = new Map<IsoDate, number>();
  for (const p of series) if (Number.isFinite(p.value)) m.set(p.period, (m.get(p.period) ?? 0) + p.value);
  return m;
}

/** Periodos presentes en todas las series, ordenados. */
function commonPeriods(maps: Map<IsoDate, number>[]): IsoDate[] {
  if (maps.length === 0) return [];
  return [...maps[0].keys()].filter((k) => maps.every((m) => m.has(k))).sort();
}

/** Promedio por periodo de varias series (solo periodos comunes). */
export function averageSeries(series: readonly Series[]): Series {
  const maps = series.map(toMap);
  return commonPeriods(maps).map((period) => ({ period, value: sum(maps.map((m) => m.get(period)!)) / maps.length }));
}

/** Diferencia en diferencias aditiva. Null si falta el antes o el después. */
export function diffInDiff(testSeries: Series, controlSeries: Series, postStart: IsoDate): DiffInDiffResult | null {
  const t = toMap(testSeries);
  const c = toMap(controlSeries);
  const periods = commonPeriods([t, c]);
  const pre = periods.filter((p) => p < postStart);
  const post = periods.filter((p) => p >= postStart);
  if (pre.length === 0 || post.length === 0) return null;
  const preTest = mean(pre.map((p) => t.get(p)!))!;
  const postTest = mean(post.map((p) => t.get(p)!))!;
  const preControl = mean(pre.map((p) => c.get(p)!))!;
  const postControl = mean(post.map((p) => c.get(p)!))!;
  const effect = postTest - preTest - (postControl - preControl);
  const counterfactual = preTest + (postControl - preControl);
  return {
    pre_test: preTest,
    post_test: postTest,
    pre_control: preControl,
    post_control: postControl,
    effect,
    relative: counterfactual !== 0 ? effect / counterfactual : null,
    pre_periods: pre.length,
    post_periods: post.length,
  };
}

/**
 * Prueba placebo: cada ciudad de control hace de "prueba" falsa contra el promedio
 * de las demás. Si el efecto real es más grande que casi todos los placebos, es
 * poco probable que sea ruido. Null con menos de 2 ciudades de control.
 */
export function placeboTest(controls: readonly ControlUnit[], postStart: IsoDate, realRelative: number | null): PlaceboResult | null {
  if (controls.length < 2) return null;
  const effects: PlaceboEffect[] = [];
  controls.forEach((unit, i) => {
    const others = averageSeries(controls.filter((_, j) => j !== i).map((u) => u.series));
    const did = diffInDiff(unit.series, others, postStart);
    if (did) effects.push({ label: unit.label, effect: did.effect, relative: did.relative });
  });
  const usable = effects.filter((e) => e.relative != null);
  const placebo_confidence =
    realRelative == null || usable.length === 0
      ? null
      : usable.filter((e) => Math.abs(e.relative!) < Math.abs(realRelative)).length / usable.length;
  return { effects, placebo_confidence };
}

/** Proyección euclidiana sobre el simplex {w ≥ 0, Σw = 1}. */
function projectSimplex(v: number[]): number[] {
  const u = v.slice().sort((a, b) => b - a);
  let css = 0;
  let theta = 0;
  for (let i = 0; i < u.length; i++) {
    css += u[i];
    const t = (css - 1) / (i + 1);
    if (u[i] - t > 0) theta = t;
  }
  return v.map((x) => Math.max(0, x - theta));
}

/**
 * Control sintético: pesos no negativos que suman 1 sobre las ciudades de control y
 * minimizan el error cuadrático antes del inicio (descenso de gradiente proyectado,
 * iteraciones fijas: determinista). Null con menos de 3 ciudades o menos de 4 periodos antes.
 */
export function syntheticControl(test: Series, controls: readonly ControlUnit[], postStart: IsoDate): SyntheticControlResult | null {
  if (controls.length < MIN_CONTROL_UNITS) return null;
  const t = toMap(test);
  const cs = controls.map((c) => toMap(c.series));
  const periods = commonPeriods([t, ...cs]);
  const pre = periods.filter((p) => p < postStart);
  const post = periods.filter((p) => p >= postStart);
  if (pre.length < MIN_PRE_PERIODS || post.length === 0) return null;

  const k = controls.length;
  const X = pre.map((p) => cs.map((m) => m.get(p)!)); // periodos × ciudades
  const y = pre.map((p) => t.get(p)!);
  // Paso 1/L con L = 2·traza(XᵀX) ≥ 2·λmax: garantiza que el descenso no diverja.
  let trace = 0;
  for (const row of X) for (const x of row) trace += x * x;
  if (!(trace > 0)) return null;
  const step = 1 / (2 * trace);

  let w = new Array<number>(k).fill(1 / k);
  for (let it = 0; it < SYNTHETIC_ITERATIONS; it++) {
    const grad = new Array<number>(k).fill(0);
    for (let r = 0; r < X.length; r++) {
      let fit = 0;
      for (let j = 0; j < k; j++) fit += X[r][j] * w[j];
      const resid = fit - y[r];
      for (let j = 0; j < k; j++) grad[j] += 2 * resid * X[r][j];
    }
    w = projectSimplex(w.map((wj, j) => wj - step * grad[j]));
  }

  const synth = (p: IsoDate) => sum(cs.map((m, j) => m.get(p)! * w[j]));
  const preSq = pre.map((p) => (t.get(p)! - synth(p)) ** 2);
  const gaps = post.map((p) => t.get(p)! - synth(p));
  const effect = mean(gaps)!;
  const counterfactual = mean(post.map(synth))!;
  return {
    weights: controls.map((c, j) => ({ label: c.label, weight: w[j] })),
    pre_rmse: Math.sqrt(mean(preSq)!),
    effect,
    relative: counterfactual !== 0 ? effect / counterfactual : null,
  };
}

/** Lectura completa: DiD contra el control promedio, placebo y control sintético, con advertencias. */
export function analyzeGeo(input: { test: Series; controls: readonly ControlUnit[]; postStart: IsoDate }): GeoAnalysis {
  const { test, controls, postStart } = input;
  const warnings: string[] = [];
  const control = controls.length === 1 ? controls[0].series : averageSeries(controls.map((c) => c.series));
  const did = controls.length ? diffInDiff(test, control, postStart) : null;
  const placebo = placeboTest(controls, postStart, did?.relative ?? null);
  const synthetic = syntheticControl(test, controls, postStart);

  if (controls.length === 0) warnings.push("No hay datos del grupo de control.");
  else if (controls.length < MIN_CONTROL_UNITS) warnings.push("Con menos de 3 ciudades de control la lectura es débil.");
  if (did) {
    if (did.pre_periods < MIN_PRE_PERIODS)
      warnings.push("Hay menos de 4 periodos antes del inicio: la comparación de tendencias es débil.");
  } else if (controls.length) {
    warnings.push("Faltan periodos antes o después del inicio para comparar.");
  }
  return { did, placebo, synthetic, control_units: controls.length, warnings };
}
