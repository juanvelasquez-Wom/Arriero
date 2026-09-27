import { describe, expect, it } from "vitest";
import { analyzeGeo, averageSeries, diffInDiff, placeboTest, syntheticControl, type Series } from "./geo";

// Semanas desde el 2026-06-01 (lunes).
function week(i: number): string {
  const d = new Date(Date.UTC(2026, 5, 1 + 7 * i));
  return d.toISOString().slice(0, 10);
}
function series(values: number[]): Series {
  return values.map((value, i) => ({ period: week(i), value }));
}
const POST = week(6); // 6 semanas antes, 4 después

// Ciudades de control con niveles distintos, tendencia común y un poco de ruido fijo.
const wiggle = [0, 1.5, -1, 0.5, -0.5, 1, -1.5, 0.5, 1, -0.5];
const trend = (base: number, shift: number) => wiggle.map((w, i) => base + 2 * i + ((w * shift) % 2));
const A = trend(100, 1);
const B = trend(150, -1);
const C = trend(80, 0.7);
const D = trend(120, -0.3);
const controls = [
  { label: "Cali", series: series(A) },
  { label: "Medellín", series: series(B) },
  { label: "Barranquilla", series: series(C) },
  { label: "Bucaramanga", series: series(D) },
];

describe("diffInDiff", () => {
  it("prueba = control + 10 después del inicio → efecto 10", () => {
    const control = series([50, 52, 54, 56, 58, 60, 62, 64, 66, 68]);
    const test = series([50, 52, 54, 56, 58, 60, 72, 74, 76, 78]);
    const r = diffInDiff(test, control, POST)!;
    expect(r.effect).toBeCloseTo(10, 10);
    expect(r.pre_periods).toBe(6);
    expect(r.post_periods).toBe(4);
    // contrafactual = pre_test + (post_control − pre_control) = 55 + (65 − 55) = 65
    expect(r.relative).toBeCloseTo(10 / 65, 10);
  });

  it("el periodo igual a postStart ya es 'después'", () => {
    const r = diffInDiff(series([10, 10, 20]), series([10, 10, 10]), week(2))!;
    expect(r.pre_periods).toBe(2);
    expect(r.effect).toBe(10);
  });

  it("null sin antes o sin después", () => {
    expect(diffInDiff(series([1, 2]), series([1, 2]), week(0))).toBeNull();
    expect(diffInDiff(series([1, 2]), series([1, 2]), week(5))).toBeNull();
  });
});

describe("averageSeries", () => {
  it("promedia solo los periodos comunes", () => {
    const r = averageSeries([series([10, 20, 30]), series([30, 40])]);
    expect(r).toEqual([
      { period: week(0), value: 20 },
      { period: week(1), value: 30 },
    ]);
  });
});

describe("placeboTest", () => {
  it("un efecto real grande supera todos los placebos", () => {
    const r = placeboTest(controls, POST, 0.1)!;
    expect(r.effects).toHaveLength(4);
    for (const e of r.effects) expect(Math.abs(e.relative!)).toBeLessThan(0.05);
    expect(r.placebo_confidence).toBe(1);
  });

  it("un efecto nulo no supera a los placebos", () => {
    expect(placeboTest(controls, POST, 0)!.placebo_confidence).toBe(0);
  });

  it("null con menos de 2 ciudades", () => {
    expect(placeboTest(controls.slice(0, 1), POST, 0.1)).toBeNull();
  });
});

describe("syntheticControl", () => {
  it("recupera una mezcla de ciudades y el efecto de +10", () => {
    const mix = A.map((a, i) => 0.5 * a + 0.3 * B[i] + 0.2 * C[i] + (i >= 6 ? 10 : 0));
    const r = syntheticControl(series(mix), controls, POST)!;
    expect(r.weights.reduce((s, w) => s + w.weight, 0)).toBeCloseTo(1, 8);
    for (const w of r.weights) expect(w.weight).toBeGreaterThanOrEqual(0);
    expect(r.pre_rmse).toBeLessThan(0.5);
    expect(r.effect).toBeCloseTo(10, 0);
  });

  it("null con menos de 3 ciudades o menos de 4 periodos antes", () => {
    expect(syntheticControl(series(A), controls.slice(0, 2), POST)).toBeNull();
    expect(syntheticControl(series(A), controls, week(3))).toBeNull();
  });
});

describe("analyzeGeo", () => {
  it("combina DiD, placebo y sintético", () => {
    const avg = A.map((a, i) => (a + B[i] + C[i] + D[i]) / 4);
    const test = series(avg.map((v, i) => v + (i >= 6 ? 10 : 0)));
    const r = analyzeGeo({ test, controls, postStart: POST });
    expect(r.did!.effect).toBeCloseTo(10, 8);
    expect(r.placebo!.placebo_confidence).toBe(1);
    expect(r.synthetic!.effect).toBeCloseTo(10, 0);
    expect(r.control_units).toBe(4);
    expect(r.warnings).toEqual([]);
  });

  it("advierte con pocas ciudades y pocos periodos antes", () => {
    const r = analyzeGeo({ test: series([10, 10, 20]), controls: controls.slice(0, 1), postStart: week(2) });
    expect(r.did!.effect).toBeCloseTo(10 - (A[2] - (A[0] + A[1]) / 2), 8);
    expect(r.placebo).toBeNull();
    expect(r.synthetic).toBeNull();
    expect(r.warnings).toContain("Con menos de 3 ciudades de control la lectura es débil.");
    expect(r.warnings.some((w) => w.startsWith("Hay menos de 4 periodos antes"))).toBe(true);
  });
});
