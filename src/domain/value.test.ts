import { describe, expect, it } from "vitest";
import { estimateValue, formatCop, weeklyVolume, WEEKS_PER_MONTH } from "./value";

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

describe("formatCop", () => {
  it("abrevia millones y respeta el signo", () => {
    expect(formatCop(12_500_000)).toBe("$ 12,5 M");
    expect(formatCop(-3_000_000)).toBe("−$ 3 M");
    expect(formatCop(850_000)).toMatch(/850\.000/);
    expect(formatCop(null)).toBe("—");
  });
});
