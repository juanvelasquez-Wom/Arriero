// Utilidades numéricas compartidas por el motor de pilotos.

/** Redondea a `digits` decimales (por defecto uno). Deja pasar null. */
export function round(value: number | null, digits = 1): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** 12.5 → "12,5 %" (formato es-CO, un decimal como máximo). */
export function pctText(value: number): string {
  const r = round(value) ?? 0;
  return `${String(r).replace(".", ",")} %`;
}

export function sum(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export function mean(xs: readonly number[]): number | null {
  return xs.length ? sum(xs) / xs.length : null;
}

export function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}
