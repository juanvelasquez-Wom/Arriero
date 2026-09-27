// Calculadora de potencia de un piloto: qué efecto mínimo (MDE) alcanza a ver
// con los días planeados, cuántos días necesita para ver el efecto que busca y
// cuántos días alcanza el presupuesto. Es una guía para planear, no una decisión.
//
// Con más de dos grupos se corrige alfa por Bonferroni: alfa / (grupos − 1),
// porque cada variante se compara contra el control.
import { normalQuantile, sampleSizePerVariant } from "../sample-size";
import { isFiniteNumber, pctText, round } from "./numbers";
import type { PilotMetricCalc, PowerInputs, PowerResult } from "./types";

export interface PowerOptions {
  alpha?: number;
  power?: number;
}

/** Variación diaria que se asume cuando no se indica (30 %). */
export const DEFAULT_DAILY_CV = 0.3;
/** Más de 8 semanas ya no es un piloto. */
export const MAX_PILOT_DAYS = 56;
/** Tope de búsqueda del MDE: 1000 %. */
const MAX_MDE = 10;

function zSum(alpha: number, power: number): number {
  return normalQuantile(1 - alpha / 2) + normalQuantile(power);
}

/**
 * Menor cambio relativo (fracción positiva) que se detecta en una tasa `baselineRate`
 * con `perArmN` casos por grupo. Búsqueda por bisección sobre `sampleSizePerVariant`.
 * Null si ni con el tope (1000 % o la tasa llegando a 1) alcanza la muestra.
 */
export function mdeForRate(baselineRate: number, perArmN: number, options: PowerOptions = {}): number | null {
  const alpha = options.alpha ?? 0.05;
  const power = options.power ?? 0.8;
  if (!isFiniteNumber(baselineRate) || !isFiniteNumber(perArmN)) return null;
  if (baselineRate <= 0 || baselineRate >= 1 || perArmN <= 0) return null;
  // La tasa con el efecto debe quedar por debajo de 1.
  const hiLimit = Math.min(MAX_MDE, (1 - 1e-9) / baselineRate - 1);
  if (!(hiLimit > 0)) return null;
  const fits = (mde: number) => {
    const n = sampleSizePerVariant(baselineRate, mde, { alpha, power });
    return n != null && n <= perArmN;
  };
  if (!fits(hiLimit)) return null;
  let lo = 0;
  let hi = hiLimit;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * MDE relativo (fracción) para una métrica continua diaria con coeficiente de
 * variación `cv` y `periodsPerArm` periodos por grupo: (zα/2 + zβ)·√2·cv/√n.
 */
export function mdeForContinuous(cv: number, periodsPerArm: number, options: PowerOptions = {}): number | null {
  const alpha = options.alpha ?? 0.05;
  const power = options.power ?? 0.8;
  if (!isFiniteNumber(cv) || !isFiniteNumber(periodsPerArm) || cv <= 0 || periodsPerArm <= 0) return null;
  if (alpha <= 0 || alpha >= 1 || power <= 0 || power >= 1) return null;
  return (zSum(alpha, power) * Math.SQRT2 * cv) / Math.sqrt(periodsPerArm);
}

/**
 * Potencia de un piloto. `expectedPct` es el efecto esperado de la hipótesis (% relativo);
 * `arms` el número de grupos (incluido el control); `plannedBudgetCop` el presupuesto total.
 */
export function computePower(
  calc: PilotMetricCalc,
  inputs: PowerInputs,
  expectedPct: number | null,
  arms: number,
  plannedBudgetCop: number | null = null,
): PowerResult {
  const warnings: string[] = [];
  const comparisons = Math.max(1, Math.floor(arms) - 1);
  const alpha = (inputs.alpha ?? 0.05) / comparisons;
  const power = inputs.power ?? 0.8;
  const opts = { alpha, power };
  const plannedDays = inputs.planned_days;
  const targetRaw = inputs.target_mde_pct ?? expectedPct;
  const targetPct = isFiniteNumber(targetRaw) && targetRaw !== 0 ? Math.abs(targetRaw) : null;

  // Días que alcanza el presupuesto.
  let budgetDays: number | null = null;
  const spend = inputs.daily_spend_cop;
  if (isFiniteNumber(plannedBudgetCop) && plannedBudgetCop > 0 && isFiniteNumber(spend) && spend > 0) {
    budgetDays = Math.floor(plannedBudgetCop / spend);
  }

  let mdePct: number | null = null;
  let daysNeeded: number | null = null;
  const validDays = isFiniteNumber(plannedDays) && plannedDays > 0;
  const validAlpha = alpha > 0 && alpha < 1 && power > 0 && power < 1;

  if (!validDays) warnings.push("Indique cuántos días piensa correr el piloto.");
  if (!validAlpha) warnings.push("La confianza o la potencia no son válidas: use valores entre 0 y 1.");

  if (calc === "rate") {
    const volume = inputs.daily_volume_per_arm;
    const validBaseline = isFiniteNumber(inputs.baseline) && inputs.baseline > 0 && inputs.baseline < 1;
    const validVolume = isFiniteNumber(volume) && volume > 0;
    if (!validBaseline) warnings.push("La tasa base debe estar entre 0 % y 100 %.");
    if (!validVolume) warnings.push("Indique el volumen diario por grupo para calcular la potencia.");
    if (validBaseline && validVolume && validAlpha) {
      if (validDays) {
        const mde = mdeForRate(inputs.baseline, volume * plannedDays, opts);
        mdePct = mde == null ? null : round(mde * 100);
        if (mde == null) warnings.push("Con ese volumen la prueba no alcanza a ver ningún efecto razonable.");
      }
      if (targetPct != null) {
        const n = sampleSizePerVariant(inputs.baseline, targetPct / 100, opts);
        daysNeeded = n == null ? null : Math.ceil(n / volume);
      }
    }
  } else {
    const validBaseline = isFiniteNumber(inputs.baseline) && inputs.baseline > 0;
    if (!validBaseline) warnings.push("El valor diario promedio debe ser mayor que cero.");
    let cv = inputs.daily_cv;
    if (!isFiniteNumber(cv) || cv <= 0) {
      cv = DEFAULT_DAILY_CV;
      warnings.push(`Se asumió una variación diaria de ${pctText(DEFAULT_DAILY_CV * 100)} porque no la indicó.`);
    }
    if (validBaseline && validAlpha) {
      if (validDays) {
        const mde = mdeForContinuous(cv, plannedDays, opts);
        mdePct = mde == null ? null : round(mde * 100);
      }
      if (targetPct != null) {
        const k = (zSum(alpha, power) * Math.SQRT2 * cv) / (targetPct / 100);
        daysNeeded = Math.ceil(k * k);
      }
    }
  }

  if (mdePct != null && targetPct != null && mdePct > targetPct) {
    warnings.push(
      `La prueba no alcanza a ver el efecto que espera: el MDE es ${pctText(mdePct)} y la hipótesis espera ${pctText(targetPct)}.`,
    );
  }
  if (daysNeeded != null && validDays && daysNeeded > plannedDays) {
    warnings.push(`Para ver un efecto de ${pctText(targetPct ?? 0)} necesita ${daysNeeded} días y tiene ${plannedDays} planeados.`);
  }
  if (daysNeeded != null && daysNeeded > MAX_PILOT_DAYS) {
    warnings.push(`Necesita ${daysNeeded} días, más de 8 semanas: es muy larga para un piloto.`);
  }
  if (budgetDays != null && validDays && budgetDays < plannedDays) {
    warnings.push(`El presupuesto no alcanza para los días planeados: cubre ${budgetDays} de ${plannedDays} días.`);
  }

  return { mde_pct: mdePct, days_needed: daysNeeded, budget_days: budgetDays, warnings };
}
