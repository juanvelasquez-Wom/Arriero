// Regla 6 · Cálculos de resultados. La probabilidad de ganar (stats.ts) y el
// valor estimado (value.ts) ayudan a leer, pero el veredicto lo emite una
// persona frente a la regla de decisión.
import { analyzeExperiment, formatProbability, type EvidenceKind, type VariantStats } from "./stats";
import type { MetricDirection, TestType, Variant } from "./types";
import { estimateConservativeValue, estimateValue, type EstimatedValue, type MetricEconomics, type MissingValueInput } from "./value";

/** conversiones / muestra; null si no se puede calcular (muestra 0 o vacía). */
export function conversionRate(sample: number | null, conversions: number | null): number | null {
  if (sample == null || conversions == null || !Number.isFinite(sample) || sample <= 0) return null;
  return conversions / sample;
}

/** Diferencia relativa (value − base) / base; null si la base es 0 o vacía. */
export function relativeDiff(value: number | null, base: number | null): number | null {
  if (value == null || base == null || base === 0 || !Number.isFinite(base)) return null;
  return (value - base) / Math.abs(base);
}

export interface VariantResult {
  id: string;
  name: string;
  is_control: boolean;
  sample: number | null;
  conversions: number | null;
  metric_value: number | null;
  /** Tasa de conversión (0–1). */
  rate: number | null;
  /** Valor comparado: la tasa si existe; si no, el valor de la métrica. */
  value: number | null;
  /** Diferencia relativa frente al control (0.278 = +27,8 %). Null para el control. */
  diffVsControl: number | null;
}

export function computeVariantResults(variants: Variant[]): VariantResult[] {
  const withValues = variants.map((v) => {
    const rate = conversionRate(v.sample, v.conversions);
    return { v, rate, value: rate ?? v.metric_value };
  });
  const control = withValues.find((x) => x.v.is_control);
  return withValues.map(({ v, rate, value }) => ({
    id: v.id,
    name: v.name,
    is_control: v.is_control,
    sample: v.sample,
    conversions: v.conversions,
    metric_value: v.metric_value,
    rate,
    value,
    diffVsControl: v.is_control ? null : relativeDiff(value, control?.value ?? null),
  }));
}

/** Mejor diferencia de las variantes no control (la de mayor valor absoluto). */
export function headlineDiff(results: VariantResult[]): number | null {
  const diffs = results.filter((r) => !r.is_control && r.diffVsControl != null).map((r) => r.diffVsControl!);
  if (!diffs.length) return null;
  return diffs.reduce((best, d) => (Math.abs(d) > Math.abs(best) ? d : best));
}

export function hasCompleteResults(variants: Pick<Variant, "sample" | "conversions" | "metric_value">[]): boolean {
  return variants.length > 0 && variants.every((v) => v.sample != null && (v.conversions != null || v.metric_value != null));
}

export interface VariantReading extends VariantResult {
  stats: VariantStats;
  /** Valor estimado si se escala esta variante (null para el control o si falta un dato). */
  value_estimate: EstimatedValue | null;
  value_missing: MissingValueInput | null;
  /**
   * Piso del valor: el mismo cálculo con el extremo menos favorable del intervalo
   * de la mejora (solo A/B con datos). `value_estimate` es el techo optimista.
   */
  value_conservative: EstimatedValue | null;
}

export interface ExperimentReading {
  kind: EvidenceKind;
  rows: VariantReading[];
  /**
   * Variante que resume el resultado: en A/B con datos, la de mayor
   * probabilidad de ganar; si no, la de mayor diferencia absoluta.
   */
  headline: VariantReading | null;
}

/** Lectura completa: tasa, diferencia, probabilidad/intervalo y valor estimado por variante. */
export function readExperiment(input: {
  variants: Variant[];
  testType: TestType | null | undefined;
  metric?: Pick<MetricEconomics, "unit" | "baseline" | "latest_value" | "unit_value" | "direction"> | null;
}): ExperimentReading {
  const direction: MetricDirection = input.metric?.direction ?? "up";
  const results = computeVariantResults(input.variants);
  const stats = analyzeExperiment({ variants: input.variants, testType: input.testType, direction });
  const rows: VariantReading[] = results.map((r, i) => {
    const est = r.is_control ? { value: null, missing: null } : estimateValue({ lift: r.diffVsControl, metric: input.metric ?? null });
    const conservative =
      r.is_control || !est.value ? null : estimateConservativeValue({ interval: stats.variants[i]?.interval, metric: input.metric ?? null });
    return { ...r, stats: stats.variants[i], value_estimate: est.value, value_missing: est.missing, value_conservative: conservative };
  });
  const challengers = rows.filter((r) => !r.is_control);
  let headline: VariantReading | null = null;
  if (stats.best) headline = rows[stats.variants.indexOf(stats.best)] ?? null;
  if (!headline) {
    const withDiff = challengers.filter((r) => r.diffVsControl != null);
    headline = withDiff.length
      ? withDiff.reduce((a, b) => (Math.abs(b.diffVsControl!) > Math.abs(a.diffVsControl!) ? b : a))
      : (challengers[0] ?? null);
  }
  return { kind: stats.kind, rows, headline };
}

/**
 * Borrador del aprendizaje a partir de los datos. La persona lo completa con
 * el porqué; solo se propone cuando el campo está vacío.
 */
export function draftLearning(input: { reading: ExperimentReading; metricName: string }): string | null {
  const h = input.reading.headline;
  if (!h || h.diffVsControl == null) return null;
  const verb = h.diffVsControl > 0 ? "subió" : h.diffVsControl < 0 ? "bajó" : "no movió";
  const pct = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(Math.abs(h.diffVsControl) * 100);
  const amount = h.diffVsControl === 0 ? "" : ` ${pct} %`;
  const evidence =
    input.reading.kind === "probabilistic" && h.stats.probability != null
      ? ` (probabilidad de ganar ${formatProbability(h.stats.probability)})`
      : " (evidencia direccional, sin probabilidad)";
  return `La variante "${h.name}" ${verb} ${input.metricName}${amount} frente al control${evidence}. Creemos que pasó porque… Lo que nos llevamos para otras líneas es…`;
}
