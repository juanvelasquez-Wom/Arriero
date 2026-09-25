// Utilidades de fechas sin hora (YYYY-MM-DD), en UTC para evitar corrimientos.
import type { IsoDate } from "./types";

const DAY_MS = 86_400_000;

export function parseIsoDate(date: IsoDate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIsoDate(new Date(parseIsoDate(date).getTime() + days * DAY_MS));
}

/** Días entre dos fechas (b − a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((parseIsoDate(b).getTime() - parseIsoDate(a).getTime()) / DAY_MS);
}

/** Lunes de la semana (ISO) que contiene la fecha. */
export function weekStart(date: IsoDate): IsoDate {
  const d = parseIsoDate(date);
  const isoDow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return addDays(date, 1 - isoDow);
}

export function isMonday(date: IsoDate): boolean {
  return parseIsoDate(date).getUTCDay() === 1;
}

/** Lista de lunes desde la semana de `from` hasta la semana de `to`, inclusive. */
export function mondaysBetween(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  let cur = weekStart(from);
  const end = weekStart(to);
  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 7);
  }
  return out;
}

/** Fecha de hoy en Bogotá como YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function rangesOverlap(aStart: IsoDate, aEnd: IsoDate, bStart: IsoDate, bEnd: IsoDate): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function isWithin(date: IsoDate, start: IsoDate, end: IsoDate): boolean {
  return date >= start && date <= end;
}

export function minDate(...dates: (IsoDate | null | undefined)[]): IsoDate | null {
  const valid = dates.filter((d): d is IsoDate => !!d);
  return valid.length ? valid.reduce((a, b) => (a < b ? a : b)) : null;
}

export function maxDate(...dates: (IsoDate | null | undefined)[]): IsoDate | null {
  const valid = dates.filter((d): d is IsoDate => !!d);
  return valid.length ? valid.reduce((a, b) => (a > b ? a : b)) : null;
}
