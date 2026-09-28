import { describe, expect, it } from "vitest";
import { computeExperimentPower, powerCalcFor, powerShortfall, suggestedBaseline } from "./experiment-power";
import { computePower } from "./pilots/power";

describe("powerCalcFor", () => {
  it("la unidad % es tasa; lo demás, volumen", () => {
    expect(powerCalcFor("%")).toBe("rate");
    expect(powerCalcFor("altas")).toBe("volume");
    expect(powerCalcFor(null)).toBe("volume");
  });
});

describe("suggestedBaseline", () => {
  it("prefiere el último valor y si no, la línea base", () => {
    expect(suggestedBaseline({ latest_value: 12, baseline: 10 })).toBe(12);
    expect(suggestedBaseline({ latest_value: null, baseline: 10 })).toBe(10);
    expect(suggestedBaseline({})).toBeNull();
  });
});

describe("computeExperimentPower", () => {
  it("tasa: reparte el tráfico semanal entre las variantes, por día", () => {
    const r = computeExperimentPower({
      calc: "rate",
      inputs: { baseline: 5, weekly_traffic: 14_000 },
      expectedPct: 10,
      arms: 2,
      plannedDays: 28,
    })!;
    const same = computePower("rate", { baseline: 0.05, daily_volume_per_arm: 1000, planned_days: 28 }, 10, 2);
    expect(r.mde_pct).toBe(same.mde_pct);
    expect(r.days_needed).toBe(same.days_needed);
  });

  it("volumen: usa el valor semanal / 7 y la variación diaria", () => {
    const r = computeExperimentPower({ calc: "volume", inputs: { baseline: 700, daily_cv_pct: 20 }, expectedPct: 15, arms: 2, plannedDays: 28 })!;
    const same = computePower("sum", { baseline: 100, daily_cv: 0.2, planned_days: 28 }, 15, 2);
    expect(r.mde_pct).toBe(same.mde_pct);
    expect(r.warnings.some((w) => /piloto/.test(w))).toBe(false);
  });

  it("sin variación diaria asume 30 % y lo dice", () => {
    const r = computeExperimentPower({ calc: "volume", inputs: { baseline: 700 }, expectedPct: 10, arms: 2, plannedDays: 14 })!;
    expect(r.warnings.join(" ")).toMatch(/30 %/);
  });

  it("habla de ejercicio y no de piloto", () => {
    const r = computeExperimentPower({ calc: "rate", inputs: { baseline: 5, weekly_traffic: 1000 }, expectedPct: 10, arms: 2, plannedDays: null })!;
    expect(r.warnings.join(" ")).toMatch(/el ejercicio/);
  });

  it("sin datos no hay nada que mostrar", () => {
    expect(computeExperimentPower({ calc: "rate", inputs: null, expectedPct: 10, arms: 2, plannedDays: null })).toBeNull();
  });
});

describe("powerShortfall", () => {
  it("avisa cuando el MDE supera el efecto esperado", () => {
    expect(powerShortfall({ mde_pct: 18, days_needed: 60 }, 10)).toMatch(/18 %.*10 %.*60 días/);
    expect(powerShortfall({ mde_pct: 8, days_needed: 20 }, 10)).toBeNull();
    expect(powerShortfall({ mde_pct: 8, days_needed: 20 }, -12)).toBeNull();
    expect(powerShortfall(null, 10)).toBeNull();
    expect(powerShortfall({ mde_pct: 18, days_needed: null }, null)).toBeNull();
  });
});
