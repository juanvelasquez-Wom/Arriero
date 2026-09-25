// Reglas 5 y 7 · Congelamientos y duración mínima.
import { addDays, daysBetween, isWithin, rangesOverlap } from "./dates";
import type { CalendarEvent, IsoDate } from "./types";

export interface DateRange {
  start: IsoDate | null;
  end: IsoDate | null;
}

/** Congelamientos que se cruzan con el rango (si falta el fin, se usa el inicio). */
export function freezesOverlapping(range: DateRange, events: CalendarEvent[]): CalendarEvent[] {
  if (!range.start) return [];
  const end = range.end && range.end >= range.start ? range.end : range.start;
  return events.filter((e) => e.type === "freeze" && rangesOverlap(range.start!, end, e.start_date, e.end_date));
}

/** Congelamiento que contiene la fecha de inicio (bloquea el paso a En prueba). */
export function freezeContaining(date: IsoDate | null, events: CalendarEvent[]): CalendarEvent | null {
  if (!date) return null;
  return events.find((e) => e.type === "freeze" && isWithin(date, e.start_date, e.end_date)) ?? null;
}

/** Rango planeado de un ejercicio: si no hay fin, se estima con la duración mínima. */
export function plannedRange(input: {
  planned_start: IsoDate | null;
  planned_end: IsoDate | null;
  min_duration_days?: number | null;
}): DateRange {
  const start = input.planned_start;
  let end = input.planned_end;
  if (start && !end && input.min_duration_days) end = addDays(start, input.min_duration_days - 1);
  return { start, end };
}

export function freezeWarning(range: DateRange, events: CalendarEvent[]): string | null {
  const hits = freezesOverlapping(range, events);
  if (!hits.length) return null;
  const names = hits.map((h) => `"${h.name}"`).join(", ");
  return `Las fechas se cruzan con ${hits.length === 1 ? "el congelamiento" : "los congelamientos"} ${names}. En congelamiento no se lanzan ejercicios.`;
}

/**
 * Regla 7: advertencia si el ejercicio se cierra antes de la duración mínima.
 * La duración se cuenta en días calendario incluyendo el día de inicio.
 */
export function durationWarning(input: {
  actual_start: IsoDate | null;
  actual_end: IsoDate | null;
  min_duration_days: number | null;
}): string | null {
  const { actual_start, actual_end, min_duration_days } = input;
  if (!actual_start || !actual_end || !min_duration_days) return null;
  const ran = daysBetween(actual_start, actual_end) + 1;
  if (ran >= min_duration_days) return null;
  return `El ejercicio corrió ${ran} día(s) y la duración mínima es de ${min_duration_days}. Leerlo antes de tiempo puede llevar a una conclusión equivocada.`;
}

/** Punto de decisión más próximo (o el primero, si ya pasaron todos). */
export function decisionPoint(events: CalendarEvent[]): CalendarEvent | null {
  const decisions = events.filter((e) => e.type === "decision").sort((a, b) => a.start_date.localeCompare(b.start_date));
  return decisions[0] ?? null;
}
