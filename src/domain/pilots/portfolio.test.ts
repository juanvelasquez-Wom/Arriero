import { describe, expect, it } from "vitest";
import type { PilotAnalysis } from "./analysis";
import {
  activeFilterCount,
  budgetProgress,
  channelOptions,
  filterPilots,
  headlineResult,
  overlapsWindow,
  parsePortfolioFilters,
  parsePortfolioView,
  pilotRange,
  portfolioKpis,
  type PortfolioPilot,
} from "./portfolio";

const pilot = (over: Partial<PortfolioPilot>): PortfolioPilot => ({
  id: "p",
  status: "in_test",
  test_type: "ab_platform",
  variable_category: "audience",
  owner_id: "u1",
  planned_start: "2026-10-01",
  planned_end: "2026-10-31",
  actual_start: null,
  actual_end: null,
  planned_budget_cop: 1_000_000,
  spent_cop: 250_000,
  media_names: ["Meta Ads"],
  decision: null,
  ...over,
});

describe("filtros del portafolio", () => {
  it("lee la URL e ignora valores inválidos", () => {
    const f = parsePortfolioFilters({ estado: "in_test", tipo: "nope", variable: ["creative"], desde: "2026-10-01", hasta: "ayer", canal: " Meta Ads " });
    expect(f).toEqual({ estado: "in_test", canal: "Meta Ads", variable: "creative", tipo: null, responsable: null, desde: "2026-10-01", hasta: null });
    expect(activeFilterCount(f)).toBe(4);
    expect(parsePortfolioView({ vista: "tarjetas" })).toBe("tarjetas");
    expect(parsePortfolioView({})).toBe("lista");
  });

  it("filtra por estado, canal (sin importar mayúsculas), variable, tipo y responsable", () => {
    const items = [
      pilot({ id: "a" }),
      pilot({ id: "b", status: "draft", media_names: ["Google Ads"] }),
      pilot({ id: "c", test_type: "geo", variable_category: "creative", owner_id: "u2" }),
    ];
    const none = parsePortfolioFilters({});
    expect(filterPilots(items, none).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(filterPilots(items, { ...none, estado: "draft" }).map((p) => p.id)).toEqual(["b"]);
    expect(filterPilots(items, { ...none, canal: "meta ads" }).map((p) => p.id)).toEqual(["a", "c"]);
    expect(filterPilots(items, { ...none, variable: "creative" }).map((p) => p.id)).toEqual(["c"]);
    expect(filterPilots(items, { ...none, tipo: "geo" }).map((p) => p.id)).toEqual(["c"]);
    expect(filterPilots(items, { ...none, responsable: "u1" }).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("las fechas filtran por cruce con el rango del piloto (real antes que planeado)", () => {
    const p = pilot({ actual_start: "2026-10-10", actual_end: "2026-11-15" });
    expect(pilotRange(p)).toEqual({ start: "2026-10-10", end: "2026-11-15" });
    expect(overlapsWindow(p, "2026-11-10", null)).toBe(true);
    expect(overlapsWindow(p, "2026-11-16", null)).toBe(false);
    expect(overlapsWindow(p, null, "2026-10-09")).toBe(false);
    expect(overlapsWindow(p, "2026-09-01", "2026-10-10")).toBe(true);
    expect(overlapsWindow(pilot({ planned_start: null, planned_end: null }), "2026-01-01", null)).toBe(false);
    expect(overlapsWindow(pilot({ planned_start: null, planned_end: null }), null, null)).toBe(true);
  });
});

describe("KPIs del portafolio", () => {
  it("cuenta activos, inversión y tasa de escalados", () => {
    const k = portfolioKpis([
      pilot({ status: "approved", planned_budget_cop: 2_000_000, spent_cop: 0 }),
      pilot({ status: "in_test" }),
      pilot({ status: "in_reading", planned_budget_cop: null, spent_cop: 100 }),
      pilot({ status: "draft", planned_budget_cop: 9_000_000 }),
      pilot({ status: "decided", decision: "scale" }),
      pilot({ status: "decided", decision: "kill" }),
      pilot({ status: "decided", decision: "adjust" }),
      pilot({ status: "decided", decision: "scale" }),
    ]);
    expect(k.active).toBe(3);
    expect(k.activePlannedCop).toBe(3_000_000);
    expect(k.activeSpentCop).toBe(250_100);
    expect(k.decided).toBe(4);
    expect(k.scaled).toBe(2);
    expect(k.scaledRate).toBe(0.5);
  });

  it("sin decididos la tasa es null", () => {
    expect(portfolioKpis([pilot({})]).scaledRate).toBeNull();
    expect(portfolioKpis([]).active).toBe(0);
  });

  it("avance de la inversión", () => {
    expect(budgetProgress(1000, 250)).toEqual({ pct: 25, over: false });
    expect(budgetProgress(1000, 1500)).toEqual({ pct: 100, over: true });
    expect(budgetProgress(null, 10)).toEqual({ pct: null, over: false });
    expect(budgetProgress(0, 10)).toEqual({ pct: null, over: false });
  });

  it("opciones de canal únicas y ordenadas", () => {
    expect(channelOptions([{ media_names: ["TikTok", "Meta Ads"] }, { media_names: ["Meta Ads"] }])).toEqual(["Meta Ads", "TikTok"]);
  });
});

describe("resultado principal", () => {
  const analysis = (primary: PilotAnalysis["primary"]): PilotAnalysis => ({
    evidence: "probabilistic",
    primary,
    geo: null,
    holdout: null,
    guardrails: [],
    suggestion: { decision: null, reasons: [] },
    warnings: [],
    ready: !!primary,
  });

  it("toma la mejor variante marcada por la lectura", () => {
    const r = headlineResult(
      analysis({
        metricId: "m",
        perArm: [],
        comparisons: [
          { armId: "b", liftPct: 5, lowPct: null, highPct: null, probabilityBetter: 0.7 },
          { armId: "c", liftPct: 12, lowPct: null, highPct: null, probabilityBetter: 0.93 },
        ],
        probabilityBest: null,
        bestArmId: "c",
      }),
    );
    expect(r).toEqual({ armId: "c", probability: 0.93, liftPct: 12 });
  });

  it("sin mejor marcada, la de mayor probabilidad; sin lectura, null", () => {
    const r = headlineResult(
      analysis({
        metricId: "m",
        perArm: [],
        comparisons: [
          { armId: "b", liftPct: 5, lowPct: null, highPct: null, probabilityBetter: null },
          { armId: "c", liftPct: -3, lowPct: null, highPct: null, probabilityBetter: 0.2 },
        ],
        probabilityBest: null,
        bestArmId: null,
      }),
    );
    expect(r?.armId).toBe("c");
    expect(headlineResult(analysis(null))).toBeNull();
    expect(headlineResult(null)).toBeNull();
  });
});
