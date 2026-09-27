import { describe, expect, it } from "vitest";
import type { PilotAnalysis } from "./analysis";
import {
  buildAnalysisInput,
  executedSpend,
  formatPilotValue,
  winnerArmId,
  metricsForReading,
  metricValue,
  pilotGranularity,
  primarySeries,
  resultSentence,
  rulesInWords,
  type ReadingMeasurement,
  type ReadingSource,
} from "./reading";
import { DEFAULT_DECISION_RULES, type PilotMetricDef } from "./types";

const metric = (m: Partial<PilotMetricDef> & Pick<PilotMetricDef, "id" | "calc">): PilotMetricDef => ({
  name: m.id,
  unit: "count",
  direction: "up",
  scope: "platform",
  numerator_id: null,
  denominator_id: null,
  is_spend: false,
  ...m,
});
const CATALOG: PilotMetricDef[] = [
  metric({ id: "conv", calc: "sum" }),
  metric({ id: "sales", calc: "sum" }),
  metric({ id: "spend", calc: "sum", unit: "cop", is_spend: true, direction: "down" }),
  metric({ id: "other", calc: "sum" }),
  metric({ id: "cr", name: "Tasa de conversión", calc: "rate", unit: "percent", numerator_id: "sales", denominator_id: "conv" }),
  metric({ id: "cpa", name: "Costo por venta", calc: "cost_per", unit: "cop", direction: "down", numerator_id: "spend", denominator_id: "sales" }),
];

const m = (arm_id: string, metric_id: string, period_start: string, value: number, granularity: "day" | "week" = "day"): ReadingMeasurement => ({
  arm_id,
  metric_id,
  unit_label: "",
  period_start,
  value,
  granularity,
});

const source = (over: Partial<ReadingSource["pilot"]> = {}, rest: Partial<Omit<ReadingSource, "pilot">> = {}): ReadingSource => ({
  pilot: {
    test_type: "ab_creative",
    primary_metric_id: "cr",
    design_config: { granularity: "day" },
    power_inputs: { planned_days: 14, daily_volume_per_arm: 100 },
    decision_rules: null,
    planned_start: "2026-10-01",
    planned_end: "2026-10-14",
    actual_start: null,
    actual_end: null,
    ...over,
  },
  arms: [
    { id: "c", name: "Control", is_control: true, split_pct: 50, cities: [] },
    { id: "v", name: "Video UGC", is_control: false, split_pct: 50, cities: [] },
  ],
  guardrails: [{ id: "g1", metric_id: "cpa", limit_pct: 15 }],
  measurements: [],
  ...rest,
});

describe("pilotGranularity", () => {
  it("usa día por defecto", () => {
    expect(pilotGranularity({ design_config: null })).toBe("day");
    expect(pilotGranularity({ design_config: { granularity: "week" } })).toBe("week");
  });
});

describe("metricsForReading", () => {
  it("incluye principal, guardrails, sus bases y la inversión", () => {
    const ids = metricsForReading(["cr", "cpa"], CATALOG).map((x) => x.id).sort();
    expect(ids).toEqual(["conv", "cpa", "cr", "sales", "spend"]);
  });
});

describe("buildAnalysisInput", () => {
  it("devuelve null sin tipo, sin métrica principal o sin grupos", () => {
    expect(buildAnalysisInput(source({ test_type: null }), CATALOG)).toBeNull();
    expect(buildAnalysisInput(source({ primary_metric_id: null }), CATALOG)).toBeNull();
    expect(buildAnalysisInput(source({ primary_metric_id: "nope" }), CATALOG)).toBeNull();
    expect(buildAnalysisInput(source({}, { arms: [] }), CATALOG)).toBeNull();
  });

  it("mapea fechas, reglas, volumen planeado y filtra por granularidad", () => {
    const input = buildAnalysisInput(
      source({}, { measurements: [m("c", "conv", "2026-10-01", 10), m("c", "conv", "2026-09-28", 70, "week")] }),
      CATALOG,
      "2026-10-05",
    )!;
    expect(input.postStart).toBe("2026-10-01");
    expect(input.postEnd).toBe("2026-10-14");
    expect(input.plannedDays).toBe(14);
    expect(input.plannedVolumePerArm).toBe(1400);
    expect(input.rules).toEqual(DEFAULT_DECISION_RULES);
    expect(input.measurements).toHaveLength(1);
    expect(input.guardrails).toEqual([{ id: "g1", metric_id: "cpa", limit_pct: 15 }]);
  });

  it("prefiere las fechas reales y usa hoy si no hay fin", () => {
    const input = buildAnalysisInput(source({ actual_start: "2026-10-03", planned_end: null }), CATALOG, "2026-10-09")!;
    expect(input.postStart).toBe("2026-10-03");
    expect(input.postEnd).toBe("2026-10-09");
    const input2 = buildAnalysisInput(source({ actual_end: "2026-10-12" }), CATALOG)!;
    expect(input2.postEnd).toBe("2026-10-12");
  });

  it("sin volumen diario no hay volumen planeado", () => {
    const input = buildAnalysisInput(source({ power_inputs: { planned_days: 10 } }), CATALOG)!;
    expect(input.plannedVolumePerArm).toBeNull();
    expect(buildAnalysisInput(source({ power_inputs: null }), CATALOG)!.plannedDays).toBeNull();
  });
});

describe("metricValue y primarySeries", () => {
  it("calcula suma, tasa y costo por", () => {
    const vs = [m("c", "conv", "d", 100), m("c", "sales", "d", 5), m("c", "spend", "d", 1000)];
    expect(metricValue(CATALOG[0], vs)).toBe(100);
    expect(metricValue(CATALOG[4], vs)).toBe(0.05);
    expect(metricValue(CATALOG[5], vs)).toBe(200);
    expect(metricValue(CATALOG[3], vs)).toBeNull();
  });

  it("arma la serie por periodo y grupo hasta el fin", () => {
    const input = buildAnalysisInput(
      source(
        { planned_end: "2026-10-02" },
        {
          measurements: [
            m("c", "conv", "2026-10-01", 100),
            m("c", "sales", "2026-10-01", 10),
            m("v", "conv", "2026-10-02", 50),
            m("v", "sales", "2026-10-02", 10),
            m("v", "conv", "2026-10-03", 50),
          ],
        },
      ),
      CATALOG,
    )!;
    expect(primarySeries(input)).toEqual([
      { period: "2026-10-01", values: { c: 0.1, v: null } },
      { period: "2026-10-02", values: { c: null, v: 0.2 } },
    ]);
  });
});

describe("executedSpend", () => {
  const ms = [m("c", "spend", "2026-09-20", 500), m("c", "spend", "2026-10-01", 1000), m("v", "spend", "2026-10-02", 2000), m("v", "spend", "2026-10-05", 9, "week")];
  it("suma la inversión desde el inicio real", () => {
    expect(executedSpend(ms, CATALOG, "2026-10-01", "day")).toBe(3000);
    expect(executedSpend(ms, CATALOG, null, "day")).toBe(3500);
  });
  it("null sin métrica de inversión o sin datos", () => {
    expect(executedSpend(ms, CATALOG.filter((x) => !x.is_spend), null)).toBeNull();
    expect(executedSpend([], CATALOG, null)).toBeNull();
  });
});

const analysis = (over: Partial<PilotAnalysis["primary"] & object> = {}, ready = true): PilotAnalysis => ({
  evidence: "probabilistic",
  primary: {
    metricId: "sales",
    perArm: [],
    comparisons: [{ armId: "v", liftPct: 18, lowPct: 4.5, highPct: 32, probabilityBetter: 0.96 }],
    probabilityBest: null,
    bestArmId: "v",
    ...over,
  },
  geo: null,
  holdout: null,
  guardrails: [],
  suggestion: { decision: "scale", reasons: [] },
  warnings: [],
  ready,
});

describe("resultSentence", () => {
  const arms = [
    { id: "c", name: "Control" },
    { id: "v", name: "Video UGC" },
  ];
  it("escribe el resultado de un A/B en palabras simples", () => {
    expect(resultSentence({ analysis: analysis(), testType: "ab_creative", metric: { name: "Ventas", direction: "up" }, arms })).toBe(
      "Con la variante Video UGC, Ventas quedó 18 % por encima del control. Hay 96 % de probabilidad de que sea mejor. El rango probable (90 %) va de +4,5 % a +32 %.",
    );
  });

  it("aclara cuando menos es mejor", () => {
    const text = resultSentence({
      analysis: analysis({ comparisons: [{ armId: "v", liftPct: -12, lowPct: null, highPct: null, probabilityBetter: 0.999 }] }),
      testType: "ab_platform",
      metric: { name: "Costo por venta", direction: "down" },
      arms,
    });
    expect(text).toBe("Con la variante Video UGC, Costo por venta quedó 12 % por debajo del control (aquí menos es mejor). Hay más de 99 % de probabilidad de que sea mejor.");
  });

  it("habla de holdout y geo, y de evidencia direccional sin probabilidad", () => {
    expect(resultSentence({ analysis: analysis(), testType: "holdout", metric: { name: "Ventas", direction: "up" }, arms })).toMatch(
      /^Con la campaña, Ventas quedó 18 % por encima del grupo sin anuncios/,
    );
    const geo = resultSentence({
      analysis: analysis({ comparisons: [{ armId: "v", liftPct: 7, lowPct: null, highPct: null, probabilityBetter: null }] }),
      testType: "geo",
      metric: { name: "Ventas", direction: "up" },
      arms,
    });
    expect(geo).toBe("En las ciudades de prueba, Ventas quedó 7 % por encima de las de control. No hay una probabilidad calculada: tómelo como evidencia direccional.");
  });

  it("sin datos lo dice", () => {
    expect(resultSentence({ analysis: null, testType: "ab_creative", metric: null, arms })).toBe("Todavía no hay datos suficientes para leer el resultado.");
    expect(resultSentence({ analysis: analysis({}, false), testType: "ab_creative", metric: { name: "Ventas", direction: "up" }, arms })).toBe(
      "Todavía no hay datos suficientes para leer el resultado.",
    );
  });
});

describe("rulesInWords", () => {
  it("explica las reglas por defecto", () => {
    const words = rulesInWords(DEFAULT_DECISION_RULES);
    expect(words[0]).toBe("Escalar si la probabilidad de ganar es de al menos 90 % y la mejora es de al menos 0 %.");
    expect(words[1]).toBe("Apagar si la probabilidad de ganar es de 20 % o menos.");
    expect(words[3]).toBe("Si un guardrail se rompe, no se escala.");
  });
});

describe("formatPilotValue", () => {
  it("formatea según el tipo de métrica", () => {
    expect(formatPilotValue({ calc: "rate", unit: "percent" }, 0.125)).toBe("12,5 %");
    expect(formatPilotValue({ calc: "cost_per", unit: "cop" }, 850000)).toMatch(/850\.000/);
    expect(formatPilotValue({ calc: "sum", unit: "count" }, 1234)).toBe("1.234");
    expect(formatPilotValue({ calc: "sum", unit: "count" }, null)).toBe("—");
  });
});

describe("winnerArmId", () => {
  it("solo con probabilidad confiable o veredicto ganador", () => {
    expect(winnerArmId(analysis())).toBe("v");
    const unsure = analysis({ comparisons: [{ armId: "v", liftPct: 5, lowPct: null, highPct: null, probabilityBetter: 0.8 }] });
    expect(winnerArmId(unsure)).toBeNull();
    expect(winnerArmId(unsure, "winner")).toBe("v");
    expect(winnerArmId(analysis({}, false))).toBeNull();
    expect(winnerArmId(null)).toBeNull();
  });
});
