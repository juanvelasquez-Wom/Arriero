// Formato es-CO para números, porcentajes y fechas.
import { parseIsoDate } from "./dates";
import type { IsoDate } from "./types";

const numberFmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatNumber(value: number | null | undefined, fallback = "—"): string {
  return value == null || !Number.isFinite(value) ? fallback : numberFmt.format(value);
}

export function formatScore(value: number | null | undefined, fallback = "—"): string {
  return value == null ? fallback : oneDecimal.format(value);
}

/** 0.278 → "27,8 %" */
export function formatPercent(ratio: number | null | undefined, fallback = "—"): string {
  return ratio == null || !Number.isFinite(ratio) ? fallback : `${oneDecimal.format(ratio * 100)} %`;
}

/** 0.278 → "+27,8 %" */
export function formatSignedPercent(ratio: number | null | undefined, fallback = "—"): string {
  if (ratio == null || !Number.isFinite(ratio)) return fallback;
  const sign = ratio > 0 ? "+" : ratio < 0 ? "−" : "";
  return `${sign}${oneDecimal.format(Math.abs(ratio) * 100)} %`;
}

export function formatMetricValue(value: number | null | undefined, unit?: string | null): string {
  if (value == null) return "—";
  if (unit === "%") return `${numberFmt.format(value)} %`;
  if (unit === "COP") return `$ ${numberFmt.format(value)}`;
  return unit ? `${numberFmt.format(value)} ${unit}` : numberFmt.format(value);
}

const dateFmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDateFmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("es-CO", { month: "short", year: "2-digit", timeZone: "UTC" });

export function formatDate(date: IsoDate | null | undefined, fallback = "—"): string {
  return date ? dateFmt.format(parseIsoDate(date)) : fallback;
}

export function formatShortDate(date: IsoDate | null | undefined, fallback = "—"): string {
  return date ? shortDateFmt.format(parseIsoDate(date)) : fallback;
}

export function formatMonth(date: IsoDate): string {
  return monthFmt.format(parseIsoDate(date));
}

export function formatDateTime(ts: string | null | undefined, fallback = "—"): string {
  if (!ts) return fallback;
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(ts));
}

export function formatDateRange(start: IsoDate | null, end: IsoDate | null): string {
  if (!start && !end) return "Sin fechas";
  return `${formatShortDate(start, "?")} – ${formatDate(end, "?")}`;
}
