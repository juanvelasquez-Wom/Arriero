import { describe, expect, it } from "vitest";
import {
  bogotaDate,
  directionHeadline,
  growthAnswer,
  rollupProgram,
  sameMonth,
  worstStatus,
  type ProgramRollupInput,
  type RollupExperiment,
} from "./rollup";
import type { Variant } from "./types";
import type { MetricEconomics } from "./value";

const H1 = { id: "h1", name: "H1", start_date: "2026-08-01", end_date: "2026-12-31" };

const variants = (control: number, challenger: number): Variant[] => [
  { id: "a", name: "Control", is_control: true, sample: 1000, conversions: control, metric_value: null },
  { id: "b", name: "B", is_control: false, sample: 1000, conversions: challenger, metric_value: null },
];

function exp(over: Partial<RollupExperiment>): RollupExperiment {
  return {
    id: "e",
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
    ...over,
  };
}

const economics = new Map<string, MetricEconomics>([
  ["m-in", { id: "m-in", unit: "altas", direction: "up", baseline: 400, unit_value: 1000, latest_value: 500, latest_week: "2026-09-14" }],
]);

function input(over: Partial<ProgramRollupInput> = {}): ProgramRollupInput {
  return {
    id: "p",
    name: "Programa",
    is_demo: false,
    start_date: "2026-08-01",
    horizons: [H1],
    northStars: [
      {
        metric_id: "ns",
        metric_name: "Altas",
        line_id: "l",
        line_name: "Pospago",
        unit: "altas",
        direction: "up",
        baseline: 100,
        targets: [{ horizon_id: "h1", target: 200 }],
        values: [{ week_start: "2026-09-14", value: 140 }],
      },
    ],
    experiments: [],
    economics,
    today: "2026-09-26",
    ...over,
  };
}

describe("fechas", () => {
  it("convierte a fecha de Bogotá y compara meses", () => {
    expect(bogotaDate("2026-10-01T03:00:00Z")).toBe("2026-09-30");
    expect(bogotaDate(null)).toBeNull();
    expect(sameMonth("2026-09-02", "2026-09-26")).toBe(true);
    expect(sameMonth("2026-08-31", "2026-09-26")).toBe(false);
    expect(sameMonth(null, "2026-09-26")).toBe(false);
  });
});

describe("worstStatus y growthAnswer", () => {
  it("elige el peor semáforo", () => {
    expect(worstStatus([])).toBe("no_data");
    expect(worstStatus(["on_track", "no_data"])).toBe("on_track");
    expect(worstStatus(["on_track", "off_track", "behind"])).toBe("off_track");
  });
  it("responde según la proporción", () => {
    expect(growthAnswer(0, 0, 0)).toBe("unknown");
    expect(growthAnswer(3, 0, 3)).toBe("yes");
    expect(growthAnswer(2, 1, 3)).toBe("mixed");
    expect(growthAnswer(1, 1, 3)).toBe("mixed");
    expect(growthAnswer(0, 2, 4)).toBe("no");
  });
});

describe("rollupProgram", () => {
  it("evalúa la métrica norte y cuenta ejercicios", () => {
    const r = rollupProgram(
      input({
        experiments: [
          exp({ id: "1", status: "in_test" }),
          exp({ id: "2", status: "in_reading", status_changed_at: "2026-09-20T00:00:00Z" }),
          exp({ id: "3", status: "decided", verdict: "winner", decision: "scale", decided_at: "2026-09-10T15:00:00Z", variants: variants(100, 120) }),
          exp({ id: "4", status: "decided", verdict: "loser", decision: "kill", decided_at: "2026-08-10T15:00:00Z", variants: variants(100, 90) }),
        ],
      }),
    );
    expect(r.northStars).toHaveLength(1);
    expect(r.northStars[0].evaluation.status).not.toBe("no_data");
    expect(r.running).toBe(1);
    expect(r.closedTotal).toBe(2);
    expect(r.winnersTotal).toBe(1);
    expect(r.closedThisMonth).toBe(1);
    expect(r.winnersThisMonth).toBe(1);
    expect(r.hitRate).toBe(0.5);
    expect(r.pendingDecisions.map((p) => p.id)).toEqual(["2"]);
    // +20 % × 500 altas/semana × $1.000 = $100.000 por semana
    expect(r.value?.weekly).toBeCloseTo(100_000);
    expect(r.value?.counted).toBe(1);
  });

  it("sin metas ni valores queda sin datos", () => {
    const r = rollupProgram(input({ northStars: [{ ...input().northStars[0], targets: [], values: [] }] }));
    expect(r.health).toBe("no_data");
    expect(r.statusCounts.no_data).toBe(1);
    expect(r.hitRate).toBeNull();
    expect(r.value).toBeNull();
  });
});

describe("directionHeadline", () => {
  it("suma programas reales e ignora el ejemplo si hay reales", () => {
    const real = rollupProgram(input({ experiments: [exp({ status: "in_test" })] }));
    const demo = rollupProgram(input({ id: "d", is_demo: true, experiments: [exp({ status: "in_test" }), exp({ status: "in_test" })] }));
    const h = directionHeadline([real, demo]);
    expect(h.programs).toBe(1);
    expect(h.running).toBe(1);
    expect(h.includesDemo).toBe(false);
    expect(h.northStarsTotal).toBe(1);
  });
  it("usa el ejemplo si es lo único que hay", () => {
    const demo = rollupProgram(input({ id: "d", is_demo: true }));
    const h = directionHeadline([demo]);
    expect(h.includesDemo).toBe(true);
    expect(h.programs).toBe(1);
  });
  it("sin programas no se puede saber", () => {
    const h = directionHeadline([]);
    expect(h.answer).toBe("unknown");
    expect(h.hitRate).toBeNull();
    expect(h.monthlyValue).toBeNull();
  });
});
