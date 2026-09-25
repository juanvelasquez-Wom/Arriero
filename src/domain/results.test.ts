import { describe, expect, it } from "vitest";
import { computeVariantResults, conversionRate, hasCompleteResults, headlineDiff, relativeDiff } from "./results";
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
