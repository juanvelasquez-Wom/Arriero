import { describe, expect, it } from "vitest";
import { analyzeHoldout } from "./holdout";

describe("analyzeHoldout", () => {
  it("tasas, incremento y costo por conversión incremental", () => {
    const r = analyzeHoldout({
      exposed: { successes: 600, trials: 20000 }, // 3 %
      holdout: { successes: 100, trials: 5000 }, // 2 %
      spendCop: 10_000_000,
    })!;
    expect(r.rate_exposed).toBeCloseTo(0.03, 10);
    expect(r.rate_holdout).toBeCloseTo(0.02, 10);
    expect(r.lift).toBeCloseTo(0.5, 10);
    expect(r.incremental_conversions).toBeCloseTo(200, 8);
    expect(r.cost_per_incremental).toBeCloseTo(50_000, 4);
    expect(r.probability_better).toBeGreaterThan(0.99);
    expect(r.lift_low).toBeGreaterThan(0.2);
    expect(r.lift_high).toBeGreaterThan(r.lift_low);
  });

  it("sin incremento no hay costo por incremental", () => {
    const r = analyzeHoldout({
      exposed: { successes: 190, trials: 10000 },
      holdout: { successes: 100, trials: 5000 },
      spendCop: 1_000_000,
    })!;
    expect(r.incremental_conversions).toBeLessThan(0);
    expect(r.cost_per_incremental).toBeNull();
    expect(r.probability_better).toBeLessThan(0.5);
  });

  it("sin inversión no hay costo", () => {
    const r = analyzeHoldout({ exposed: { successes: 30, trials: 100 }, holdout: { successes: 10, trials: 100 }, spendCop: null })!;
    expect(r.cost_per_incremental).toBeNull();
  });

  it("null con datos inválidos", () => {
    expect(analyzeHoldout({ exposed: { successes: 1, trials: 0 }, holdout: { successes: 1, trials: 10 }, spendCop: 1 })).toBeNull();
  });
});
