import { describe, expect, it } from "vitest";
import { buildReport, parsePeriod, reportPeriod, reportToText, type ReportExperiment, type ReportInput } from "./report";
import { evaluateNorthStars } from "./rollup";
import type { Variant } from "./types";
import type { MetricEconomics } from "./value";

const today = "2026-09-26";

const variants = (control: number, challenger: number): Variant[] => [
  { id: "a", name: "Control", is_control: true, sample: 1000, conversions: control, metric_value: null },
  { id: "b", name: "B", is_control: false, sample: 1000, conversions: challenger, metric_value: null },
];

function exp(over: Partial<ReportExperiment>): ReportExperiment {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Ejercicio",
    status: "idea",
    line_name: "Pospago",
    metric_id: "m-in",
    test_type: "ab",
    verdict: null,
    decision: null,
    decided_at: null,
    status_changed_at: "2026-09-01T12:00:00Z",
    variants: [],
    actual_start: null,
    owner_name: null,
    final_score: null,
    decision_rationale: null,
    learning: null,
    ...over,
  };
}

const economics = new Map<string, MetricEconomics>([
  ["m-in", { id: "m-in", unit: "altas", direction: "up", baseline: 400, unit_value: 1000, latest_value: 500, latest_week: "2026-09-14" }],
]);

const northStars = evaluateNorthStars({
  horizons: [{ id: "h1", name: "H1", start_date: "2026-08-01", end_date: "2026-12-31" }],
  start_date: "2026-08-01",
  today,
  northStars: [
    {
      metric_id: "ns",
      metric_name: "Altas",
      line_id: "l",
      line_name: "Pospago",
      unit: "altas",
      direction: "up",
      baseline: 100,
      targets: [{ horizon_id: "h1", target: 300 }],
      values: [
        { week_start: "2026-09-07", value: 100 },
        { week_start: "2026-09-21", value: 110 },
      ],
    },
  ],
});

function input(over: Partial<ReportInput> = {}): ReportInput {
  return {
    period: reportPeriod("semana", today),
    today,
    northStars,
    economics,
    calendar: [
      { id: "f1", type: "freeze", name: "Black Friday", start_date: "2026-10-10", end_date: "2026-10-20" },
      { id: "f2", type: "freeze", name: "Diciembre", start_date: "2026-12-10", end_date: "2026-12-31" },
      { id: "p1", type: "peak", name: "Pico", start_date: "2026-10-01", end_date: "2026-10-02" },
    ],
    experiments: [
      exp({ title: "Lanzado", status: "in_test", actual_start: "2026-09-22", owner_name: "Ana" }),
      exp({ title: "Viejo", status: "in_test", actual_start: "2026-08-01" }),
      exp({
        title: "Ganador",
        status: "decided",
        verdict: "winner",
        decision: "scale",
        decided_at: "2026-09-24T15:00:00Z",
        variants: variants(100, 120),
        learning: "El precio visible convierte.",
      }),
      exp({ title: "Perdedor viejo", status: "decided", verdict: "loser", decision: "kill", decided_at: "2026-09-02T15:00:00Z" }),
      exp({ title: "Leyendo", status: "in_reading" }),
      ...[5, 9, 7, 3, 8, 6].map((s, i) => exp({ title: `P${i}`, status: i % 2 ? "in_design" : "prioritized", final_score: s })),
    ],
    ...over,
  };
}

describe("periodo", () => {
  it("parsea y arma ventanas móviles", () => {
    expect(parsePeriod("mes")).toBe("mes");
    expect(parsePeriod(["mes"])).toBe("mes");
    expect(parsePeriod(undefined)).toBe("semana");
    expect(reportPeriod("semana", today)).toMatchObject({ start: "2026-09-20", end: today });
    expect(reportPeriod("mes", today).start).toBe("2026-08-28");
  });
});

describe("buildReport", () => {
  const r = buildReport(input());

  it("qué se movió: último valor frente al anterior al periodo", () => {
    expect(r.moved).toHaveLength(1);
    expect(r.moved[0].latest).toBe(110);
    expect(r.moved[0].previous).toBe(100);
    expect(r.moved[0].change).toBeCloseTo(0.1);
  });

  it("lanzados y cerrados dentro del periodo", () => {
    expect(r.launched.map((l) => l.title)).toEqual(["Lanzado"]);
    expect(r.closed.map((c) => c.title)).toEqual(["Ganador"]);
    expect(r.closed[0].diff).toBeCloseTo(0.2);
    expect(r.closed[0].learning).toBe("El precio visible convierte.");
    expect(r.winners).toBe(1);
    // 0,2 × 500 × 1000 = 100.000 por semana → × 52/12
    expect(r.value?.monthly).toBeCloseTo((100_000 * 52) / 12);
  });

  it("qué sigue: top 5 por puntaje", () => {
    expect(r.nextUp.map((n) => n.final_score)).toEqual([9, 8, 7, 6, 5]);
  });

  it("riesgos: congelamiento próximo, métrica atrás y decisiones pendientes", () => {
    const kinds = r.risks.map((x) => x.kind);
    expect(kinds).toContain("freeze");
    expect(r.risks.filter((x) => x.kind === "freeze")).toHaveLength(1);
    expect(kinds.some((k) => k === "off_track" || k === "behind")).toBe(true);
    expect(r.risks.find((x) => x.kind === "pending")?.title).toMatch(/1 ejercicio esperando/);
  });

  it("el mes incluye lo de hace 30 días", () => {
    const m = buildReport(input({ period: reportPeriod("mes", today) }));
    expect(m.closed.map((c) => c.title)).toEqual(["Perdedor viejo", "Ganador"]);
  });
});

describe("reportToText", () => {
  it("arma todas las secciones", () => {
    const text = reportToText(buildReport(input()), "Programa X");
    for (const s of ["Programa X", "QUÉ SE MOVIÓ", "QUÉ SE LANZÓ", "QUÉ SE CERRÓ", "VALOR ESTIMADO", "QUÉ SIGUE", "RIESGOS"]) {
      expect(text).toContain(s);
    }
    expect(text).toContain("Aprendizaje: El precio visible convierte.");
  });
  it("sin datos no se rompe", () => {
    const empty = buildReport(input({ experiments: [], northStars: [], calendar: [] }));
    const text = reportToText(empty, "Vacío");
    expect(text).toContain("Nada arrancó");
    expect(text).toContain("Sin riesgos a la vista.");
    expect(empty.value).toBeNull();
  });
});
