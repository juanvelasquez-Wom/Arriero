import { describe, expect, it } from "vitest";
import { probabilityToBeatControl } from "../stats";
import { compareRates } from "./bayes";

describe("compareRates", () => {
  it("caso simétrico: probabilidad ≈ 0,5 y mejora ≈ 0", () => {
    const r = compareRates(
      [
        { id: "c", successes: 100, trials: 1000 },
        { id: "v", successes: 100, trials: 1000 },
      ],
      "c",
    )!;
    expect(r.comparisons[0].probability_better).toBeCloseTo(0.5, 1);
    expect(Math.abs(r.comparisons[0].lift)).toBeLessThan(0.03);
    expect(r.comparisons[0].lift_low).toBeLessThan(0);
    expect(r.comparisons[0].lift_high).toBeGreaterThan(0);
  });

  it("ganador claro: 100/1000 vs 150/1000 → P > 0,99", () => {
    const r = compareRates(
      [
        { id: "c", successes: 100, trials: 1000 },
        { id: "v", successes: 150, trials: 1000 },
      ],
      "c",
    )!;
    const v = r.comparisons[0];
    expect(v.probability_better).toBeGreaterThan(0.99);
    expect(v.rate).toBe(0.15);
    expect(r.control_rate).toBe(0.1);
    expect(v.lift).toBeGreaterThan(0.4);
    expect(v.lift).toBeLessThan(0.6);
    expect(v.lift_low).toBeGreaterThan(0.2);
  });

  it("direction down invierte la probabilidad pero no la mejora", () => {
    const arms = [
      { id: "c", successes: 100, trials: 1000 },
      { id: "v", successes: 150, trials: 1000 },
    ];
    const up = compareRates(arms, "c", "up")!;
    const down = compareRates(arms, "c", "down")!;
    expect(down.comparisons[0].probability_better).toBeCloseTo(1 - up.comparisons[0].probability_better, 6);
    expect(down.comparisons[0].lift).toBeCloseTo(up.comparisons[0].lift, 6);
    expect(down.probability_best.c).toBeGreaterThan(0.99);
  });

  it("coincide con la aproximación normal de stats.ts en muestras grandes (±0,02)", () => {
    const cases = [
      [500, 10000, 540, 10000],
      [1200, 20000, 1260, 20000],
      [300, 5000, 290, 5000],
    ] as const;
    for (const [cs, ct, vs, vt] of cases) {
      const r = compareRates(
        [
          { id: "c", successes: cs, trials: ct },
          { id: "v", successes: vs, trials: vt },
        ],
        "c",
      )!;
      const approx = probabilityToBeatControl({ sample: ct, conversions: cs }, { sample: vt, conversions: vs })!;
      expect(Math.abs(r.comparisons[0].probability_better - approx)).toBeLessThan(0.02);
    }
  });

  it("tres variantes: P(mejor) suma 1", () => {
    const r = compareRates(
      [
        { id: "c", successes: 100, trials: 1000 },
        { id: "a", successes: 110, trials: 1000 },
        { id: "b", successes: 120, trials: 1000 },
      ],
      "c",
    )!;
    const total = Object.values(r.probability_best).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(r.comparisons.map((c) => c.arm_id)).toEqual(["a", "b"]);
    expect(r.probability_best.b).toBeGreaterThan(r.probability_best.a);
  });

  it("es reproducible con la misma semilla", () => {
    const arms = [
      { id: "c", successes: 30, trials: 400 },
      { id: "v", successes: 38, trials: 400 },
    ];
    expect(compareRates(arms, "c", "up", { seed: 9 })).toEqual(compareRates(arms, "c", "up", { seed: 9 }));
  });

  it("null con datos inválidos", () => {
    expect(compareRates([{ id: "c", successes: 1, trials: 10 }], "c")).toBeNull();
    expect(
      compareRates(
        [
          { id: "c", successes: 1, trials: 0 },
          { id: "v", successes: 1, trials: 10 },
        ],
        "c",
      ),
    ).toBeNull();
    expect(
      compareRates(
        [
          { id: "c", successes: 11, trials: 10 },
          { id: "v", successes: 1, trials: 10 },
        ],
        "c",
      ),
    ).toBeNull();
    expect(
      compareRates(
        [
          { id: "c", successes: 1, trials: 10 },
          { id: "v", successes: 1, trials: 10 },
        ],
        "x",
      ),
    ).toBeNull();
  });
});
