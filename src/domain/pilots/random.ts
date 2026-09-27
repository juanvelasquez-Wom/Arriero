// Generador pseudoaleatorio con semilla y distribuciones básicas para las
// simulaciones de Monte Carlo y el bootstrap. Con la misma semilla, el
// resultado es siempre el mismo: la lectura de un piloto no cambia al recargar.

/** Semilla por defecto de todas las simulaciones del módulo. */
export const DEFAULT_SEED = 20260927;

export type Rng = () => number;

/** Mulberry32: PRNG de 32 bits, rápido y suficiente para simulación. Devuelve números en [0, 1). */
export function mulberry32(seed: number = DEFAULT_SEED): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal estándar por Box–Muller (se usa 1 − u para no tomar log(0)). */
export function normal(rng: Rng): number {
  const u1 = 1 - rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Gamma(shape, 1) por Marsaglia–Tsang. Para shape < 1 se usa el refuerzo
 * Gamma(shape + 1) · U^(1/shape). Devuelve NaN si shape no es positivo.
 */
export function gamma(rng: Rng, shape: number): number {
  if (!(shape > 0) || !Number.isFinite(shape)) return Number.NaN;
  if (shape < 1) {
    const u = 1 - rng();
    return gamma(rng, shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = 1 - rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Beta(a, b) como X / (X + Y) con X ~ Gamma(a), Y ~ Gamma(b). */
export function beta(rng: Rng, a: number, b: number): number {
  const x = gamma(rng, a);
  const y = gamma(rng, b);
  return x / (x + y);
}

/** Percentil (0–1) de una lista ya ordenada, con interpolación lineal. */
export function quantileSorted(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
