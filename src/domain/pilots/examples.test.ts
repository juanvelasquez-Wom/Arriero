import { describe, expect, it } from "vitest";
import { analyzePilot } from "./analysis";
import { baseMetricsFor } from "./data-import";
import { buildExamplePilots, type ExamplePilot } from "./examples";
import { overlapsFor } from "./overlap";
import type { PilotMetricDef, PilotSummary } from "./types";

// Mismo catálogo que siembra la migración (los nombres hacen de id).
const sum = (name: string, over: Partial<PilotMetricDef> = {}): PilotMetricDef => ({
  id: name,
  name,
  unit: "count",
  direction: "up",
  scope: "business",
  calc: "sum",
  numerator_id: null,
  denominator_id: null,
  is_spend: false,
  ...over,
});
const CATALOG: PilotMetricDef[] = [
  sum("Inversión", { unit: "cop", direction: "down", scope: "platform", is_spend: true }),
  sum("Conversaciones iniciadas", { scope: "platform" }),
  sum("Ventas"),
  sum("Tasa de venta por conversación", { calc: "rate", unit: "percent", numerator_id: "Ventas", denominator_id: "Conversaciones iniciadas" }),
  sum("Costo por conversación", { calc: "cost_per", unit: "cop", direction: "down", scope: "platform", numerator_id: "Inversión", denominator_id: "Conversaciones iniciadas" }),
  sum("Costo por venta (CPA)", { calc: "cost_per", unit: "cop", direction: "down", numerator_id: "Inversión", denominator_id: "Ventas" }),
];

function analyze(p: ExamplePilot) {
  return analyzePilot({
    testType: p.test_type,
    metrics: CATALOG,
    primaryMetricId: p.primary_metric,
    guardrails: p.guardrails.map((g, i) => ({ id: `g${i}`, metric_id: g.metric, limit_pct: g.limit_pct })),
    arms: p.arms.map((a) => ({ id: a.key, name: a.name, is_control: a.is_control, split_pct: a.split_pct, cities: a.cities })),
    measurements: p.values.map((v) => ({ arm_id: v.arm, metric_id: v.metric, unit_label: v.unit_label, period_start: v.period_start, value: v.value })),
    postStart: p.actual_start,
    postEnd: p.actual_end ?? "2026-09-27",
    plannedDays: p.power_inputs.planned_days,
    rules: p.decision_rules,
  });
}

describe("pilotos de ejemplo", () => {
  const today = "2026-09-27";
  const [ugc, geo, landing] = buildExamplePilots(today);

  it("son tres, con los diseños pedidos y datos solo de métricas que se cargan", () => {
    expect([ugc.test_type, geo.test_type, landing.test_type]).toEqual(["ab_creative", "geo", "ab_platform"]);
    for (const p of [ugc, geo, landing]) {
      const loadable = new Set(baseMetricsFor([p.primary_metric, ...p.guardrails.map((g) => g.metric)], CATALOG).map((m) => m.id));
      expect(p.values.every((v) => loadable.has(v.metric) && v.value >= 0)).toBe(true);
      expect(p.arms.filter((a) => a.is_control)).toHaveLength(1);
    }
  });

  it("son reproducibles", () => {
    expect(buildExamplePilots(today)[0].values.slice(0, 6)).toEqual(ugc.values.slice(0, 6));
  });

  it("el video UGC gana y Arriero sugiere escalar", () => {
    const a = analyze(ugc);
    expect(a.ready).toBe(true);
    expect(a.primary!.comparisons[0].probabilityBetter).toBeGreaterThan(0.9);
    expect(a.suggestion.decision).toBe("scale");
  });

  it("el geo lee un efecto positivo con placebo", () => {
    const a = analyze(geo);
    expect(a.ready).toBe(true);
    expect(a.evidence).toBe("placebo");
    expect(a.geo!.did!.relative).toBeGreaterThan(0.05);
  });

  it("la landing baja el costo por venta", () => {
    const a = analyze(landing);
    expect(a.ready).toBe(true);
    expect(a.primary!.comparisons[0].liftPct!).toBeLessThan(0);
  });

  it("el geo y la landing se cruzan (misma cuenta, fechas en común)", () => {
    const summary = (p: ExamplePilot, id: string): PilotSummary => ({
      id,
      title: p.title,
      status: p.status,
      test_type: p.test_type,
      start: p.actual_start ?? p.planned_start,
      end: p.actual_end ?? p.planned_end,
      media: p.media.map((m) => ({ media_id: m.media, media_name: m.media, account: m.account, campaign: m.campaign, audience: m.audience, destination: m.destination, cities: m.cities })),
      arm_cities: p.arms.flatMap((a) => a.cities),
    });
    const all = [summary(ugc, "1"), summary(geo, "2"), summary(landing, "3")];
    expect(overlapsFor(all[1], all).map((o) => o.otherId)).toEqual(["3"]);
  });
});
