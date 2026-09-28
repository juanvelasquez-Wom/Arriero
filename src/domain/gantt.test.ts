import { describe, expect, it } from "vitest";
import { barGeometry, boardPixelsPerDay, buildTimeline, displaySpan, positionOf, spansRange, timelineColumns } from "./gantt";

const none = { planned_start: null, planned_end: null, actual_start: null, actual_end: null };

describe("línea de tiempo", () => {
  const t = buildTimeline("2026-10-01", "2026-10-10");

  it("cuenta los días inclusivos y ubica fechas en %", () => {
    expect(t.totalDays).toBe(10);
    expect(positionOf(t, "2026-10-01")).toBe(0);
    expect(positionOf(t, "2026-10-06")).toBe(50);
  });

  it("recorta barras al rango y descarta las de afuera", () => {
    expect(barGeometry(t, "2026-09-20", "2026-10-05")).toEqual({ left: 0, width: 50 });
    expect(barGeometry(t, "2026-11-01", "2026-11-05")).toBeNull();
    expect(barGeometry(t, null, null)).toBeNull();
  });

  it("arma columnas por mes", () => {
    const cols = timelineColumns(buildTimeline("2026-10-15", "2026-11-20"), "month", (d) => d.slice(0, 7));
    expect(cols.map((c) => c.label)).toEqual(["2026-10", "2026-11"]);
    expect(cols[0].left).toBe(0);
  });

  it("el mes es más compacto que la semana", () => {
    expect(boardPixelsPerDay("month")).toBeLessThan(boardPixelsPerDay("week"));
  });
});

describe("displaySpan · una sola barra", () => {
  const today = "2026-10-20";

  it("sin fechas no hay barra", () => {
    expect(displaySpan(none, false, today)).toBeNull();
  });

  it("sin arrancar muestra lo planeado", () => {
    expect(displaySpan({ ...none, planned_start: "2026-11-01", planned_end: "2026-11-20" }, false, today)).toEqual({
      start: "2026-11-01",
      end: "2026-11-20",
      mode: "planned",
      ongoing: false,
    });
  });

  it("con fechas reales gana lo real", () => {
    const s = displaySpan(
      { planned_start: "2026-10-01", planned_end: "2026-10-15", actual_start: "2026-10-03", actual_end: "2026-10-18" },
      false,
      today,
    );
    expect(s).toMatchObject({ start: "2026-10-03", end: "2026-10-18", mode: "actual", ongoing: false });
  });

  it("en curso llega hasta hoy", () => {
    expect(displaySpan({ ...none, actual_start: "2026-10-05" }, true, today)).toMatchObject({ end: today, ongoing: true });
  });

  it("arrancado sin fin real y quieto usa el fin planeado", () => {
    expect(displaySpan({ ...none, actual_start: "2026-10-05", planned_end: "2026-10-12" }, false, today)).toMatchObject({
      end: "2026-10-12",
      ongoing: false,
    });
  });
});

describe("spansRange", () => {
  it("incluye hoy, deja margen y al menos 90 días", () => {
    const r = spansRange([{ start: "2026-10-10", end: "2026-10-12" }, null], "2026-10-01");
    expect(r.start).toBe("2026-09-24");
    expect(r.end).toBe("2026-12-23");
  });

  it("se estira con barras largas", () => {
    const r = spansRange([{ start: "2026-01-01", end: "2026-12-31" }], "2026-06-01");
    expect(r.start).toBe("2025-12-25");
    expect(r.end).toBe("2027-01-14");
  });
});
