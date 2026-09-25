import { describe, expect, it } from "vitest";
import { durationWarning, freezeContaining, freezesOverlapping, freezeWarning, plannedRange } from "./calendar";
import { mondaysBetween, weekStart } from "./dates";
import type { CalendarEvent } from "./types";

const events: CalendarEvent[] = [
  { id: "p1", type: "peak", name: "Black Friday–Cyber", start_date: "2026-11-27", end_date: "2026-11-30" },
  { id: "f1", type: "freeze", name: "Congelamiento pico 1", start_date: "2026-11-23", end_date: "2026-12-06" },
  { id: "f2", type: "freeze", name: "Congelamiento decembrino", start_date: "2026-12-14", end_date: "2027-01-03" },
  { id: "d1", type: "decision", name: "Punto de decisión", start_date: "2027-01-18", end_date: "2027-01-18" },
];

describe("freezesOverlapping", () => {
  it("detecta cruces parciales y totales", () => {
    expect(freezesOverlapping({ start: "2026-11-01", end: "2026-11-23" }, events).map((e) => e.id)).toEqual(["f1"]);
    expect(freezesOverlapping({ start: "2026-11-20", end: "2026-12-20" }, events).map((e) => e.id)).toEqual(["f1", "f2"]);
    expect(freezesOverlapping({ start: "2026-12-07", end: "2026-12-13" }, events)).toEqual([]);
  });

  it("el ejercicio 2 del ejemplo termina antes del congelamiento de noviembre", () => {
    expect(freezesOverlapping({ start: "2026-10-05", end: "2026-11-01" }, events)).toEqual([]);
  });

  it("ignora picos y puntos de decisión", () => {
    expect(freezesOverlapping({ start: "2027-01-10", end: "2027-01-20" }, events)).toEqual([]);
  });

  it("sin fecha de inicio no hay cruce; sin fin usa el inicio", () => {
    expect(freezesOverlapping({ start: null, end: "2026-12-01" }, events)).toEqual([]);
    expect(freezesOverlapping({ start: "2026-11-24", end: null }, events).map((e) => e.id)).toEqual(["f1"]);
  });
});

describe("freezeContaining", () => {
  it("encuentra el congelamiento que contiene la fecha, bordes incluidos", () => {
    expect(freezeContaining("2026-11-23", events)?.id).toBe("f1");
    expect(freezeContaining("2026-12-06", events)?.id).toBe("f1");
    expect(freezeContaining("2026-12-07", events)).toBeNull();
    expect(freezeContaining(null, events)).toBeNull();
  });
});

describe("freezeWarning y plannedRange", () => {
  it("estima el fin con la duración mínima", () => {
    expect(plannedRange({ planned_start: "2026-11-10", planned_end: null, min_duration_days: 21 })).toEqual({
      start: "2026-11-10",
      end: "2026-11-30",
    });
    expect(freezeWarning(plannedRange({ planned_start: "2026-11-10", planned_end: null, min_duration_days: 21 }), events)).toMatch(
      /Congelamiento pico 1/,
    );
  });
});

describe("durationWarning", () => {
  it("advierte si se cierra antes de la duración mínima", () => {
    expect(durationWarning({ actual_start: "2026-08-10", actual_end: "2026-08-20", min_duration_days: 28 })).toMatch(
      /corrió 11 día/,
    );
    expect(durationWarning({ actual_start: "2026-08-10", actual_end: "2026-09-13", min_duration_days: 28 })).toBeNull();
    expect(durationWarning({ actual_start: "2026-08-31", actual_end: "2026-09-27", min_duration_days: 21 })).toBeNull();
    expect(durationWarning({ actual_start: null, actual_end: "2026-09-13", min_duration_days: 28 })).toBeNull();
  });
});

describe("semanas", () => {
  it("calcula el lunes de la semana", () => {
    expect(weekStart("2026-08-03")).toBe("2026-08-03");
    expect(weekStart("2026-08-09")).toBe("2026-08-03");
    expect(weekStart("2026-09-25")).toBe("2026-09-21");
  });
  it("genera las 12 semanas del ejemplo", () => {
    const weeks = mondaysBetween("2026-08-03", "2026-10-19");
    expect(weeks).toHaveLength(12);
    expect(weeks[11]).toBe("2026-10-19");
  });
});
