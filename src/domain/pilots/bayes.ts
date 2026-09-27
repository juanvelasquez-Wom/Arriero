// Comparación bayesiana de tasas por Monte Carlo (beta-binomial).
//
// Cada grupo tiene una posterior Beta(1 + éxitos, 1 + intentos − éxitos) (a priori
// uniforme). Se sacan `draws` muestras conjuntas de todas las posteriores con una
// semilla fija, así el resultado es reproducible. De esas muestras salen:
// - la probabilidad de que cada variante sea mejor que el control,
// - la mejora relativa esperada (v − c) / c y su intervalo creíble al 90 %,
// - la probabilidad de que cada grupo (control incluido) sea el mejor.
// Con `direction = "down"` (menos es mejor) "mejor" significa "más bajo"; la
// mejora se sigue calculando como (v − c) / c.
import type { MetricDirection } from "../types";
import { beta, DEFAULT_SEED, mulberry32, quantileSorted } from "./random";

export interface RateArmInput {
  id: string;
  successes: number;
  trials: number;
}

export interface MonteCarloOptions {
  draws?: number;
  seed?: number;
}

export interface RateComparison {
  arm_id: string;
  /** Tasa observada (éxitos / intentos). */
  rate: number;
  /** Mejora relativa esperada vs. control (fracción: 0,1 = +10 %). */
  lift: number;
  /** Percentil 5 de la mejora relativa. */
  lift_low: number;
  /** Percentil 95 de la mejora relativa. */
  lift_high: number;
  /** Probabilidad (0–1) de ser mejor que el control. */
  probability_better: number;
}

export interface RatesResult {
  control_id: string;
  control_rate: number;
  /** Una por cada grupo que no es el control, en el orden de entrada. */
  comparisons: RateComparison[];
  /** Probabilidad de ser el mejor de todos, control incluido. Suma 1. */
  probability_best: Record<string, number>;
}

export const DEFAULT_DRAWS = 20000;

function validArm(a: RateArmInput): boolean {
  return (
    Number.isFinite(a.successes) && Number.isFinite(a.trials) && a.trials > 0 && a.successes >= 0 && a.successes <= a.trials
  );
}

/** Compara las tasas de varios grupos contra el control. Null si algún dato no sirve. */
export function compareRates(
  arms: readonly RateArmInput[],
  controlId: string,
  direction: MetricDirection = "up",
  options: MonteCarloOptions = {},
): RatesResult | null {
  const draws = Math.max(1, Math.floor(options.draws ?? DEFAULT_DRAWS));
  const controlIndex = arms.findIndex((a) => a.id === controlId);
  if (controlIndex < 0 || arms.length < 2 || !arms.every(validArm)) return null;
  const rng = mulberry32(options.seed ?? DEFAULT_SEED);
  const k = arms.length;
  const better = direction === "down" ? (x: number, y: number) => x < y : (x: number, y: number) => x > y;

  const lifts: number[][] = arms.map(() => []);
  const wins = new Array<number>(k).fill(0);
  const bests = new Array<number>(k).fill(0);
  const sample = new Array<number>(k);

  for (let d = 0; d < draws; d++) {
    for (let i = 0; i < k; i++) sample[i] = beta(rng, 1 + arms[i].successes, 1 + arms[i].trials - arms[i].successes);
    const c = sample[controlIndex];
    let best = 0;
    for (let i = 0; i < k; i++) {
      if (better(sample[i], sample[best])) best = i;
      if (i === controlIndex) continue;
      lifts[i].push((sample[i] - c) / c);
      if (better(sample[i], c)) wins[i]++;
    }
    bests[best]++;
  }

  const comparisons: RateComparison[] = [];
  arms.forEach((arm, i) => {
    if (i === controlIndex) return;
    const sorted = lifts[i].slice().sort((a, b) => a - b);
    const mean = sorted.reduce((s, x) => s + x, 0) / sorted.length;
    comparisons.push({
      arm_id: arm.id,
      rate: arm.successes / arm.trials,
      lift: mean,
      lift_low: quantileSorted(sorted, 0.05),
      lift_high: quantileSorted(sorted, 0.95),
      probability_better: wins[i] / draws,
    });
  });

  const probability_best: Record<string, number> = {};
  arms.forEach((arm, i) => (probability_best[arm.id] = bests[i] / draws));
  const control = arms[controlIndex];
  return { control_id: controlId, control_rate: control.successes / control.trials, comparisons, probability_best };
}
