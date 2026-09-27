import { describe, expect, it } from "vitest";
import { beta, DEFAULT_SEED, gamma, mulberry32, normal, quantileSorted } from "./random";

function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function variance(xs: number[]) {
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
}
function draws(n: number, f: () => number) {
  return Array.from({ length: n }, f);
}

describe("mulberry32", () => {
  it("es reproducible con la misma semilla", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(draws(5, a)).toEqual(draws(5, b));
  });

  it("cambia con otra semilla y usa la semilla por defecto", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
    expect(mulberry32()()).toBe(mulberry32(DEFAULT_SEED)());
  });

  it("queda en [0, 1) y es uniforme en promedio", () => {
    const xs = draws(20000, mulberry32(7));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(mean(xs)).toBeCloseTo(0.5, 2);
    expect(variance(xs)).toBeCloseTo(1 / 12, 2);
  });
});

describe("distribuciones", () => {
  it("normal: media 0 y varianza 1", () => {
    const rng = mulberry32(1);
    const xs = draws(20000, () => normal(rng));
    expect(Math.abs(mean(xs))).toBeLessThan(0.03);
    expect(Math.abs(variance(xs) - 1)).toBeLessThan(0.04);
  });

  it("gamma: media = varianza = shape, también con shape < 1", () => {
    for (const shape of [0.5, 1, 3, 20]) {
      const rng = mulberry32(3);
      const xs = draws(20000, () => gamma(rng, shape));
      expect(Math.abs(mean(xs) - shape) / shape).toBeLessThan(0.04);
      expect(Math.abs(variance(xs) - shape) / shape).toBeLessThan(0.1);
    }
    expect(gamma(mulberry32(), 0)).toBeNaN();
  });

  it("beta: media a / (a + b)", () => {
    const rng = mulberry32(5);
    const xs = draws(20000, () => beta(rng, 2, 8));
    expect(mean(xs)).toBeCloseTo(0.2, 2);
    const a = 2;
    const b = 8;
    expect(variance(xs)).toBeCloseTo((a * b) / ((a + b) ** 2 * (a + b + 1)), 3);
  });

  it("quantileSorted interpola", () => {
    expect(quantileSorted([0, 10], 0.5)).toBe(5);
    expect(quantileSorted([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(quantileSorted([], 0.5)).toBeNaN();
  });
});
