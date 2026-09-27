import { describe, expect, it } from "vitest";
import { bootstrapRatio } from "./bootstrap";

const perDay = (values: number[]) => values.map((v) => ({ num: v, den: 1 }));

describe("bootstrapRatio", () => {
  it("promedio por periodo: estadístico y mejora observados", () => {
    const r = bootstrapRatio(perDay([100, 102, 98, 101, 99]), perDay([120, 118, 122, 121, 119]))!;
    expect(r.control).toBe(100);
    expect(r.variant).toBe(120);
    expect(r.lift).toBeCloseTo(0.2, 10);
    expect(r.probability_better).toBe(1);
    expect(r.lift_low).toBeGreaterThan(0.15);
    expect(r.lift_high).toBeLessThan(0.25);
  });

  it("costo por resultado con direction down", () => {
    // Control: 1 000 000 / 50 = 20 000 · Variante: 1 000 000 / 62,5 = 16 000.
    const control = [
      { num: 500_000, den: 25 },
      { num: 500_000, den: 25 },
      { num: 500_000, den: 24 },
      { num: 500_000, den: 26 },
    ];
    const variant = [
      { num: 500_000, den: 31 },
      { num: 500_000, den: 32 },
      { num: 500_000, den: 31 },
      { num: 500_000, den: 31 },
    ];
    const r = bootstrapRatio(control, variant, "down")!;
    expect(r.control).toBe(20000);
    expect(r.variant).toBeCloseTo(16000, 0);
    expect(r.lift).toBeCloseTo(-0.2, 2);
    expect(r.probability_better).toBe(1);
  });

  it("sin diferencia: probabilidad cerca de 0,5 e intervalo que cruza cero", () => {
    const r = bootstrapRatio(perDay([10, 12, 8, 11, 9, 10]), perDay([9, 11, 10, 12, 8, 10]))!;
    expect(r.lift).toBe(0);
    expect(r.lift_low).toBeLessThan(0);
    expect(r.lift_high).toBeGreaterThan(0);
    expect(r.probability_better).toBeGreaterThan(0.3);
    expect(r.probability_better).toBeLessThan(0.7);
  });

  it("es reproducible con la misma semilla", () => {
    const c = perDay([5, 7, 6, 9]);
    const v = perDay([6, 8, 7, 7]);
    expect(bootstrapRatio(c, v, "up", { seed: 3 })).toEqual(bootstrapRatio(c, v, "up", { seed: 3 }));
  });

  it("null con pocos periodos o denominadores en cero", () => {
    expect(bootstrapRatio(perDay([1]), perDay([1, 2]))).toBeNull();
    expect(bootstrapRatio(perDay([1, 2]), perDay([1]))).toBeNull();
    expect(
      bootstrapRatio(
        [
          { num: 1, den: 0 },
          { num: 1, den: 0 },
        ],
        perDay([1, 2]),
      ),
    ).toBeNull();
    expect(
      bootstrapRatio(perDay([1, 2]), [
        { num: 1, den: 0 },
        { num: 1, den: 0 },
      ]),
    ).toBeNull();
  });
});
