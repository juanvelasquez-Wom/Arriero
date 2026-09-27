import { describe, expect, it } from "vitest";
import { currentHorizon, evaluateTarget, favorableGap, linearExpected, statusFromGap, type TargetInput } from "./targets";

const H1 = { id: "h1", name: "H1", start_date: "2026-01-01", end_date: "2026-04-30" }; // 119 días
const H2 = { id: "h2", name: "H2", start_date: "2026-05-01", end_date: "2026-08-31" };

function input(over: Partial<TargetInput> = {}): TargetInput {
  return {
    baseline: 100,
    direction: "up",
    targets: [{ horizon_id: "h1", target: 200 }],
    horizons: [H1, H2],
    values: [],
    today: "2026-03-01",
    programStart: "2026-01-01",
    ...over,
  };
}

describe("currentHorizon", () => {
  it("elige el que contiene hoy, el primero antes y el último después", () => {
    expect(currentHorizon([H2, H1], "2026-02-10")?.id).toBe("h1");
    expect(currentHorizon([H1, H2], "2025-12-01")?.id).toBe("h1");
    expect(currentHorizon([H1, H2], "2027-01-01")?.id).toBe("h2");
    expect(currentHorizon([], "2026-01-01")).toBeNull();
  });
});

describe("linearExpected", () => {
  it("interpola y acota a los extremos", () => {
    expect(linearExpected("2026-01-01", 0, "2026-01-11", 100, "2026-01-06")).toBe(50);
    expect(linearExpected("2026-01-01", 0, "2026-01-11", 100, "2025-12-01")).toBe(0);
    expect(linearExpected("2026-01-01", 0, "2026-01-11", 100, "2026-02-01")).toBe(100);
    expect(linearExpected("2026-01-01", 0, "2026-01-01", 100, "2026-01-01")).toBe(100);
  });
});

describe("favorableGap y statusFromGap", () => {
  it("corrige por dirección", () => {
    expect(favorableGap(90, 100, "up", 1)).toBeCloseTo(-0.1);
    expect(favorableGap(90, 100, "down", 1)).toBeCloseTo(0.1);
  });
  it("usa la escala alterna si lo esperado es 0", () => {
    expect(favorableGap(-5, 0, "up", 50)).toBeCloseTo(-0.1);
    expect(favorableGap(1, 0, "up", 0)).toBe(1);
    expect(favorableGap(0, 0, "up", 0)).toBe(0);
  });
  it("umbrales: −5 % y −15 %", () => {
    expect(statusFromGap(0.2)).toBe("on_track");
    expect(statusFromGap(-0.05)).toBe("on_track");
    expect(statusFromGap(-0.051)).toBe("behind");
    expect(statusFromGap(-0.15)).toBe("behind");
    expect(statusFromGap(-0.16)).toBe("off_track");
  });
});

describe("evaluateTarget", () => {
  it("sin datos: horizonte, meta, base o valores", () => {
    expect(evaluateTarget(input({ horizons: [] })).reason).toBe("no_horizon");
    expect(evaluateTarget(input({ targets: [] })).reason).toBe("no_target");
    expect(evaluateTarget(input({ baseline: null, values: [{ week_start: "2026-02-23", value: 1 }] })).reason).toBe("no_start");
    const r = evaluateTarget(input());
    expect(r.status).toBe("no_data");
    expect(r.reason).toBe("no_values");
    expect(r.target).toBe(200);
  });

  it("métrica que debe subir: en camino, un poco atrás y muy atrás", () => {
    // Semana del 2026-02-23 → termina el 2026-03-01 (día 59 de 119): esperado ≈ 149,6.
    const at = (value: number) => evaluateTarget(input({ values: [{ week_start: "2026-02-23", value }] }));
    const ok = at(150);
    expect(ok.expected).toBeCloseTo(100 + (100 * 59) / 119);
    expect(ok.status).toBe("on_track");
    expect(ok.latest).toBe(150);
    expect(ok.latestWeek).toBe("2026-02-23");
    expect(at(135).status).toBe("behind");
    expect(at(120).status).toBe("off_track");
    expect(at(180).gap).toBeGreaterThan(0);
  });

  it("métrica que debe bajar: lo alto es malo", () => {
    const at = (value: number) =>
      evaluateTarget(
        input({ baseline: 50, direction: "down", targets: [{ horizon_id: "h1", target: 30 }], values: [{ week_start: "2026-02-23", value }] }),
      );
    // Esperado ≈ 40,1.
    expect(at(40).status).toBe("on_track");
    expect(at(35).status).toBe("on_track");
    expect(at(44).status).toBe("behind");
    expect(at(50).status).toBe("off_track");
  });

  it("toma el último valor aunque lleguen desordenados y no mira más allá de hoy", () => {
    const r = evaluateTarget(
      input({
        today: "2026-02-25",
        values: [
          { week_start: "2026-02-23", value: 145 },
          { week_start: "2026-01-05", value: 100 },
        ],
      }),
    );
    expect(r.latest).toBe(145);
    // asOf = hoy (2026-02-25, día 55), no el fin de semana.
    expect(r.expected).toBeCloseTo(100 + (100 * 55) / 119);
  });

  it("en H2 parte de la meta de H1 al cierre de H1", () => {
    const r = evaluateTarget(
      input({
        today: "2026-06-30",
        targets: [
          { horizon_id: "h1", target: 200 },
          { horizon_id: "h2", target: 300 },
        ],
        values: [{ week_start: "2026-06-29", value: 220 }],
      }),
    );
    expect(r.horizonId).toBe("h2");
    // 2026-04-30 → 2026-08-31 (123 días); 2026-06-30 es el día 61.
    expect(r.expected).toBeCloseTo(200 + (100 * 61) / 123);
    expect(r.status).toBe("behind");
  });

  it("en H2 sin meta en H1 parte de la línea base al inicio del programa", () => {
    const r = evaluateTarget(
      input({ today: "2026-08-31", targets: [{ horizon_id: "h2", target: 300 }], values: [{ week_start: "2026-08-31", value: 300 }] }),
    );
    expect(r.expected).toBe(300);
    expect(r.status).toBe("on_track");
  });
});
