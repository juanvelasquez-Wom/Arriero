import { describe, expect, it } from "vitest";
import {
  calendarFitMessage,
  hypothesisFromLearning,
  splitHypothesis,
  inferCalendarFit,
  inferControl,
  inferOwnerType,
  isCalendarOverride,
  resolveFitsCalendar,
  resolvePrimaryMetric,
} from "./experiment-inference";
import type { CalendarEvent } from "./types";

const events: CalendarEvent[] = [
  { id: "p1", type: "peak", name: "Black Friday", start_date: "2026-11-27", end_date: "2026-11-30" },
  { id: "f1", type: "freeze", name: "Congelamiento diciembre", start_date: "2026-12-10", end_date: "2026-12-31" },
  { id: "d1", type: "decision", name: "Decisión enero", start_date: "2027-01-15", end_date: "2027-01-15" },
];

describe("inferCalendarFit", () => {
  it("sin fecha de inicio no se puede calcular", () => {
    expect(inferCalendarFit({ planned_start: null, planned_end: null }, events)).toEqual({ fits: null, conflicts: [] });
  });

  it("encaja cuando no cruza picos ni congelamientos", () => {
    const r = inferCalendarFit({ planned_start: "2026-10-05", planned_end: "2026-10-25" }, events);
    expect(r.fits).toBe(true);
    expect(r.conflicts).toEqual([]);
  });

  it("no encaja si cruza un pico, y dice cuál", () => {
    const r = inferCalendarFit({ planned_start: "2026-11-20", planned_end: "2026-11-28" }, events);
    expect(r.fits).toBe(false);
    expect(r.conflicts.map((c) => c.id)).toEqual(["p1"]);
  });

  it("no encaja si cruza un congelamiento; el punto de decisión no cuenta", () => {
    const r = inferCalendarFit({ planned_start: "2026-12-01", planned_end: "2027-01-20" }, events);
    expect(r.conflicts.map((c) => c.id)).toEqual(["f1"]);
  });

  it("sin fin, estima el rango con la duración mínima", () => {
    expect(inferCalendarFit({ planned_start: "2026-11-15", planned_end: null, min_duration_days: 28 }, events).fits).toBe(false);
    expect(inferCalendarFit({ planned_start: "2026-11-15", planned_end: null }, events).fits).toBe(true);
  });
});

describe("resolveFitsCalendar e isCalendarOverride", () => {
  it("usa el calculado salvo cambio manual o sin fechas", () => {
    expect(resolveFitsCalendar({ manual: false, override: false, inferred: true })).toBe(true);
    expect(resolveFitsCalendar({ manual: true, override: true, inferred: false })).toBe(true);
    expect(resolveFitsCalendar({ manual: true, override: false, inferred: null })).toBe(true);
  });

  it("detecta si lo guardado se aparta del cálculo", () => {
    expect(isCalendarOverride(true, false)).toBe(true);
    expect(isCalendarOverride(true, true)).toBe(false);
    expect(isCalendarOverride(true, null)).toBe(false);
  });
});

describe("inferencias simples", () => {
  it("el control parte del problema", () => {
    expect(inferControl("shared")).toBe("shared");
    expect(inferControl(null)).toBe("ours");
  });

  it("el tipo de responsable sale del rol", () => {
    expect(inferOwnerType("agency")).toBe("agency");
    expect(inferOwnerType("collaborator")).toBe("internal");
    expect(inferOwnerType("owner")).toBe("internal");
    expect(inferOwnerType(null)).toBeNull();
  });

  it("la métrica principal es la del árbol, salvo que la hayan escrito a mano", () => {
    expect(resolvePrimaryMetric({ current: "", previousMetricName: null, metricName: "Altas" })).toBe("Altas");
    expect(resolvePrimaryMetric({ current: "Altas", previousMetricName: "Altas", metricName: "Recargas" })).toBe("Recargas");
    expect(resolvePrimaryMetric({ current: "Tasa de altas (7 días)", previousMetricName: "Altas", metricName: "Recargas" })).toBe(
      "Tasa de altas (7 días)",
    );
    expect(resolvePrimaryMetric({ current: null, previousMetricName: null, metricName: null })).toBeNull();
  });
});

describe("calendarFitMessage", () => {
  it("explica el cálculo", () => {
    expect(calendarFitMessage({ fits: true, conflicts: [] }, 1)).toBe("Calculado: sus fechas no cruzan picos ni congelamientos · +1 punto");
    expect(calendarFitMessage({ fits: false, conflicts: [events[0]] }, 1)).toMatch(/"Black Friday"/);
    expect(calendarFitMessage({ fits: null, conflicts: [] }, 1)).toMatch(/Sin fechas/);
  });
});

describe("hipótesis desde un aprendizaje", () => {
  it("separa SI / ENTONCES / PORQUE sin importar mayúsculas ni tildes", () => {
    expect(splitHypothesis("Si enviamos un recordatorio, entonces sube la recarga porque el cliente se acuerda.")).toEqual({
      hypothesis_if: "enviamos un recordatorio",
      hypothesis_then: "sube la recarga",
      hypothesis_because: "el cliente se acuerda",
    });
    expect(splitHypothesis("SÍ mostramos cuotas ENTONCES más compras")).toEqual({
      hypothesis_if: "mostramos cuotas",
      hypothesis_then: "más compras",
      hypothesis_because: "",
    });
  });

  it("sin marcadores, todo va en SI", () => {
    expect(splitHypothesis("Probar cuotas en Equipos")).toEqual({ hypothesis_if: "Probar cuotas en Equipos", hypothesis_then: "", hypothesis_because: "" });
    expect(splitHypothesis(null)).toEqual({ hypothesis_if: "", hypothesis_then: "", hypothesis_because: "" });
  });

  it("llena solo lo vacío y usa el aprendizaje como PORQUE", () => {
    const empty = { hypothesis_if: "", hypothesis_then: "", hypothesis_because: "" };
    expect(
      hypothesisFromLearning(empty, { text: "El recordatorio subió la recarga 12 %.", suggested_hypothesis: "Si recordamos, entonces sube" }),
    ).toEqual({ hypothesis_if: "recordamos", hypothesis_then: "sube", hypothesis_because: "El recordatorio subió la recarga 12 %." });
    expect(
      hypothesisFromLearning({ ...empty, hypothesis_if: "lo mío" }, { text: "Aprendizaje", suggested_hypothesis: null }).hypothesis_if,
    ).toBe("lo mío");
  });
});
