// Lectura de un holdout: un grupo expuesto a los medios contra un grupo que no los
// ve. Mide lo incremental: cuántas conversiones de más trajo la pauta y cuánto
// costó cada una. La probabilidad y el intervalo salen de la comparación bayesiana.
import type { MetricDirection } from "../types";
import { compareRates, type MonteCarloOptions } from "./bayes";

export interface HoldoutGroup {
  successes: number;
  trials: number;
}

export interface HoldoutInput {
  exposed: HoldoutGroup;
  holdout: HoldoutGroup;
  /** Inversión del grupo expuesto (COP); null si no se cargó. */
  spendCop: number | null;
  direction?: MetricDirection;
}

export interface HoldoutResult {
  rate_exposed: number;
  rate_holdout: number;
  /** Mejora relativa incremental (fracción): rate_exposed / rate_holdout − 1. Null si el holdout da 0. */
  lift: number | null;
  lift_low: number;
  lift_high: number;
  /** (rate_exposed − rate_holdout) × intentos del expuesto. */
  incremental_conversions: number;
  /** Inversión / conversiones incrementales; null sin inversión o sin incremento. */
  cost_per_incremental: number | null;
  probability_better: number;
}

/** Null si los datos de algún grupo no sirven. */
export function analyzeHoldout(input: HoldoutInput, options: MonteCarloOptions = {}): HoldoutResult | null {
  const { exposed, holdout, spendCop } = input;
  const cmp = compareRates(
    [
      { id: "holdout", successes: holdout.successes, trials: holdout.trials },
      { id: "exposed", successes: exposed.successes, trials: exposed.trials },
    ],
    "holdout",
    input.direction ?? "up",
    options,
  );
  if (!cmp) return null;
  const v = cmp.comparisons[0];
  const rateExposed = v.rate;
  const rateHoldout = cmp.control_rate;
  const incremental = (rateExposed - rateHoldout) * exposed.trials;
  const cost =
    spendCop != null && Number.isFinite(spendCop) && spendCop >= 0 && incremental > 0 ? spendCop / incremental : null;
  return {
    rate_exposed: rateExposed,
    rate_holdout: rateHoldout,
    lift: rateHoldout > 0 ? rateExposed / rateHoldout - 1 : null,
    lift_low: v.lift_low,
    lift_high: v.lift_high,
    incremental_conversions: incremental,
    cost_per_incremental: cost,
    probability_better: v.probability_better,
  };
}
