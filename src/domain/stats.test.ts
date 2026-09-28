import { describe, expect, it } from "vitest";
import {
  analyzeExperiment,
  betaPosterior,
  confidenceBand,
  evidenceKind,
  formatProbability,
  isReliableWinner,
  liftInterval,
  normalCdf,
  probabilityToBeatControl,
  winnerNeedsWarning,
} from "./stats";
import { compareRates } from "./pilots/bayes";

describe("normalCdf", () => {
  it("coincide con los valores de tabla", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 5);
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 5);
    expect(normalCdf(1)).toBeCloseTo(0.841345, 5);
  });
});

describe("betaPosterior", () => {
  it("usa Beta(1 + conv, 1 + n − conv)", () => {
    const p = betaPosterior({ sample: 8, conversions: 2 })!;
    expect(p.mean).toBeCloseTo(3 / 10, 10);
    expect(p.variance).toBeCloseTo((3 * 7) / (100 * 11), 10);
  });
  it("es null con datos insuficientes o incoherentes", () => {
    expect(betaPosterior({ sample: 0, conversions: 0 })).toBeNull();
    expect(betaPosterior({ sample: null, conversions: 3 })).toBeNull();
    expect(betaPosterior({ sample: 10, conversions: null })).toBeNull();
    expect(betaPosterior({ sample: 10, conversions: 11 })).toBeNull();
  });
});

describe("probabilityToBeatControl", () => {
  it("ejercicio 1 del ejemplo (18 % vs 23 %, 5.000 por brazo) es prácticamente seguro", () => {
    expect(probabilityToBeatControl({ sample: 5000, conversions: 900 }, { sample: 5000, conversions: 1150 })).toBeGreaterThan(0.999);
  });
  it("una diferencia chica con poca muestra queda en zona gris", () => {
    const p = probabilityToBeatControl({ sample: 1000, conversions: 100 }, { sample: 1000, conversions: 115 })!;
    expect(p).toBeGreaterThan(0.84);
    expect(p).toBeLessThan(0.88);
  });
  it("brazos iguales dan 50 % (con el error de la simulación, ±1,5 puntos)", () => {
    const p = probabilityToBeatControl({ sample: 500, conversions: 50 }, { sample: 500, conversions: 50 })!;
    expect(Math.abs(p - 0.5)).toBeLessThan(0.015);
  });
  it("es determinista y da lo mismo que el motor de Pilotos", () => {
    const control = { sample: 1000, conversions: 100 };
    const variant = { sample: 1000, conversions: 115 };
    const p = probabilityToBeatControl(control, variant)!;
    expect(probabilityToBeatControl(control, variant)).toBe(p);
    const pilots = compareRates(
      [
        { id: "c", trials: 1000, successes: 100 },
        { id: "v", trials: 1000, successes: 115 },
      ],
      "c",
    )!;
    expect(pilots.comparisons[0].probability_better).toBe(p);
  });
  it("se invierte cuando menos es mejor", () => {
    const up = probabilityToBeatControl({ sample: 1000, conversions: 100 }, { sample: 1000, conversions: 115 })!;
    const down = probabilityToBeatControl({ sample: 1000, conversions: 100 }, { sample: 1000, conversions: 115 }, "down")!;
    expect(up + down).toBeCloseTo(1, 10);
  });
  it("es null sin datos", () => {
    expect(probabilityToBeatControl({ sample: 0, conversions: 0 }, { sample: 10, conversions: 1 })).toBeNull();
  });
});

describe("liftInterval", () => {
  it("contiene la mejora observada y es asimétrico", () => {
    const i = liftInterval({ sample: 5000, conversions: 900 }, { sample: 5000, conversions: 1150 })!;
    expect(i.low).toBeGreaterThan(0.17);
    expect(i.high).toBeLessThan(0.4);
    expect(i.low).toBeLessThan(0.278);
    expect(i.high).toBeGreaterThan(0.278);
    expect(i.high - 0.2775).toBeGreaterThan(0.2775 - i.low);
  });
  it("el intervalo al 90 % es más angosto que el de 95 %", () => {
    const c = { sample: 5000, conversions: 900 };
    const v = { sample: 5000, conversions: 1150 };
    const i95 = liftInterval(c, v)!;
    const i90 = liftInterval(c, v, 1.644854)!;
    expect(i90.low).toBeGreaterThan(i95.low);
    expect(i90.high).toBeLessThan(i95.high);
  });
  it("con poca muestra cruza el cero", () => {
    const i = liftInterval({ sample: 1000, conversions: 100 }, { sample: 1000, conversions: 115 })!;
    expect(i.low).toBeLessThan(0);
    expect(i.high).toBeGreaterThan(0);
  });
  it("nunca baja de −100 % y es null sin datos", () => {
    expect(liftInterval({ sample: 100, conversions: 50 }, { sample: 100, conversions: 0 })!.low).toBeGreaterThan(-1);
    expect(liftInterval({ sample: null, conversions: null }, { sample: 100, conversions: 1 })).toBeNull();
  });
});

describe("confidenceBand", () => {
  it("usa los cortes de 95 % y 80 %", () => {
    expect(confidenceBand(0.97)).toMatchObject({ level: "reliable", label: "Confiable" });
    expect(confidenceBand(0.95)?.level).toBe("reliable");
    expect(confidenceBand(0.9)).toMatchObject({ level: "almost", label: "Casi" });
    expect(confidenceBand(0.6)).toMatchObject({ level: "unknown", label: "Todavía no se sabe" });
    expect(confidenceBand(0.02)).toMatchObject({ level: "reliable", leaning: "worse" });
    expect(confidenceBand(null)).toBeNull();
  });
});

describe("analyzeExperiment", () => {
  const variants = [
    { id: "c", is_control: true, sample: 1000, conversions: 100 },
    { id: "a", is_control: false, sample: 1000, conversions: 104 },
    { id: "b", is_control: false, sample: 1000, conversions: 140 },
  ];
  it("calcula por variante y elige la de mayor probabilidad", () => {
    const s = analyzeExperiment({ variants, testType: "ab" });
    expect(s.kind).toBe("probabilistic");
    expect(s.variants[0].probability).toBeNull();
    expect(s.best?.id).toBe("b");
    expect(isReliableWinner(s)).toBe(true);
    expect(winnerNeedsWarning(s)).toBe(false);
  });
  it("geo y antes/después son direccionales, sin probabilidad", () => {
    expect(evidenceKind("geo")).toBe("directional");
    expect(evidenceKind("before_after")).toBe("directional");
    expect(evidenceKind(null)).toBe("directional");
    const s = analyzeExperiment({ variants, testType: "geo" });
    expect(s.best).toBeNull();
    expect(s.variants.every((v) => v.probability == null)).toBe(true);
    expect(winnerNeedsWarning(s)).toBe(true);
    expect(isReliableWinner(s)).toBe(false);
  });
  it("advierte si el mejor no llega a 90 %", () => {
    const s = analyzeExperiment({ variants: variants.slice(0, 2), testType: "ab" });
    expect(winnerNeedsWarning(s)).toBe(true);
  });
  it("sin conversiones (solo valor de la métrica) no hay probabilidad", () => {
    const s = analyzeExperiment({
      variants: [
        { id: "c", is_control: true, sample: 1000, conversions: null },
        { id: "t", is_control: false, sample: 1000, conversions: null },
      ],
      testType: "ab",
    });
    expect(s.best).toBeNull();
    expect(winnerNeedsWarning(s)).toBe(true);
  });
});

describe("formatProbability", () => {
  it("redondea a entero sin llegar a 0 ni 100", () => {
    expect(formatProbability(0.973)).toBe("97 %");
    expect(formatProbability(0.9999)).toBe("> 99 %");
    expect(formatProbability(0.001)).toBe("< 1 %");
    expect(formatProbability(null)).toBe("—");
  });
});
