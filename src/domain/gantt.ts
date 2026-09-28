// Geometría del Gantt: escala de tiempo y posición de barras en porcentaje.
import { addDays, daysBetween, maxDate, minDate, mondaysBetween, parseIsoDate, toIsoDate } from "./dates";
import { freezesOverlapping } from "./calendar";
import type { CalendarEvent, IsoDate } from "./types";

export type GanttZoom = "week" | "month";

export interface Timeline {
  start: IsoDate;
  end: IsoDate;
  totalDays: number;
}

export function buildTimeline(start: IsoDate, end: IsoDate): Timeline {
  const safeEnd = end >= start ? end : start;
  return { start, end: safeEnd, totalDays: daysBetween(start, safeEnd) + 1 };
}

/** Posición (0–100) del inicio de un día en la línea de tiempo. */
export function positionOf(timeline: Timeline, date: IsoDate): number {
  const d = daysBetween(timeline.start, date);
  return Math.min(100, Math.max(0, (d / timeline.totalDays) * 100));
}

/** left/width en % para un rango [start, end] inclusivo; null si queda fuera. */
export function barGeometry(timeline: Timeline, start: IsoDate | null, end: IsoDate | null) {
  if (!start) return null;
  const e = end && end >= start ? end : start;
  if (e < timeline.start || start > timeline.end) return null;
  const left = positionOf(timeline, start < timeline.start ? timeline.start : start);
  const right = positionOf(timeline, addDays(e > timeline.end ? timeline.end : e, 1));
  return { left, width: Math.max(right - left, 0.4) };
}

export interface TimelineColumn {
  key: string;
  start: IsoDate;
  label: string;
  left: number;
  width: number;
}

export function timelineColumns(
  timeline: Timeline,
  zoom: GanttZoom,
  formatLabel: (d: IsoDate) => string,
): TimelineColumn[] {
  const starts: IsoDate[] =
    zoom === "week"
      ? mondaysBetween(timeline.start, timeline.end)
      : monthStarts(timeline.start, timeline.end);
  return starts.map((s, i) => {
    const next = starts[i + 1] ?? addDays(timeline.end, 1);
    const clampedStart = s < timeline.start ? timeline.start : s;
    const left = positionOf(timeline, clampedStart);
    const right = next > timeline.end ? 100 : positionOf(timeline, next);
    return { key: s, start: s, label: formatLabel(s), left, width: right - left };
  });
}

function monthStarts(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  const d = parseIsoDate(start);
  let cur = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  while (toIsoDate(cur) <= end) {
    out.push(toIsoDate(cur));
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return out;
}

/** Ancho mínimo en píxeles por día según el zoom (para scroll horizontal). */
export function pixelsPerDay(zoom: GanttZoom): number {
  return zoom === "week" ? 14 : 4;
}

/** ¿El ejercicio (planeado o real) se cruza con un congelamiento? */
export function crossesFreeze(
  exp: { planned_start: IsoDate | null; planned_end: IsoDate | null; actual_start: IsoDate | null; actual_end: IsoDate | null },
  events: CalendarEvent[],
): CalendarEvent[] {
  const planned = freezesOverlapping({ start: exp.planned_start, end: exp.planned_end }, events);
  const actual = freezesOverlapping({ start: exp.actual_start, end: exp.actual_end }, events);
  const all = [...planned, ...actual];
  return all.filter((e, i) => all.findIndex((x) => x.id === e.id) === i);
}

/** Píxeles por día de los tableros simplificados: el mes es la vista por defecto. */
export function boardPixelsPerDay(zoom: GanttZoom): number {
  return zoom === "week" ? 16 : 6;
}

export interface DisplaySpan {
  start: IsoDate;
  end: IsoDate;
  /** `actual` = relleno; `planned` = contorno punteado (todavía no arranca). */
  mode: "actual" | "planned";
  /** En curso: sin fin real, la barra llega hasta hoy. */
  ongoing: boolean;
}

/**
 * Una sola barra por ítem: la real si ya arrancó (hasta hoy si sigue en curso),
 * si no, la planeada. Null si no tiene fechas.
 */
export function displaySpan(
  item: { planned_start: IsoDate | null; planned_end: IsoDate | null; actual_start: IsoDate | null; actual_end: IsoDate | null },
  running: boolean,
  today: IsoDate,
): DisplaySpan | null {
  if (item.actual_start) {
    const start = item.actual_start;
    if (item.actual_end) return { start, end: maxDate(start, item.actual_end)!, mode: "actual", ongoing: false };
    if (running) return { start, end: maxDate(start, today)!, mode: "actual", ongoing: true };
    // Arrancó pero no tiene fin real ni sigue corriendo: se usa el fin planeado si sirve.
    return { start, end: maxDate(start, item.planned_end)!, mode: "actual", ongoing: false };
  }
  if (item.planned_start) {
    return { start: item.planned_start, end: maxDate(item.planned_start, item.planned_end)!, mode: "planned", ongoing: false };
  }
  return null;
}

/** Rango de la línea de tiempo para varias barras y hoy, con margen y un mínimo de ~3 meses. */
export function spansRange(spans: ({ start: IsoDate; end: IsoDate } | null)[], today: IsoDate): { start: IsoDate; end: IsoDate } {
  const valid = spans.filter((s): s is { start: IsoDate; end: IsoDate } => !!s);
  const start = addDays(minDate(today, ...valid.map((s) => s.start))!, -7);
  const end = addDays(maxDate(today, ...valid.map((s) => s.end))!, 14);
  return { start, end: daysBetween(start, end) < 90 ? addDays(start, 90) : end };
}
