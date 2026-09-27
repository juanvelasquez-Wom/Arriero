// Calendario de pilotos: rango de la línea de tiempo, barras y cruces entre pilotos.
import { addDays, maxDate, minDate } from "../dates";
import type { IsoDate } from "../types";
import { describeOverlap, overlapsFor, type PilotOverlap } from "./overlap";
import type { PilotStatus, PilotSummary } from "./types";

export type CalendarScale = "semana" | "mes";

export function parseCalendarScale(v: string | string[] | undefined): CalendarScale {
  return (Array.isArray(v) ? v[0] : v) === "mes" ? "mes" : "semana";
}

export interface PilotCrossing {
  aId: string;
  aTitle: string;
  bId: string;
  bTitle: string;
  from: IsoDate;
  to: IsoDate;
  /** "Comparten campaña (CTWA Pospago) y ciudad (Medellín)". */
  text: string;
  shared: PilotOverlap["shared"];
}

/** Cada par de pilotos que se cruzan, una sola vez (a antes que b en la lista). */
export function pilotCrossings(pilots: PilotSummary[]): PilotCrossing[] {
  const out: PilotCrossing[] = [];
  pilots.forEach((a, i) => {
    for (const o of overlapsFor(a, pilots.slice(i + 1))) {
      out.push({ aId: a.id, aTitle: a.title, bId: o.otherId, bTitle: o.otherTitle, from: o.from, to: o.to, text: describeOverlap(o), shared: o.shared });
    }
  });
  return out.sort((x, y) => x.from.localeCompare(y.from));
}

/** id del piloto → frases de los cruces en que participa (para marcar las barras). */
export function crossingsByPilot(crossings: PilotCrossing[]): Map<string, { otherTitle: string; text: string }[]> {
  const map = new Map<string, { otherTitle: string; text: string }[]>();
  const push = (id: string, v: { otherTitle: string; text: string }) => map.set(id, [...(map.get(id) ?? []), v]);
  for (const c of crossings) {
    push(c.aId, { otherTitle: c.bTitle, text: c.text });
    push(c.bId, { otherTitle: c.aTitle, text: c.text });
  }
  return map;
}

export interface ScheduleDates {
  status: PilotStatus;
  planned_start: IsoDate | null;
  planned_end: IsoDate | null;
  actual_start: IsoDate | null;
  actual_end: IsoDate | null;
}

const RUNNING: PilotStatus[] = ["in_test", "in_reading"];

/**
 * Fechas reales a dibujar: si el piloto corre y no tiene fin real, la barra
 * llega hasta hoy (o hasta el fin planeado si es posterior) y queda "en curso".
 */
export function actualSpan(p: ScheduleDates, today: IsoDate): { start: IsoDate; end: IsoDate; ongoing: boolean } | null {
  if (!p.actual_start) return null;
  if (p.actual_end) return { start: p.actual_start, end: p.actual_end, ongoing: false };
  if (RUNNING.includes(p.status)) return { start: p.actual_start, end: maxDate(p.actual_start, today)!, ongoing: true };
  return { start: p.actual_start, end: p.actual_start, ongoing: false };
}

/** Rango de la línea de tiempo: todas las fechas y hoy, con una semana de margen a cada lado. */
export function scheduleRange(pilots: ScheduleDates[], today: IsoDate): { start: IsoDate; end: IsoDate } {
  const dates = pilots.flatMap((p) => [p.planned_start, p.planned_end, p.actual_start, p.actual_end]);
  const start = minDate(...dates, today)!;
  const end = maxDate(...dates, today)!;
  const paddedEnd = addDays(end, 7);
  return { start: addDays(start, -7), end: paddedEnd < addDays(start, 60) ? addDays(start, 60) : paddedEnd };
}

/** "del 12 oct al 30 oct" con el formateador que se le pase. */
export function spanText(from: IsoDate, to: IsoDate, fmt: (d: IsoDate) => string): string {
  return from === to ? `el ${fmt(from)}` : `del ${fmt(from)} al ${fmt(to)}`;
}
