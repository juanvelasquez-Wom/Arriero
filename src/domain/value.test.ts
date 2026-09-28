import { describe, expect, it } from "vitest";
import {
  conservativeLift,
  estimateConservativeValue,
  estimateValue,
  formatCop,
  formatValueRange,
  weeklyVolume,
  WEEKS_PER_MONTH,
} from "./value";

const metric = {
  unit: "altas",
  direction: "up" as const,
  baseline: 1000,
  latest_value: 1200,
  unit_value: 250_000,
};

describe("weeklyVolume", () => {
  it("usa el último valor y si no, la línea base", () => {
    expect(weeklyVolume(metric)).toBe(1200);
    expect(weeklyVolume({ ...metric, latest_value: null })).toBe(1000);
    expect(weeklyVolume({ ...metric, latest_value: null, baseline: null })).toBeNull();
  });
  it("una tasa no es un volumen", () => {
    expect(weeklyVolume({ ...metric, unit: "%" })).toBeNull();
  });
});

describe("estimateValue", () => {
  it("mejora × volumen semanal × valor por unidad", () => {
    const { value, missing } = estimateValue({ lift: 0.1, metric });
    expect(missing).toBeNull();
    expect(value!.extraUnitsPerWeek).toBeCloseTo(120, 6);
    expect(value!.weekly).toBeCloseTo(30_000_000, 2);
    expect(value!.monthly).toBeCloseTo(30_000_000 * WEEKS_PER_MONTH, 2);
  });
  it("si menos es mejor, bajar cuenta a favor", () => {
    const { value } = estimateValue({ lift: -0.1, metric: { ...metric, direction: "down" } });
    expect(value!.weekly).toBeGreaterThan(0);
  });
  it("dice qué falta", () => {
    expect(estimateValue({ lift: null, metric }).missing).toBe("lift");
    expect(estimateValue({ lift: 0.1, metric: null }).missing).toBe("volume");
    expect(estimateValue({ lift: 0.1, metric: { ...metric, unit_value: null } }).missing).toBe("unit_value");
    expect(estimateValue({ lift: 0.1, metric: { ...metric, unit_value: null } }).value).toBeNull();
  });
});

describe("valor conservador", () => {
  it("usa el extremo menos favorable del intervalo según la dirección", () => {
    expect(conservativeLift({ low: 0.05, high: 0.2 }, "up")).toBe(0.05);
    expect(conservativeLift({ low: -0.2, high: -0.05 }, "down")).toBe(-0.05);
    expect(conservativeLift(null, "up")).toBeNull();
  });
  it("calcula el piso con el límite del intervalo", () => {
    const v = estimateConservativeValue({ interval: { low: 0.05, high: 0.2 }, metric })!;
    expect(v.weekly).toBeCloseTo(0.05 * 1200 * 250_000, 2);
  });
  it("si el intervalo cruza el cero, el piso es $0 y no negativo", () => {
    const v = estimateConservativeValue({ interval: { low: -0.03, high: 0.2 }, metric })!;
    expect(v.weekly).toBe(0);
    expect(v.monthly).toBe(0);
  });
  it("sin intervalo o sin valor por unidad no hay piso", () => {
    expect(estimateConservativeValue({ interval: null, metric })).toBeNull();
    expect(estimateConservativeValue({ interval: { low: 0.1, high: 0.2 }, metric: { ...metric, unit_value: null } })).toBeNull();
  });
  it("formatea el rango con el techo optimista", () => {
    expect(formatValueRange(2_000_000, 8_000_000, "al mes")).toBe("entre $ 2 M y $ 8 M al mes (techo optimista)");
    expect(formatValueRange(null, 8_000_000)).toBe("≈ $ 8 M (techo optimista)");
    expect(formatValueRange(null, null)).toBe("—");
  });
});

describe("formatCop", () => {
  it("abrevia millones y respeta el signo", () => {
    expect(formatCop(12_500_000)).toBe("$ 12,5 M");
    expect(formatCop(-3_000_000)).toBe("−$ 3 M");
    expect(formatCop(850_000)).toMatch(/850\.000/);
    expect(formatCop(null)).toBe("—");
  });
});
