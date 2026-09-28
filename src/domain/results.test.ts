import { describe, expect, it } from "vitest";
import { computeVariantResults, conversionRate, draftLearning, hasCompleteResults, headlineDiff, readExperiment, relativeDiff } from "./results";
import type { Variant } from "./types";

const v = (o: Partial<Variant>): Variant => ({
  id: o.id ?? "v",
  name: o.name ?? "v",
  is_control: false,
  sample: null,
  conversions: null,
  metric_value: null,
  ...o,
});

describe("conversionRate", () => {
  it("divide conversiones entre muestra", () => {
    expect(conversionRate(5000, 900)).toBe(0.18);
    expect(conversionRate(5000, 1150)).toBe(0.23);
  });
  it("protege la división por cero y los vacíos", () => {
    expect(conversionRate(0, 10)).toBeNull();
    expect(conversionRate(null, 10)).toBeNull();
    expect(conversionRate(100, null)).toBeNull();
  });
});

describe("relativeDiff", () => {
  it("calcula la diferencia relativa", () => {
    expect(relativeDiff(0.23, 0.18)).toBeCloseTo(0.2778, 4);
    expect(relativeDiff(0.21, 0.25)).toBeCloseTo(-0.16, 4);
  });
  it("es null con base 0 o vacía", () => {
    expect(relativeDiff(0.2, 0)).toBeNull();
    expect(relativeDiff(0.2, null)).toBeNull();
    expect(relativeDiff(null, 0.2)).toBeNull();
  });
});

describe("computeVariantResults", () => {
  it("ejercicio 1 del ejemplo: 18,0 % vs 23,0 % → +27,8 %", () => {
    const r = computeVariantResults([
      v({ id: "c", is_control: true, sample: 5000, conversions: 900 }),
      v({ id: "t", sample: 5000, conversions: 1150 }),
    ]);
    expect(r[0].rate).toBe(0.18);
    expect(r[0].diffVsControl).toBeNull();
    expect(r[1].rate).toBe(0.23);
    expect(Math.round(r[1].diffVsControl! * 1000) / 10).toBe(27.8);
    expect(Math.round(headlineDiff(r)! * 1000) / 10).toBe(27.8);
  });

  it("ejercicio 3 del ejemplo: 25,0 % vs 21,0 % → −16,0 %", () => {
    const r = computeVariantResults([
      v({ id: "c", is_control: true, sample: 2400, conversions: 600 }),
      v({ id: "t", sample: 3100, conversions: 651 }),
    ]);
    expect(r[0].rate).toBe(0.25);
    expect(r[1].rate).toBe(0.21);
    expect(Math.round(r[1].diffVsControl! * 1000) / 10).toBe(-16);
  });

  it("usa el valor de la métrica cuando no hay conversiones", () => {
    const r = computeVariantResults([
      v({ id: "c", is_control: true, sample: 1000, metric_value: 10000 }),
      v({ id: "t", sample: 1000, metric_value: 8500 }),
    ]);
    expect(r[1].value).toBe(8500);
    expect(r[1].diffVsControl).toBeCloseTo(-0.15, 6);
  });

  it("sin control no hay diferencia", () => {
    const r = computeVariantResults([v({ sample: 10, conversions: 5 })]);
    expect(r[0].diffVsControl).toBeNull();
    expect(headlineDiff(r)).toBeNull();
  });

  it("control con muestra 0 no rompe", () => {
    const r = computeVariantResults([
      v({ id: "c", is_control: true, sample: 0, conversions: 0 }),
      v({ id: "t", sample: 10, conversions: 5 }),
    ]);
    expect(r[1].diffVsControl).toBeNull();
  });
});

describe("hasCompleteResults", () => {
  it("exige muestra y conversiones o valor en todas", () => {
    expect(hasCompleteResults([])).toBe(false);
    expect(hasCompleteResults([v({ sample: 1, conversions: 1 }), v({ sample: 1 })])).toBe(false);
    expect(hasCompleteResults([v({ sample: 1, conversions: 1 }), v({ sample: 1, metric_value: 3 })])).toBe(true);
  });
});

describe("readExperiment", () => {
  const variants = [
    v({ id: "c", name: "Control", is_control: true, sample: 5000, conversions: 900 }),
    v({ id: "t", name: "Checkout corto", sample: 5000, conversions: 1150 }),
  ];
  const metric = { unit: "altas", direction: "up" as const, baseline: 1000, latest_value: null, unit_value: 100_000 };

  it("junta tasa, probabilidad y valor estimado", () => {
    const r = readExperiment({ variants, testType: "ab", metric });
    expect(r.kind).toBe("probabilistic");
    expect(r.rows[0].stats.probability).toBeNull();
    expect(r.rows[0].value_estimate).toBeNull();
    expect(r.headline?.id).toBe("t");
    expect(r.headline!.stats.probability).toBeGreaterThan(0.99);
    expect(r.headline!.value_estimate!.weekly).toBeCloseTo((0.23 / 0.18 - 1) * 1000 * 100_000, 0);
  });

  it("el piso conservador usa el límite inferior del intervalo y queda por debajo del techo", () => {
    const r = readExperiment({ variants, testType: "ab", metric });
    const h = r.headline!;
    expect(h.value_conservative).not.toBeNull();
    expect(h.value_conservative!.weekly).toBeCloseTo(h.stats.interval!.low * 1000 * 100_000, 0);
    expect(h.value_conservative!.weekly).toBeLessThan(h.value_estimate!.weekly);
    expect(r.rows[0].value_conservative).toBeNull();
    // Sin intervalo (geo), no hay piso.
    expect(readExperiment({ variants, testType: "geo", metric }).headline!.value_conservative).toBeNull();
  });

  it("sin valor por unidad avisa qué falta", () => {
    const r = readExperiment({ variants, testType: "ab", metric: { ...metric, unit_value: null } });
    expect(r.headline!.value_missing).toBe("unit_value");
  });

  it("en geo es direccional y el titular es la mayor diferencia", () => {
    const r = readExperiment({ variants, testType: "geo", metric });
    expect(r.kind).toBe("directional");
    expect(r.headline?.id).toBe("t");
    expect(r.headline!.stats.probability).toBeNull();
  });
});

describe("draftLearning", () => {
  it("arma el borrador con la variante, la dirección y la probabilidad", () => {
    const reading = readExperiment({
      variants: [
        v({ id: "c", name: "Control", is_control: true, sample: 5000, conversions: 900 }),
        v({ id: "t", name: "Checkout corto", sample: 5000, conversions: 1150 }),
      ],
      testType: "ab",
    });
    const d = draftLearning({ reading, metricName: "la conversión" })!;
    expect(d).toMatch(/^La variante "Checkout corto" subió la conversión 27,8 % frente al control \(probabilidad de ganar > 99 %\)/);
  });
  it("bajó y direccional", () => {
    const reading = readExperiment({
      variants: [
        v({ id: "c", is_control: true, sample: 2400, conversions: 600 }),
        v({ id: "t", name: "B", sample: 3100, conversions: 651 }),
      ],
      testType: "before_after",
    });
    expect(draftLearning({ reading, metricName: "X" })).toMatch(/bajó X 16 % frente al control \(evidencia direccional/);
  });
  it("sin datos no propone nada", () => {
    expect(draftLearning({ reading: readExperiment({ variants: [], testType: "ab" }), metricName: "X" })).toBeNull();
  });
});
