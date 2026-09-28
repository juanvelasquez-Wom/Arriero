import { describe, expect, it } from "vitest";
import { funnelDropOff, isRateUnit } from "./funnel";

const stages = [
  { id: "s1", name: "Adquisición", metric_id: "m1" },
  { id: "s2", name: "Activación", metric_id: "m2" },
  { id: "s3", name: "Conversión", metric_id: "m3" },
];
const metrics = [
  { id: "m1", name: "Visitas", unit: "sesiones" },
  { id: "m2", name: "Carritos", unit: "unidades" },
  { id: "m3", name: "Ventas", unit: "ventas" },
];
const W = "2026-09-21";
const P = "2026-09-14";

function v(metric_id: string, week_start: string, value: number) {
  return { metric_id, week_start, value };
}

describe("funnelDropOff", () => {
  it("sin etapas / sin métricas / sin valores", () => {
    expect(funnelDropOff({ stages: [], metrics, values: [] }).status).toBe("no_stages");
    const noMetric = funnelDropOff({ stages: stages.map((s) => ({ ...s, metric_id: null })), metrics, values: [] });
    expect(noMetric.status).toBe("no_metrics");
    expect(noMetric.withoutMetric).toBe(3);
    expect(funnelDropOff({ stages, metrics, values: [] }).status).toBe("no_values");
  });

  it("calcula conversión entre etapas y marca la mayor caída", () => {
    const r = funnelDropOff({
      stages,
      metrics,
      values: [v("m1", W, 1000), v("m2", W, 500), v("m3", W, 50), v("m1", P, 800), v("m2", P, 400), v("m3", P, 60)],
    });
    expect(r.status).toBe("ok");
    expect(r.week).toBe(W);
    expect(r.stages[0].conversion).toBeNull();
    expect(r.stages[1].conversion).toBeCloseTo(0.5);
    expect(r.stages[2].conversion).toBeCloseTo(0.1);
    expect(r.stages[2].previousConversion).toBeCloseTo(0.15);
    expect(r.stages[2].conversionChange).toBeCloseTo(-0.05);
    expect(r.biggestDropStageId).toBe("s3");
    expect(r.stages[2].biggestDrop).toBe(true);
    expect(r.stages[0].changeVsPreviousWeek).toBeCloseTo(0.25);
  });

  it("promedio de 4 semanas anteriores con las que tengan dato", () => {
    const r = funnelDropOff({
      stages: [stages[0]],
      metrics,
      values: [v("m1", W, 120), v("m1", P, 100), v("m1", "2026-09-07", 80), v("m1", "2026-08-17", 999)],
    });
    // Semanas previas: 14 sep (100), 7 sep (80), 31 ago (sin dato), 24 ago (sin dato). 17 ago queda fuera.
    expect(r.stages[0].average4).toBeCloseTo(90);
    expect(r.stages[0].changeVsAverage4).toBeCloseTo(30 / 90);
  });

  it("no divide cuando una etapa se mide en %", () => {
    const r = funnelDropOff({
      stages,
      metrics: [metrics[0], { id: "m2", name: "Tasa", unit: "%" }, metrics[2]],
      values: [v("m1", W, 1000), v("m2", W, 3), v("m3", W, 30)],
    });
    expect(r.stages[1].conversion).toBeNull();
    expect(r.stages[2].conversion).toBeNull();
    expect(r.rateSteps).toBe(2);
    expect(r.biggestDropStageId).toBeNull();
  });

  it("cuenta etapas sin métrica y no calcula el paso alrededor", () => {
    const r = funnelDropOff({
      stages: [stages[0], { ...stages[1], metric_id: null }, stages[2]],
      metrics,
      values: [v("m1", W, 1000), v("m3", W, 30)],
    });
    expect(r.withoutMetric).toBe(1);
    expect(r.stages[2].conversion).toBeNull();
  });

  it("isRateUnit", () => {
    expect(isRateUnit("%")).toBe(true);
    expect(isRateUnit(" % ")).toBe(true);
    expect(isRateUnit("ventas")).toBe(false);
    expect(isRateUnit(null)).toBe(false);
  });
});
