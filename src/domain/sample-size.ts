// Tamaño de muestra para una prueba A/B de dos proporciones (aproximación normal).
// Es una guía para planear la duración, no un criterio de decisión.

/**
 * Inversa de la normal estándar (algoritmo de Acklam, error relativo < 1,2e-9).
 * `p` en (0, 1).
 */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) return Number.NaN;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export interface SampleSizeOptions {
  /** Nivel de significancia, a dos colas. Por defecto 0,05 (95 % de confianza). */
  alpha?: number;
  /** Potencia. Por defecto 0,8. */
  power?: number;
}

/**
 * Personas necesarias en cada variante para detectar un cambio relativo `relativeMde`
 * sobre una tasa base `baselineRate` (ambos como fracción: 0,05 = 5 %; 0,1 = 10 %).
 * El cambio puede ser negativo (métricas que se quieren bajar). Devuelve null si los
 * datos no tienen sentido (tasa fuera de (0, 1), cambio nulo o tasa resultante fuera de rango).
 */
export function sampleSizePerVariant(baselineRate: number, relativeMde: number, options: SampleSizeOptions = {}): number | null {
  const alpha = options.alpha ?? 0.05;
  const power = options.power ?? 0.8;
  if (![baselineRate, relativeMde, alpha, power].every(Number.isFinite)) return null;
  if (baselineRate <= 0 || baselineRate >= 1 || relativeMde === 0) return null;
  if (alpha <= 0 || alpha >= 1 || power <= 0 || power >= 1) return null;
  const p1 = baselineRate;
  const p2 = baselineRate * (1 + relativeMde);
  if (p2 <= 0 || p2 >= 1) return null;
  const zAlpha = normalQuantile(1 - alpha / 2);
  const zBeta = normalQuantile(power);
  const pBar = (p1 + p2) / 2;
  const numerator = zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil((numerator * numerator) / ((p2 - p1) * (p2 - p1)));
}

/**
 * Días sugeridos para juntar la muestra: total de personas (muestra × variantes)
 * entre el tráfico diario. Se redondea a semanas completas (mínimo 7 días) para
 * no leer la prueba con la semana a medias. Null sin tráfico.
 */
export function suggestedDays(perVariant: number | null, variants: number, weeklyTraffic: number | null | undefined): number | null {
  if (perVariant == null || !weeklyTraffic || weeklyTraffic <= 0 || !Number.isFinite(weeklyTraffic) || variants < 1) return null;
  const days = Math.ceil((perVariant * variants) / (weeklyTraffic / 7));
  return Math.max(7, Math.ceil(days / 7) * 7);
}
