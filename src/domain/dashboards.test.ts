import { describe, expect, it } from "vitest";
import { learningVelocity, portfolioMatrix, summarizeResults } from "./dashboards";
import { barGeometry, buildTimeline, crossesFreeze } from "./gantt";
import { describeImpact, dependencyChoice, confirmsProgramName } from "./deletion";
import { onboardingComplete, onboardingSteps } from "./onboarding";
import type { Variant } from "./types";

const variant = (o: Partial<Variant>): Variant => ({
  id: "v",
  name: "v",
  is_control: false,
  sample: null,
  conversions: null,
  metric_value: null,
  ...o,
});

describe("summarizeResults (programa de ejemplo)", () => {
  const experiments = [
    {
      id: "e1",
      status: "scaled" as const,
      verdict: "winner" as const,
      decision: "scale" as const,
      variants: [variant({ is_control: true, sample: 5000, conversions: 900 }), variant({ sample: 5000, conversions: 1150 })],
    },
    { id: "e2", status: "in_test" as const, verdict: null, decision: null, variants: [] },
    {
      id: "e3",
      status: "decided" as const,
      verdict: "loser" as const,
      decision: "kill" as const,
      variants: [variant({ is_control: true, sample: 2400, conversions: 600 }), variant({ sample: 3100, conversions: 651 })],
    },
  ];

  it("dos cerrados, win rate 50 % y +27,8 % del ganador", () => {
    const s = summarizeResults(experiments);
    expect(s.closed).toBe(2);
    expect(s.winRate).toBe(0.5);
    expect(Math.round(s.avgWinnerDiff! * 1000) / 10).toBe(27.8);
    expect(s.verdicts).toEqual({ winner: 1, loser: 1, inconclusive: 0 });
    expect(s.decisions).toEqual({ scale: 1, adjust: 0, kill: 1 });
  });

  it("sin cerrados el win rate es null", () => {
    expect(summarizeResults([]).winRate).toBeNull();
  });
});

describe("portfolioMatrix", () => {
  const stageNames = ["Adquisición", "Activación", "Conversión", "Recuperación y recurrencia"];
  const lines = [
    { id: "L1", name: "Pospago" },
    { id: "L2", name: "Recargas" },
    { id: "L3", name: "Equipos" },
  ];
  const stages = lines.flatMap((l) => stageNames.map((name, i) => ({ id: `${l.id}-${i}`, line_id: l.id, name, sort_order: i + 1 })));

  it("cuenta activos y cerrados por celda y marca huecos con problemas validados sin ejercicio", () => {
    const m = portfolioMatrix({
      lines,
      stages,
      problems: [
        { id: "P1", line_id: "L2", stage_id: "L2-3", status: "validated" },
        { id: "P2", line_id: "L1", stage_id: "L1-0", status: "validated" },
        { id: "P3", line_id: "L3", stage_id: "L3-1", status: "validated" },
        { id: "P4", line_id: "L3", stage_id: "L3-2", status: "validated" },
      ],
      experiments: [
        { id: "E1", line_id: "L2", problem_id: "P1", status: "scaled" },
        { id: "E2", line_id: "L1", problem_id: "P2", status: "in_test" },
        { id: "E3", line_id: "L3", problem_id: "P3", status: "decided" },
      ],
    });
    expect(m.columns).toEqual(stageNames);
    const cell = (line: number, stage: number) => m.rows[line].cells[stage];
    expect(cell(0, 0)).toMatchObject({ active: 1, closed: 0, gap: false });
    expect(cell(1, 3)).toMatchObject({ active: 0, closed: 1, total: 1 });
    expect(cell(2, 2)).toMatchObject({ gap: true, validatedWithoutExperiment: 1 });
    expect(m.rows.every((r) => !r.alert)).toBe(true);
  });

  it("alerta si una línea no tiene ejercicios", () => {
    const m = portfolioMatrix({ lines, stages, problems: [], experiments: [] });
    expect(m.rows.every((r) => r.alert)).toBe(true);
  });
});

describe("learningVelocity", () => {
  it("agrupa lanzados y cerrados por semana en 12 semanas", () => {
    const v = learningVelocity(
      [
        { actual_start: "2026-08-10", decided_at: "2026-09-14T15:00:00Z", status: "scaled" },
        { actual_start: "2026-08-31", decided_at: "2026-09-28T15:00:00Z", status: "decided" },
        { actual_start: "2026-10-05", decided_at: null, status: "in_test" },
      ],
      "2026-10-19",
    );
    expect(v).toHaveLength(12);
    expect(v[0].week).toBe("2026-08-03");
    expect(v.find((p) => p.week === "2026-08-10")?.launched).toBe(1);
    expect(v.find((p) => p.week === "2026-09-14")?.closed).toBe(1);
    expect(v.find((p) => p.week === "2026-10-05")?.launched).toBe(1);
    expect(v.reduce((a, p) => a + p.launched, 0)).toBe(3);
    expect(v.reduce((a, p) => a + p.closed, 0)).toBe(2);
  });
});

describe("gantt", () => {
  const t = buildTimeline("2026-08-01", "2027-04-30");
  it("ubica barras dentro de la línea de tiempo", () => {
    const g = barGeometry(t, "2026-08-01", "2026-08-01")!;
    expect(g.left).toBe(0);
    expect(g.width).toBeGreaterThan(0);
    expect(barGeometry(t, "2025-01-01", "2025-02-01")).toBeNull();
    expect(barGeometry(t, null, null)).toBeNull();
  });
  it("detecta cruces con congelamientos en lo planeado o lo real", () => {
    const events = [{ id: "f", type: "freeze" as const, name: "F", start_date: "2026-11-23", end_date: "2026-12-06" }];
    expect(
      crossesFreeze({ planned_start: "2026-10-05", planned_end: "2026-11-01", actual_start: "2026-10-05", actual_end: null }, events),
    ).toEqual([]);
    expect(
      crossesFreeze({ planned_start: "2026-10-05", planned_end: "2026-11-01", actual_start: "2026-10-05", actual_end: "2026-11-25" }, events),
    ).toHaveLength(1);
  });
});

describe("deletion", () => {
  it("describe el impacto en español", () => {
    expect(describeImpact({ experiments: 3, attachments: 1, variants: 0 })).toEqual(["3 ejercicios", "1 adjunto"]);
  });
  it("pide elegir cuando hay dependientes", () => {
    expect(dependencyChoice("problem", { experiments: 2 })).toEqual({ dependents: "experiments", count: 2 });
    expect(dependencyChoice("problem", { experiments: 0 })).toBeNull();
    expect(dependencyChoice("stage", { problems: 1 })).toEqual({ dependents: "problems", count: 1 });
    expect(dependencyChoice("line", { experiments: 5 })).toBeNull();
  });
  it("confirma el nombre del programa", () => {
    expect(confirmsProgramName(" Programa X ", "Programa X")).toBe(true);
    expect(confirmsProgramName("programa x", "Programa X")).toBe(false);
  });
});

describe("onboarding", () => {
  it("marca los pasos y se completa", () => {
    const empty = { lines: 0, linesWithNorthStar: 0, inputMetrics: 0, stages: 0, problems: 0, experiments: 0 };
    expect(onboardingSteps(empty).every((s) => !s.done)).toBe(true);
    expect(onboardingComplete({ lines: 3, linesWithNorthStar: 3, inputMetrics: 4, stages: 12, problems: 3, experiments: 3 })).toBe(true);
    expect(onboardingComplete({ lines: 3, linesWithNorthStar: 2, inputMetrics: 4, stages: 12, problems: 3, experiments: 3 })).toBe(false);
  });
});
