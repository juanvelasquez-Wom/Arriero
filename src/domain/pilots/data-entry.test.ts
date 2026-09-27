import { describe, expect, it } from "vitest";
import { cellKey, defaultPeriod, entryRows, existingForPeriod, groupByPeriod, normalizePeriod, periodError, readEntry } from "./data-entry";
import type { PilotArm } from "./types";

const ARMS: PilotArm[] = [
  { id: "c", name: "Control", is_control: true, split_pct: null, cities: ["Cali", "Pereira"] },
  { id: "t", name: "Prueba", is_control: false, split_pct: null, cities: ["Medellín"] },
  { id: "x", name: "Sin ciudad", is_control: false, split_pct: null, cities: [] },
];

describe("entryRows", () => {
  it("una fila por grupo fuera de geo", () => {
    expect(entryRows(ARMS, false).map((r) => r.key)).toEqual(["c|", "t|", "x|"]);
  });
  it("una fila por grupo × ciudad en geo", () => {
    expect(entryRows(ARMS, true).map((r) => r.key)).toEqual(["c|Cali", "c|Pereira", "t|Medellín", "x|"]);
  });
});

describe("existingForPeriod", () => {
  it("toma solo el periodo y la granularidad pedidos", () => {
    const out = existingForPeriod(
      [
        { arm_id: "c", metric_id: "m", unit_label: "Cali", period_start: "2026-10-05", granularity: "week", value: 1234.5 },
        { arm_id: "c", metric_id: "m", unit_label: "Cali", period_start: "2026-10-05", granularity: "day", value: 9 },
        { arm_id: "c", metric_id: "m", unit_label: "Cali", period_start: "2026-10-12", granularity: "week", value: 7 },
      ],
      "2026-10-05",
      "week",
    );
    expect(out).toEqual({ [cellKey("c|Cali", "m")]: "1234,5" });
  });
});

describe("periodo", () => {
  const range = { min: "2026-10-01", max: "2026-10-31" };
  it("corre las semanas al lunes", () => {
    expect(normalizePeriod("2026-10-08", "week")).toBe("2026-10-05");
    expect(normalizePeriod("2026-10-08", "day")).toBe("2026-10-08");
  });
  it("valida lunes y rango", () => {
    expect(periodError(null, "day", range)).toBe("Elija la fecha del periodo.");
    expect(periodError("2026-10-06", "week", range)).toMatch(/lunes/);
    expect(periodError("2026-09-28", "week", range)).toBeNull(); // la semana del 1 de octubre
    expect(periodError("2026-09-30", "day", range)).toMatch(/fuera del piloto/);
    expect(periodError("2026-11-01", "day", range)).toMatch(/fuera del piloto/);
    expect(periodError("2026-10-15", "day", range)).toBeNull();
    expect(periodError("2026-10-15", "day", null)).toBeNull();
  });
  it("propone hoy dentro del rango", () => {
    expect(defaultPeriod("2026-12-01", "day", range)).toBe("2026-10-31");
    expect(defaultPeriod("2026-09-01", "day", range)).toBe("2026-10-01");
    expect(defaultPeriod("2026-10-15", "week", range)).toBe("2026-10-12");
    expect(defaultPeriod("2026-10-15", "day", null)).toBe("2026-10-15");
  });
});

describe("readEntry", () => {
  const rows = entryRows(ARMS.slice(0, 2), false);
  const metrics = [
    { id: "conv", name: "Conversaciones" },
    { id: "sales", name: "Ventas" },
  ];
  it("valida números, negativos y deja solo lo que cambia", () => {
    const r = readEntry({
      rows,
      metrics,
      period: "2026-10-05",
      existing: { [cellKey("c|", "conv")]: "100" },
      drafts: {
        [cellKey("c|", "conv")]: "100",
        [cellKey("c|", "sales")]: "1.234",
        [cellKey("t|", "conv")]: "-3",
        [cellKey("t|", "sales")]: "abc",
      },
    });
    expect(r.values).toEqual([{ arm_id: "c", metric_id: "sales", unit_label: "", period_start: "2026-10-05", value: 1234 }]);
    expect(r.all).toHaveLength(2);
    expect(r.errors[cellKey("t|", "conv")]).toBe("Conversaciones: no se aceptan valores negativos.");
    expect(r.errors[cellKey("t|", "sales")]).toBe("Ventas: «abc» no es un número.");
  });
});

describe("groupByPeriod", () => {
  it("ordena del más reciente al más antiguo", () => {
    const g = groupByPeriod([
      { period_start: "2026-10-01", granularity: "day" as const, id: 1 },
      { period_start: "2026-10-03", granularity: "day" as const, id: 2 },
      { period_start: "2026-10-01", granularity: "day" as const, id: 3 },
    ]);
    expect(g.map((x) => [x.period, x.rows.length])).toEqual([
      ["2026-10-03", 1],
      ["2026-10-01", 2],
    ]);
  });
});
