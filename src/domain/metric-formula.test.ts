import { describe, expect, it } from "vitest";
import { checkFormula, formulaChecks, formulaError, hasFormula, latestFormulaCheck, metricGaps } from "./metric-formula";

describe("formulaError", () => {
  const line = ["a", "b", "c"];
  it("sin fórmula no hay error", () => {
    expect(formulaError("c", null, null, line)).toBeNull();
  });
  it("numerador y denominador van juntos", () => {
    expect(formulaError("c", "a", null, line)?.field).toBe("denominator_id");
    expect(formulaError("c", null, "b", line)?.field).toBe("numerator_id");
  });
  it("distintos, no la misma métrica y de la misma línea", () => {
    expect(formulaError("c", "a", "a", line)?.message).toMatch(/distintos/);
    expect(formulaError("c", "c", "a", line)?.field).toBe("numerator_id");
    expect(formulaError("c", "a", "z", line)?.field).toBe("denominator_id");
    expect(formulaError("c", "a", "b", line)).toBeNull();
    expect(formulaError(null, "a", "b", line)).toBeNull();
  });
});

describe("checkFormula", () => {
  it("coherente dentro del 2 %", () => {
    const r = checkFormula({ value: 0.101, numerator: 10, denominator: 100, unit: null });
    expect(r?.expected).toBeCloseTo(0.1);
    expect(r?.coherent).toBe(true);
  });
  it("incoherente por encima del 2 %", () => {
    expect(checkFormula({ value: 0.11, numerator: 10, denominator: 100, unit: null })?.coherent).toBe(false);
  });
  it("con unidad % multiplica por 100", () => {
    const r = checkFormula({ value: 10, numerator: 10, denominator: 100, unit: "%" });
    expect(r?.expected).toBeCloseTo(10);
    expect(r?.coherent).toBe(true);
  });
  it("sin datos o denominador 0 → null", () => {
    expect(checkFormula({ value: 1, numerator: null, denominator: 3, unit: null })).toBeNull();
    expect(checkFormula({ value: 1, numerator: 3, denominator: 0, unit: null })).toBeNull();
    expect(checkFormula({ value: undefined, numerator: 3, denominator: 1, unit: null })).toBeNull();
  });
  it("esperado 0 solo es coherente si el valor es 0", () => {
    expect(checkFormula({ value: 0, numerator: 0, denominator: 5, unit: null })?.coherent).toBe(true);
    expect(checkFormula({ value: 1, numerator: 0, denominator: 5, unit: null })?.coherent).toBe(false);
  });
});

describe("formulaChecks", () => {
  it("calcula solo las métricas con fórmula y datos", () => {
    const metrics = [
      { id: "rate", line_id: "l", unit: "%", numerator_id: "sales", denominator_id: "visits" },
      { id: "sales", line_id: "l", unit: null, numerator_id: null, denominator_id: null },
      { id: "other", line_id: "l", unit: null, numerator_id: "sales", denominator_id: "missing" },
    ];
    const values = new Map([
      ["rate", 5],
      ["sales", 40],
      ["visits", 1000],
      ["other", 3],
    ]);
    const r = formulaChecks(metrics, values);
    expect([...r.keys()]).toEqual(["rate"]);
    expect(r.get("rate")?.coherent).toBe(false);
    expect(r.get("rate")?.expected).toBeCloseTo(4);
    expect(hasFormula(metrics[1])).toBe(false);
  });
});

describe("latestFormulaCheck", () => {
  const m = { id: "rate", line_id: "l", unit: "%", numerator_id: "s", denominator_id: "v" };
  it("usa la semana más reciente con los tres datos", () => {
    const values = [
      { metric_id: "rate", week_start: "2026-09-14", value: 5 },
      { metric_id: "s", week_start: "2026-09-14", value: 50 },
      { metric_id: "v", week_start: "2026-09-14", value: 1000 },
      { metric_id: "rate", week_start: "2026-09-21", value: 9 },
      { metric_id: "s", week_start: "2026-09-21", value: 50 },
    ];
    const r = latestFormulaCheck(m, values);
    expect(r?.week).toBe("2026-09-14");
    expect(r?.coherent).toBe(true);
  });
  it("sin fórmula o sin semana completa → null", () => {
    expect(latestFormulaCheck({ ...m, numerator_id: null }, [])).toBeNull();
    expect(latestFormulaCheck(m, [{ metric_id: "rate", week_start: "2026-09-14", value: 5 }])).toBeNull();
  });
});

describe("metricGaps", () => {
  it("marca lo que falta", () => {
    expect(metricGaps({ definition: null, source: " ", owner_id: null })).toEqual(["definition", "source", "owner"]);
    expect(metricGaps({ definition: "Altas netas", source: "CRM", owner_id: "u" })).toEqual([]);
  });
});
