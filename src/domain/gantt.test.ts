import { describe, expect, it } from "vitest";
import {
  alternateMonthBands,
  barGeometry,
  boardPixelsPerDay,
  boardRange,
  buildTimeline,
  displaySpan,
  estimateLabelPx,
  ganttScale,
  ganttZoomParam,
  GANTT_ZOOMS,
  labelPlacement,
  monthHeader,
  parseGanttZoom,
  positionOf,
  quarterHeader,
  scrollTargetFor,
  spanProgress,
  spansRange,
  stepScroll,
  timelineColumns,
  weekendBands,
  weekHeader,
} from "./gantt";

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

describe("zoom del tablero", () => {
  it("lee y escribe el parámetro de la URL", () => {
    expect(parseGanttZoom("semana")).toBe("week");
    expect(parseGanttZoom("trimestre")).toBe("quarter");
    expect(parseGanttZoom(null)).toBe("month");
    expect(parseGanttZoom("cualquier cosa")).toBe("month");
    expect(GANTT_ZOOMS.map((z) => ganttZoomParam(z.zoom))).toEqual(["semana", null, "trimestre"]);
  });

  it("el trimestre es el más compacto", () => {
    expect(boardPixelsPerDay("quarter")).toBeLessThan(boardPixelsPerDay("month"));
  });
});

describe("boardRange · margen y meses completos", () => {
  it("cubre fechas y hoy con margen y arranca y termina en mes completo", () => {
    const r = boardRange(["2026-10-10", "2026-12-20", null], "2026-09-28", "month");
    expect(r.start).toBe("2026-09-01");
    expect(r.end).toBe("2027-01-31");
  });

  it("en semana va de lunes a domingo", () => {
    const r = boardRange(["2026-10-07"], "2026-10-07", "week", 14);
    expect(r.start).toBe("2026-09-28");
    expect(r.end).toBe("2026-10-18");
  });

  it("garantiza un mínimo de días", () => {
    const r = boardRange([], "2026-10-15", "month");
    expect(r.start).toBe("2026-10-01");
    expect(r.end).toBe("2026-12-31");
  });
});

describe("encabezados", () => {
  const t = buildTimeline("2026-11-01", "2027-02-28");

  it("meses cortos con el año en el primero y en enero", () => {
    const m = monthHeader(t);
    expect(m.map((c) => c.label)).toEqual(["nov 2026", "dic", "ene 2027", "feb"]);
    expect(m[2].yearStart).toBe(true);
    expect(m[0].title).toBe("noviembre de 2026");
    expect(m.at(-1)!.left + m.at(-1)!.width).toBeCloseTo(100);
  });

  it("trimestres", () => {
    expect(quarterHeader(t).map((c) => c.label)).toEqual(["T4 2026", "T1 2027"]);
  });

  it("semanas con el día del lunes", () => {
    const w = weekHeader(buildTimeline("2026-09-28", "2026-10-18"));
    expect(w.map((c) => c.label)).toEqual(["28", "5", "12"]);
  });

  it("fines de semana y meses alternos", () => {
    const wk = weekendBands(buildTimeline("2026-09-28", "2026-10-11"));
    expect(wk.map((b) => b.key)).toEqual(["2026-10-03", "2026-10-10"]);
    expect(wk[0].width).toBeCloseTo((2 / 14) * 100);
    expect(alternateMonthBands(t).map((b) => b.key)).toEqual(["2026-12-01", "2027-02-01"]);
  });

  it("ganttScale arma lo que corresponde a cada zoom", () => {
    expect(ganttScale("2026-11-01", "2027-02-28", "week", "2026-12-01").weeks).not.toBeNull();
    const q = ganttScale("2026-11-01", "2027-02-28", "quarter", "2030-01-01");
    expect(q.quarters).not.toBeNull();
    expect(q.weeks).toBeNull();
    expect(q.todayLeft).toBeNull();
  });
});

describe("avance, etiquetas y scroll", () => {
  it("en curso con fin planeado futuro: la barra llega al plan y el avance a hoy", () => {
    const s = displaySpan({ ...none, actual_start: "2026-10-01", planned_end: "2026-10-30" }, true, "2026-10-15")!;
    expect(s).toMatchObject({ end: "2026-10-30", ongoing: true, progressUntil: "2026-10-15" });
    expect(spanProgress(s)).toBeCloseTo(50);
    expect(spanProgress({ start: "2026-10-01", end: "2026-10-05", mode: "actual", ongoing: false })).toBeNull();
  });

  it("la etiqueta va adentro si cabe; si no, afuera donde haya espacio; nunca cortada", () => {
    expect(labelPlacement({ left: 10, width: 20 }, 60, 1000)).toBe("inside");
    expect(labelPlacement({ left: 10, width: 2 }, 60, 1000)).toBe("right");
    expect(labelPlacement({ left: 90, width: 5 }, 60, 1000)).toBe("left");
    expect(labelPlacement({ left: 0, width: 100 }, 60, 50)).toBe("none");
    expect(estimateLabelPx("En prueba")).toBeGreaterThan(40);
  });

  it("scroll a una posición sin pasarse de los bordes", () => {
    expect(scrollTargetFor(50, 2000, 800)).toBe(800);
    expect(scrollTargetFor(1, 2000, 800)).toBe(0);
    expect(scrollTargetFor(99, 2000, 800)).toBe(1200);
  });

  it("‹ › saltan al inicio de columna anterior o siguiente", () => {
    const lefts = [0, 25, 50, 75];
    expect(stepScroll(lefts, 1000, 0, 1)).toBe(250);
    expect(stepScroll(lefts, 1000, 300, 1)).toBe(500);
    expect(stepScroll(lefts, 1000, 300, -1)).toBe(250);
    expect(stepScroll(lefts, 1000, 250, -1)).toBe(0);
    expect(stepScroll(lefts, 1000, 900, 1)).toBe(1000);
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
