// Lectura honesta de resultados: probabilidad de ganarle al control e intervalo
// de la mejora. Solo para pruebas A/B con muestra y conversiones. Es una ayuda
// para leer: el veredicto sigue siendo de una persona frente a la regla.
//
// Modelo: cada variante tiene una posterior Beta(1 + conversiones, 1 + muestra − conversiones)
// (a priori uniforme). La probabilidad y el intervalo salen del mismo motor de
// Pilotos (Monte Carlo con semilla fija, pilots/bayes.ts): es determinista y
// los dos módulos dicen lo mismo con los mismos datos.
import { compareRates, type RateComparison } from "./pilots/bayes";
import type { MetricDirection, TestType, Variant } from "./types";

/** Datos mínimos de una variante para la estadística. */
export type Arm = Pick<Variant, "sample" | "conversions">;

interface Posterior {
  mean: number;
  variance: number;
}

/** Posterior Beta(1 + conv, 1 + n − conv); null si los datos no alcanzan. */
export function betaPosterior(arm: Arm): Posterior | null {
  const { sample: n, conversions: c } = arm;
  if (n == null || c == null || !Number.isFinite(n) || !Number.isFinite(c)) return null;
  if (n <= 0 || c < 0 || c > n) return null;
  const a = 1 + c;
  const b = 1 + n - c;
  const s = a + b;
  return { mean: a / s, variance: (a * b) / (s * s * (s + 1)) };
}

/** Función de distribución de la normal estándar (Abramowitz y Stegun 7.1.26, error < 1,5e-7). */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/**
 * Probabilidad (0–1) de que la variante sea mejor que el control.
 * Con `direction = "down"` (menos es mejor) se invierte. Null sin datos suficientes.
 */
export function probabilityToBeatControl(control: Arm, variant: Arm, direction: MetricDirection = "up"): number | null {
  const r = simulate(control, variant, DEFAULT_LEVEL);
  if (!r) return null;
  return direction === "down" ? 1 - r.probability_better : r.probability_better;
}

/** Nivel por defecto del intervalo de la mejora (95 %). */
const DEFAULT_LEVEL = 0.95;
const CACHE_LIMIT = 500;
const cache = new Map<string, RateComparison | null>();

/**
 * Un solo motor para ejercicios y pilotos: la comparación por Monte Carlo con
 * semilla fija de `compareRates` (pilots/bayes.ts). Los mismos datos dan la
 * misma probabilidad en los dos módulos. Se guarda en memoria porque las
 * vistas piden la probabilidad y el intervalo de la misma pareja.
 */
function simulate(control: Arm, variant: Arm, level: number): RateComparison | null {
  if (!betaPosterior(control) || !betaPosterior(variant)) return null;
  const key = `${control.sample}|${control.conversions}|${variant.sample}|${variant.conversions}|${level}`;
  if (cache.has(key)) return cache.get(key)!;
  const r = compareRates(
    [
      { id: "control", trials: control.sample!, successes: control.conversions! },
      { id: "variant", trials: variant.sample!, successes: variant.conversions! },
    ],
    "control",
    "up",
    { intervalLevel: level },
  );
  const out = r?.comparisons[0] ?? null;
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, out);
  return out;
}

export interface LiftInterval {
  /** Límite inferior de la mejora relativa (−0,05 = −5 %). */
  low: number;
  /** Límite superior. */
  high: number;
}

/**
 * Intervalo creíble de la mejora relativa (variante / control − 1): percentiles
 * de las simulaciones de `compareRates`. `z` fija el nivel (1,96 → 95 %). Queda
 * asimétrico y nunca baja de −100 %.
 */
export function liftInterval(control: Arm, variant: Arm, z = 1.959964): LiftInterval | null {
  if (!Number.isFinite(z) || z <= 0) return null;
  const level = Math.round((2 * normalCdf(z) - 1) * 1e4) / 1e4;
  const r = simulate(control, variant, level);
  if (!r || !Number.isFinite(r.lift_low) || !Number.isFinite(r.lift_high)) return null;
  return { low: r.lift_low, high: r.lift_high };
}

export type ConfidenceLevel = "reliable" | "almost" | "unknown";

export interface ConfidenceBand {
  level: ConfidenceLevel;
  /** Hacia dónde apunta la evidencia cuando es clara: mejor o peor que el control. */
  leaning: "better" | "worse" | null;
  label: string;
}

/**
 * Bandas de confianza sobre la probabilidad de ganar: ≥ 95 % "Confiable",
 * 80–95 % "Casi", < 80 % "Todavía no se sabe". Si la probabilidad es muy
 * baja (≤ 5 % o ≤ 20 %) la evidencia también es clara, pero de que pierde.
 */
export function confidenceBand(probability: number | null): ConfidenceBand | null {
  if (probability == null || !Number.isFinite(probability)) return null;
  if (probability >= 0.95) return { level: "reliable", leaning: "better", label: "Confiable" };
  if (probability >= 0.8) return { level: "almost", leaning: "better", label: "Casi" };
  if (probability <= 0.05) return { level: "reliable", leaning: "worse", label: "Confiable: pierde" };
  if (probability <= 0.2) return { level: "almost", leaning: "worse", label: "Casi seguro que pierde" };
  return { level: "unknown", leaning: null, label: "Todavía no se sabe" };
}

export type EvidenceKind = "probabilistic" | "directional";

export const DIRECTIONAL_LABEL = "Evidencia direccional";

/** Solo el A/B reparte al azar; geografía y antes/después dan evidencia direccional. */
export function evidenceKind(testType: TestType | null | undefined): EvidenceKind {
  return testType === "ab" ? "probabilistic" : "directional";
}

export interface VariantStats {
  id: string;
  /** Null para el control, en pruebas no A/B o sin datos suficientes. */
  probability: number | null;
  interval: LiftInterval | null;
  band: ConfidenceBand | null;
}

export interface ExperimentStats {
  kind: EvidenceKind;
  variants: VariantStats[];
  /** La variante no control con mayor probabilidad de ganar (solo A/B con datos). */
  best: VariantStats | null;
}

/** Estadística de todas las variantes de un ejercicio frente a su control. */
export function analyzeExperiment(input: {
  variants: (Arm & Pick<Variant, "id" | "is_control">)[];
  testType: TestType | null | undefined;
  direction?: MetricDirection | null;
}): ExperimentStats {
  const kind = evidenceKind(input.testType);
  const control = input.variants.find((v) => v.is_control) ?? null;
  const direction = input.direction ?? "up";
  const variants: VariantStats[] = input.variants.map((v) => {
    if (kind !== "probabilistic" || !control || v.is_control) return { id: v.id, probability: null, interval: null, band: null };
    const probability = probabilityToBeatControl(control, v, direction);
    return { id: v.id, probability, interval: liftInterval(control, v), band: confidenceBand(probability) };
  });
  const candidates = variants.filter((v) => v.probability != null);
  const best = candidates.length ? candidates.reduce((a, b) => (b.probability! > a.probability! ? b : a)) : null;
  return { kind, variants, best };
}

/** Umbral por debajo del cual declarar "Ganador" merece una advertencia fuerte. */
export const WINNER_WARNING_THRESHOLD = 0.9;
/** Umbral para celebrar un ganador como confiable. */
export const RELIABLE_THRESHOLD = 0.95;

/** ¿Hay que advertir antes de declarar ganador? (no A/B, sin probabilidad o por debajo del 90 %). */
export function winnerNeedsWarning(stats: ExperimentStats): boolean {
  if (stats.kind !== "probabilistic") return true;
  const p = stats.best?.probability;
  return p == null || p < WINNER_WARNING_THRESHOLD;
}

/** ¿El ganador es confiable como para celebrarlo? (A/B y probabilidad ≥ 95 %). */
export function isReliableWinner(stats: ExperimentStats): boolean {
  return stats.kind === "probabilistic" && (stats.best?.probability ?? 0) >= RELIABLE_THRESHOLD;
}

/** 0.973 → "97 %"; los extremos no se redondean a 0 ni a 100 (nada es seguro). */
export function formatProbability(p: number | null | undefined, fallback = "—"): string {
  if (p == null || !Number.isFinite(p)) return fallback;
  if (p >= 0.995) return "> 99 %";
  if (p < 0.005) return "< 1 %";
  return `${Math.round(p * 100)} %`;
}
