import { describe, expect, it } from "vitest";
import { analyzePilot, WEAK_EVIDENCE_LABEL, type PilotAnalysisInput } from "./analysis";
import { DEFAULT_DECISION_RULES, type Measurement, type PilotArm, type PilotMetricDef } from "./types";

// Catálogo mínimo: conversaciones (base), ventas, inversión, tasa de conversión,
// costo por venta y tasa de rebote (guardrail, menos es mejor).
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
const METRICS: PilotMetricDef[] = [
  metric({ id: "conv", calc: "sum" }),
  metric({ id: "sales", calc: "sum" }),
  metric({ id: "spend", calc: "sum", unit: "cop", is_spend: true, direction: "down" }),
  metric({ id: "bounces", calc: "sum" }),
  metric({ id: "cr", name: "Tasa de conversión", calc: "rate", unit: "percent", numerator_id: "sales", denominator_id: "conv" }),
  metric({ id: "cpa", name: "Costo por venta", calc: "cost_per", unit: "cop", direction: "down", numerator_id: "spend", denominator_id: "sales" }),
  metric({ id: "bounce", name: "Tasa de rebote", calc: "rate", direction: "down", numerator_id: "bounces", denominator_id: "conv" }),
];

const arm = (id: string, is_control = false, cities: string[] = []): PilotArm => ({ id, name: id.toUpperCase(), is_control, split_pct: null, cities });

function day(i: number): string {
  return new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
}
function week(i: number): string {
  return new Date(Date.UTC(2026, 5, 1 + 7 * i)).toISOString().slice(0, 10);
}

/** Reparte totales en `days` días iguales. */
function daily(armId: string, metricId: string, total: number, days: number, start = 0, unit = ""): Measurement[] {
  return Array.from({ length: days }, (_, i) => ({
    arm_id: armId,
    metric_id: metricId,
    unit_label: unit,
    period_start: day(start + i),
    value: total / days,
  }));
}

const base = (over: Partial<PilotAnalysisInput>): PilotAnalysisInput => ({
  testType: "ab_creative",
  metrics: METRICS,
  primaryMetricId: "cr",
  guardrails: [],
  arms: [arm("c", true), arm("v")],
  measurements: [],
  postStart: day(0),
  postEnd: day(13),
  plannedDays: 14,
  rules: DEFAULT_DECISION_RULES,
  ...over,
});

describe("analyzePilot · A/B", () => {
  it("camino feliz: la variante gana y se sugiere escalar", () => {
    const r = analyzePilot(
      base({
        measurements: [
          ...daily("c", "conv", 2000, 14),
          ...daily("c", "sales", 200, 14),
          ...daily("v", "conv", 2000, 14),
          ...daily("v", "sales", 280, 14),
          // Un día antes del inicio: no cuenta en A/B.
          { arm_id: "v", metric_id: "sales", unit_label: "", period_start: "2026-08-31", value: 9999 },
        ],
      }),
    );
    expect(r.ready).toBe(true);
    expect(r.evidence).toBe("probabilistic");
    expect(r.primary!.perArm.map((a) => a.armId)).toEqual(["c", "v"]);
    expect(r.primary!.perArm[0].value).toBeCloseTo(0.1, 10);
    expect(r.primary!.perArm[1].value).toBeCloseTo(0.14, 10);
    const cmp = r.primary!.comparisons[0];
    expect(cmp.armId).toBe("v");
    expect(cmp.liftPct!).toBeGreaterThan(30);
    expect(cmp.liftPct!).toBeLessThan(50);
    expect(cmp.probabilityBetter!).toBeGreaterThan(0.99);
    expect(r.primary!.bestArmId).toBe("v");
    expect(r.suggestion.decision).toBe("scale");
    expect(r.warnings).toEqual([]);
  });

  it("tres grupos: una comparación por variante y P(mejor) que suma 1", () => {
    const r = analyzePilot(
      base({
        arms: [arm("c", true), arm("a"), arm("b")],
        measurements: [
          ...daily("c", "conv", 1000, 14),
          ...daily("c", "sales", 100, 14),
          ...daily("a", "conv", 1000, 14),
          ...daily("a", "sales", 105, 14),
          ...daily("b", "conv", 1000, 14),
          ...daily("b", "sales", 140, 14),
        ],
      }),
    );
    expect(r.primary!.comparisons.map((c) => c.armId)).toEqual(["a", "b"]);
    expect(r.primary!.bestArmId).toBe("b");
    const total = Object.values(r.primary!.probabilityBest!).reduce((s, x) => s + x, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("costo por venta (bootstrap, menos es mejor)", () => {
    const wobble = (i: number) => (i % 2 ? 1 : -1);
    const ms: Measurement[] = [];
    for (let i = 0; i < 14; i++) {
      ms.push({ arm_id: "c", metric_id: "spend", unit_label: "", period_start: day(i), value: 100_000 });
      ms.push({ arm_id: "c", metric_id: "sales", unit_label: "", period_start: day(i), value: 5 + wobble(i) * 0.5 });
      ms.push({ arm_id: "v", metric_id: "spend", unit_label: "", period_start: day(i), value: 100_000 });
      ms.push({ arm_id: "v", metric_id: "sales", unit_label: "", period_start: day(i), value: 6.25 + wobble(i) * 0.5 });
    }
    const r = analyzePilot(base({ primaryMetricId: "cpa", measurements: ms }));
    expect(r.primary!.perArm[0].value).toBeCloseTo(20000, 6);
    expect(r.primary!.comparisons[0].liftPct).toBe(-20);
    expect(r.primary!.comparisons[0].probabilityBetter!).toBeGreaterThan(0.99);
    expect(r.suggestion.decision).toBe("scale");
  });

  it("un guardrail roto bloquea escalar", () => {
    const r = analyzePilot(
      base({
        guardrails: [{ id: "g1", metric_id: "bounce", limit_pct: 15 }],
        measurements: [
          ...daily("c", "conv", 2000, 14),
          ...daily("c", "sales", 200, 14),
          ...daily("c", "bounces", 400, 14),
          ...daily("v", "conv", 2000, 14),
          ...daily("v", "sales", 280, 14),
          ...daily("v", "bounces", 600, 14), // +50 % de rebote
        ],
      }),
    );
    expect(r.guardrails[0].changePct).toBe(50);
    expect(r.guardrails[0].broken).toBe(true);
    expect(r.suggestion.decision).toBe("adjust");
    expect(r.warnings.some((w) => w.includes("Tasa de rebote"))).toBe(true);
  });

  it("advierte días y volumen por debajo de lo planeado", () => {
    const r = analyzePilot(
      base({
        postEnd: null,
        plannedDays: 28,
        plannedVolumePerArm: 4000,
        measurements: [...daily("c", "conv", 2000, 14), ...daily("c", "sales", 200, 14), ...daily("v", "conv", 2000, 14), ...daily("v", "sales", 220, 14)],
      }),
    );
    expect(r.warnings.some((w) => w.includes("14 de 28 días"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("2000 de 4000"))).toBe(true);
  });

  it("sin datos: ready = false y sin decisión", () => {
    const r = analyzePilot(base({ measurements: [] }));
    expect(r.ready).toBe(false);
    expect(r.primary).toBeNull();
    expect(r.suggestion.decision).toBeNull();
    expect(r.warnings).toContain("Todavía no hay datos cargados para la métrica principal.");
  });

  it("sin control único: ready = false", () => {
    const r = analyzePilot(base({ arms: [arm("a"), arm("b")] }));
    expect(r.ready).toBe(false);
  });
});

describe("analyzePilot · holdout", () => {
  it("incremento, costo por incremental y probabilidad", () => {
    const r = analyzePilot(
      base({
        testType: "holdout",
        arms: [arm("h", true), arm("e")],
        measurements: [
          ...daily("e", "conv", 20000, 14),
          ...daily("e", "sales", 600, 14),
          ...daily("e", "spend", 10_000_000, 14),
          ...daily("h", "conv", 5000, 14),
          ...daily("h", "sales", 100, 14),
        ],
      }),
    );
    expect(r.ready).toBe(true);
    expect(r.holdout!.incremental_conversions).toBeCloseTo(200, 6);
    expect(r.holdout!.cost_per_incremental).toBeCloseTo(50_000, 2);
    expect(r.primary!.comparisons[0].liftPct).toBe(50);
    expect(r.primary!.comparisons[0].probabilityBetter!).toBeGreaterThan(0.99);
    expect(r.suggestion.decision).toBe("scale");
  });

  it("exige una métrica de tasa", () => {
    const r = analyzePilot(base({ testType: "holdout", primaryMetricId: "sales", arms: [arm("h", true), arm("e")], measurements: daily("e", "sales", 10, 14) }));
    expect(r.ready).toBe(false);
    expect(r.warnings).toContain("El holdout necesita una métrica principal de tipo tasa.");
  });
});

// Serie semanal por ciudad de la métrica `sales` (sum): 6 semanas antes y 4 después.
const wiggle = [0, 1.5, -1, 0.5, -0.5, 1, -1.5, 0.5, 1, -0.5];
function cityWeeks(armId: string, city: string, level: number, lift = 0, shift = 1): Measurement[] {
  return wiggle.map((w, i) => ({
    arm_id: armId,
    metric_id: "sales",
    unit_label: city,
    period_start: week(i),
    value: level + 2 * i + ((w * shift) % 2) + (i >= 6 ? lift : 0),
  }));
}

describe("analyzePilot · geo y antes / después", () => {
  const geoArms = [arm("ctl", true, ["Cali", "Medellín", "Barranquilla", "Bucaramanga"]), arm("tst", false, ["Bogotá"])];
  const controlCities = [
    ...cityWeeks("ctl", "Cali", 100, 0, 1),
    ...cityWeeks("ctl", "Medellín", 150, 0, -1),
    ...cityWeeks("ctl", "Barranquilla", 80, 0, 0.7),
    ...cityWeeks("ctl", "Bucaramanga", 120, 0, -0.3),
  ];

  it("efecto conocido de +10 por semana con placebo", () => {
    const r = analyzePilot(
      base({
        testType: "geo",
        primaryMetricId: "sales",
        arms: geoArms,
        postStart: week(6),
        postEnd: week(9),
        plannedDays: 28,
        measurements: [...controlCities, ...cityWeeks("tst", "Bogotá", 112.5, 10, 0)],
      }),
    );
    expect(r.ready).toBe(true);
    expect(r.evidence).toBe("placebo");
    expect(r.geo!.did!.effect).toBeCloseTo(10, 0);
    expect(r.geo!.placebo!.placebo_confidence).toBe(1);
    expect(r.geo!.control_units).toBe(4);
    expect(r.primary!.comparisons[0].liftPct!).toBeGreaterThan(5);
    expect(r.primary!.comparisons[0].probabilityBetter).toBe(1);
    expect(r.suggestion.decision).toBe("scale");
  });

  it("antes / después: evidencia débil, con etiqueta y razón de cuidado", () => {
    const r = analyzePilot(
      base({
        testType: "pre_post",
        primaryMetricId: "sales",
        arms: geoArms,
        postStart: week(6),
        postEnd: week(9),
        plannedDays: 28,
        measurements: [...controlCities, ...cityWeeks("tst", "Bogotá", 112.5, 10, 0)],
      }),
    );
    expect(r.evidence).toBe("weak");
    expect(r.warnings).toContain(WEAK_EVIDENCE_LABEL);
    expect(r.suggestion.decision).toBe("scale");
    expect(r.suggestion.reasons.some((x) => x.includes("evidencia débil"))).toBe(true);
  });

  it("antes / después con un solo control: sin placebo ni probabilidad", () => {
    const single: Measurement[] = cityWeeks("ctl", "", 100).concat(cityWeeks("tst", "", 100, 10));
    const r = analyzePilot(
      base({
        testType: "pre_post",
        primaryMetricId: "sales",
        arms: [arm("ctl", true), arm("tst")],
        postStart: week(6),
        postEnd: week(9),
        plannedDays: 28,
        measurements: single,
      }),
    );
    expect(r.ready).toBe(true);
    expect(r.geo!.did!.effect).toBeCloseTo(10, 8);
    expect(r.geo!.placebo).toBeNull();
    expect(r.suggestion.decision).toBeNull();
    expect(r.warnings).toContain("Con menos de 3 ciudades de control la lectura es débil.");
  });

  it("sin fecha de inicio no se puede leer", () => {
    const r = analyzePilot(base({ testType: "geo", primaryMetricId: "sales", arms: geoArms, postStart: null, measurements: controlCities }));
    expect(r.ready).toBe(false);
  });
});
