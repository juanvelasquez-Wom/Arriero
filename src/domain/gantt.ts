// Geometría del Gantt: escala de tiempo y posición de barras en porcentaje.
import { addDays, daysBetween, maxDate, minDate, mondaysBetween, parseIsoDate, toIsoDate, weekStart } from "./dates";
import { freezesOverlapping } from "./calendar";
import type { CalendarEvent, IsoDate } from "./types";

export type GanttZoom = "week" | "month" | "quarter";

/** Zoom de la URL (`?zoom=semana|trimestre`); el mes es el de siempre. */
export function parseGanttZoom(param: string | null | undefined): GanttZoom {
  return param === "semana" ? "week" : param === "trimestre" ? "quarter" : "month";
}

/** Valor de `?zoom=` para un zoom; null = el de por defecto (mes). */
export function ganttZoomParam(zoom: GanttZoom): string | null {
  return zoom === "week" ? "semana" : zoom === "quarter" ? "trimestre" : null;
}

export const GANTT_ZOOMS: readonly { zoom: GanttZoom; label: string }[] = [
  { zoom: "week", label: "Semana" },
  { zoom: "month", label: "Mes" },
  { zoom: "quarter", label: "Trimestre" },
];

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
      : zoom === "quarter"
        ? quarterStarts(timeline.start, timeline.end)
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

function quarterStarts(start: IsoDate, end: IsoDate): IsoDate[] {
  const d = parseIsoDate(start);
  const q = Math.floor(d.getUTCMonth() / 3) * 3;
  return monthStarts(toIsoDate(new Date(Date.UTC(d.getUTCFullYear(), q, 1))), end).filter((m) => (Number(m.slice(5, 7)) - 1) % 3 === 0);
}

/** Ancho mínimo en píxeles por día según el zoom (para scroll horizontal). */
export function pixelsPerDay(zoom: GanttZoom): number {
  return zoom === "week" ? 14 : zoom === "quarter" ? 2 : 4;
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
  return zoom === "week" ? 22 : zoom === "quarter" ? 2.4 : 7;
}

export interface DisplaySpan {
  start: IsoDate;
  end: IsoDate;
  /** `actual` = relleno; `planned` = contorno punteado (todavía no arranca). */
  mode: "actual" | "planned";
  /** En curso: sin fin real, la barra llega hasta hoy (o hasta el fin planeado, si es posterior). */
  ongoing: boolean;
  /** En curso con fin planeado futuro: hasta aquí va el avance (hoy); el resto es lo que falta. */
  progressUntil?: IsoDate;
}

/**
 * Una sola barra por ítem: la real si ya arrancó (si sigue en curso, hasta el fin
 * planeado con el avance hasta hoy, o hasta hoy si no hay plan), si no, la planeada.
 * Null si no tiene fechas.
 */
export function displaySpan(
  item: { planned_start: IsoDate | null; planned_end: IsoDate | null; actual_start: IsoDate | null; actual_end: IsoDate | null },
  running: boolean,
  today: IsoDate,
): DisplaySpan | null {
  if (item.actual_start) {
    const start = item.actual_start;
    if (item.actual_end) return { start, end: maxDate(start, item.actual_end)!, mode: "actual", ongoing: false };
    if (running) {
      const upTo = maxDate(start, today)!;
      if (item.planned_end && item.planned_end > upTo) {
        return { start, end: item.planned_end, mode: "actual", ongoing: true, progressUntil: upTo };
      }
      return { start, end: upTo, mode: "actual", ongoing: true };
    }
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

// ---------------------------------------------------------------------------
// Tablero Gantt (programa y general): rango con margen, encabezados legibles,
// franjas de fondo, avance y ubicación de etiquetas. Todo en % del ancho.
// ---------------------------------------------------------------------------

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const MONTH_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function monthIndex(d: IsoDate): number {
  return Number(d.slice(5, 7)) - 1;
}

function lastDayOfMonth(d: IsoDate): IsoDate {
  const x = parseIsoDate(d);
  return toIsoDate(new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)));
}

function firstDayOfMonth(d: IsoDate): IsoDate {
  return `${d.slice(0, 7)}-01`;
}

/** Margen en días a cada lado según el zoom: que ninguna barra quede pegada al borde. */
export function rangePadding(zoom: GanttZoom): number {
  return zoom === "week" ? 7 : zoom === "quarter" ? 30 : 14;
}

/**
 * Rango del tablero: cubre todas las fechas y hoy, con margen a ambos lados y
 * ajustado a meses completos (lunes a domingo en la vista por semana), para que
 * el encabezado nunca arranque ni termine con un mes cortado.
 */
export function boardRange(
  dates: (IsoDate | null | undefined)[],
  today: IsoDate,
  zoom: GanttZoom,
  minDays = 90,
): { start: IsoDate; end: IsoDate } {
  const pad = rangePadding(zoom);
  const from = addDays(minDate(today, ...dates)!, -pad);
  let to = addDays(maxDate(today, ...dates)!, pad);
  if (daysBetween(from, to) < minDays) to = addDays(from, minDays);
  if (zoom === "week") {
    const start = weekStart(from);
    return { start, end: addDays(weekStart(to), 6) };
  }
  return { start: firstDayOfMonth(from), end: lastDayOfMonth(to) };
}

export interface HeaderCell {
  key: string;
  /** Texto corto del encabezado (p. ej. "oct", "ene 2027", "T4 2026", "12"). */
  label: string;
  /** Texto completo para el title y lectores de pantalla. */
  title: string;
  left: number;
  width: number;
  /** Arranca un año nuevo (se marca con una línea más fuerte). */
  yearStart?: boolean;
}

/** Meses con nombre corto; el año aparece en el primero y en cada enero. */
export function monthHeader(timeline: Timeline): HeaderCell[] {
  return timelineColumns(timeline, "month", (d) => d).map((c, i) => {
    const m = monthIndex(c.start);
    const year = c.start.slice(0, 4);
    return {
      key: c.key,
      label: i === 0 || m === 0 ? `${MONTH_SHORT[m]} ${year}` : MONTH_SHORT[m],
      title: `${MONTH_LONG[m]} de ${year}`,
      left: c.left,
      width: c.width,
      yearStart: i > 0 && m === 0,
    };
  });
}

/** Trimestres: "T4 2026". */
export function quarterHeader(timeline: Timeline): HeaderCell[] {
  return timelineColumns(timeline, "quarter", (d) => d).map((c, i) => {
    const q = Math.floor(monthIndex(c.start) / 3) + 1;
    const year = c.start.slice(0, 4);
    return { key: c.key, label: `T${q} ${year}`, title: `Trimestre ${q} de ${year}`, left: c.left, width: c.width, yearStart: i > 0 && q === 1 };
  });
}

/** Semanas: el día del lunes ("5", "12"…). */
export function weekHeader(timeline: Timeline): HeaderCell[] {
  return timelineColumns(timeline, "week", (d) => d).map((c) => {
    const day = Number(c.start.slice(8, 10));
    return {
      key: c.key,
      label: String(day),
      title: `Semana del ${day} de ${MONTH_LONG[monthIndex(c.start)]} de ${c.start.slice(0, 4)}`,
      left: c.left,
      width: c.width,
    };
  });
}

export interface Band {
  key: string;
  left: number;
  width: number;
}

/** Fines de semana (sábado y domingo) dentro del rango, para sombrear en la vista por semana. */
export function weekendBands(timeline: Timeline): Band[] {
  const out: Band[] = [];
  let cur = timeline.start;
  const dow = (d: IsoDate) => parseIsoDate(d).getUTCDay();
  while (dow(cur) !== 6 && dow(cur) !== 0) cur = addDays(cur, 1);
  while (cur <= timeline.end) {
    const len = dow(cur) === 6 ? 2 : 1;
    const g = barGeometry(timeline, cur, addDays(cur, len - 1));
    if (g) out.push({ key: cur, left: g.left, width: g.width });
    cur = addDays(cur, len === 2 ? 7 : 6);
  }
  return out;
}

/** Meses alternos (uno sí, uno no) para una franja de fondo suave. */
export function alternateMonthBands(timeline: Timeline): Band[] {
  return monthHeader(timeline)
    .filter((c) => monthIndex(c.key) % 2 === 1)
    .map((c) => ({ key: c.key, left: c.left, width: c.width }));
}

/** Posición de "hoy" en el centro del día, o null si queda fuera del rango. */
export function todayPosition(timeline: Timeline, today: IsoDate): number | null {
  if (today < timeline.start || today > timeline.end) return null;
  return positionOf(timeline, today) + 100 / timeline.totalDays / 2;
}

/** Avance (0–100 % del ancho de la barra) de un ítem en curso con fin planeado futuro. */
export function spanProgress(span: DisplaySpan): number | null {
  if (!span.progressUntil) return null;
  const total = daysBetween(span.start, span.end) + 1;
  const done = daysBetween(span.start, span.progressUntil) + 1;
  return Math.min(100, Math.max(0, (done / total) * 100));
}

/** Ancho aproximado en píxeles de una etiqueta corta (Inter semibold). */
export function estimateLabelPx(text: string, fontPx = 11): number {
  return Math.ceil(text.length * fontPx * 0.6);
}

export type LabelPlacement = "inside" | "right" | "left" | "none";

/**
 * Dónde va la etiqueta de una barra para que nunca quede cortada: adentro si
 * cabe; si no, a la derecha si hay espacio; si no, a la izquierda; y si tampoco,
 * no se pinta (queda en el title y el aria-label).
 */
export function labelPlacement(
  bar: { left: number; width: number },
  labelPx: number,
  trackPx: number,
  insidePad = 30,
  outsidePad = 10,
): LabelPlacement {
  const barPx = (bar.width / 100) * trackPx;
  if (barPx >= labelPx + insidePad) return "inside";
  const rightRoom = trackPx - ((bar.left + bar.width) / 100) * trackPx;
  if (rightRoom >= labelPx + outsidePad) return "right";
  const leftRoom = (bar.left / 100) * trackPx;
  if (leftRoom >= labelPx + outsidePad) return "left";
  return "none";
}

export interface GanttScale {
  timeline: Timeline;
  zoom: GanttZoom;
  /** Ancho mínimo de la pista; en pantalla se estira si sobra espacio. */
  widthPx: number;
  months: HeaderCell[];
  weeks: HeaderCell[] | null;
  quarters: HeaderCell[] | null;
  /** Franjas de fondo: fines de semana (semana) o meses alternos (mes y trimestre). */
  bands: Band[];
  todayLeft: number | null;
}

/** Todo lo que el tablero necesita para dibujar la escala de tiempo. */
export function ganttScale(start: IsoDate, end: IsoDate, zoom: GanttZoom, today: IsoDate): GanttScale {
  const timeline = buildTimeline(start, end);
  return {
    timeline,
    zoom,
    widthPx: Math.round(timeline.totalDays * boardPixelsPerDay(zoom)),
    months: monthHeader(timeline),
    weeks: zoom === "week" ? weekHeader(timeline) : null,
    quarters: zoom === "quarter" ? quarterHeader(timeline) : null,
    bands: zoom === "week" ? weekendBands(timeline) : alternateMonthBands(timeline),
    todayLeft: todayPosition(timeline, today),
  };
}

/** Scroll para mostrar una posición (en %) a un cuarto de la vista, sin pasarse de los bordes. */
export function scrollTargetFor(positionPct: number, trackPx: number, viewportPx: number, anchor = 0.25): number {
  const x = (positionPct / 100) * trackPx - viewportPx * anchor;
  return Math.round(Math.min(Math.max(0, x), Math.max(0, trackPx - viewportPx)));
}

/** Siguiente (o anterior) inicio de columna desde un scroll dado, para los botones ‹ ›. */
export function stepScroll(columnLefts: number[], trackPx: number, scrollLeft: number, direction: 1 | -1): number {
  const xs = columnLefts.map((l) => Math.round((l / 100) * trackPx)).sort((a, b) => a - b);
  if (direction === 1) return xs.find((x) => x > scrollLeft + 2) ?? trackPx;
  return [...xs].reverse().find((x) => x < scrollLeft - 2) ?? 0;
}
