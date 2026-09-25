// Regla 6 · Cálculos de resultados. Sin significancia estadística: el veredicto
// lo emite una persona frente a la regla de decisión.
import type { Variant } from "./types";

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
