// Carga manual de datos de un piloto: filas de la grilla (grupo o grupo × ciudad),
// valores ya cargados de un periodo, validación del periodo y de lo escrito, y
// agrupación de lo cargado por periodo. Funciones puras.
import { isMonday, weekStart } from "../dates";
import { parseDecimal, toInputValue } from "../metric-tree";
import type { IsoDate } from "../types";
import type { ImportedValue } from "./data-import";
import type { Granularity, PilotArm, PilotMetricDef } from "./types";

export interface EntryRow {
  key: string;
  arm_id: string;
  arm_name: string;
  is_control: boolean;
  /** Ciudad (geo) o "". */
  unit_label: string;
}

/** Una fila por grupo o, en geo, una por grupo × ciudad (el grupo sin ciudades va completo). */
export function entryRows(arms: readonly PilotArm[], byCity: boolean): EntryRow[] {
  const out: EntryRow[] = [];
  for (const a of arms) {
    const labels = byCity && a.cities.length ? a.cities : [""];
    for (const unit_label of labels) {
      out.push({ key: `${a.id}|${unit_label}`, arm_id: a.id, arm_name: a.name, is_control: a.is_control, unit_label });
    }
  }
  return out;
}

export const cellKey = (rowKey: string, metricId: string) => `${rowKey}|${metricId}`;

export interface StoredValue {
  arm_id: string;
  metric_id: string;
  unit_label: string;
  period_start: IsoDate;
  granularity: Granularity;
  value: number;
}

/** Valores ya cargados de un periodo, como texto para los campos (clave = fila|métrica). */
export function existingForPeriod(stored: readonly StoredValue[], period: IsoDate, granularity: Granularity): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of stored) {
    if (s.period_start !== period || s.granularity !== granularity) continue;
    out[cellKey(`${s.arm_id}|${s.unit_label}`, s.metric_id)] = toInputValue(s.value);
  }
  return out;
}

/** Periodo escrito → periodo válido. En semanas se corre al lunes. */
export function normalizePeriod(date: IsoDate, granularity: Granularity): IsoDate {
  return granularity === "week" ? weekStart(date) : date;
}

/** Error del periodo (o null si sirve). */
export function periodError(
  period: IsoDate | null | undefined,
  granularity: Granularity,
  range: { min: IsoDate; max: IsoDate } | null,
): string | null {
  if (!period) return "Elija la fecha del periodo.";
  if (granularity === "week" && !isMonday(period)) return "Las semanas se cargan desde el lunes: elija un lunes.";
  if (range) {
    // Una semana cuenta si alguno de sus días cae en el piloto.
    const min = granularity === "week" ? weekStart(range.min) : range.min;
    if (period < min || period > range.max) return `La fecha está fuera del piloto: se puede cargar del ${range.min} al ${range.max}.`;
  }
  return null;
}

export interface EntryResult {
  /** Valores que cambian (nuevos o distintos a lo cargado). */
  values: ImportedValue[];
  /** Todos los valores escritos del periodo (para revisar coherencia). */
  all: ImportedValue[];
  /** clave de celda → error. */
  errors: Record<string, string>;
}

/** Lee la grilla: valida números no negativos y deja solo lo que cambia. */
export function readEntry(input: {
  rows: readonly EntryRow[];
  metrics: readonly Pick<PilotMetricDef, "id" | "name">[];
  drafts: Record<string, string>;
  existing: Record<string, string>;
  period: IsoDate;
}): EntryResult {
  const values: ImportedValue[] = [];
  const all: ImportedValue[] = [];
  const errors: Record<string, string> = {};
  for (const row of input.rows) {
    for (const m of input.metrics) {
      const key = cellKey(row.key, m.id);
      const raw = (input.drafts[key] ?? "").trim();
      if (!raw) continue;
      const value = parseDecimal(raw);
      if (value == null || Number.isNaN(value)) {
        errors[key] = `${m.name}: «${raw}» no es un número.`;
        continue;
      }
      if (value < 0) {
        errors[key] = `${m.name}: no se aceptan valores negativos.`;
        continue;
      }
      const v: ImportedValue = { arm_id: row.arm_id, metric_id: m.id, unit_label: row.unit_label, period_start: input.period, value };
      all.push(v);
      const before = parseDecimal(input.existing[key] ?? "");
      if (before == null || Number.isNaN(before) || before !== value) values.push(v);
    }
  }
  return { values, all, errors };
}

/** Agrupa lo cargado por periodo (y granularidad), del más reciente al más antiguo. */
export function groupByPeriod<T extends { period_start: IsoDate; granularity: Granularity }>(
  rows: readonly T[],
): { period: IsoDate; granularity: Granularity; rows: T[] }[] {
  const map = new Map<string, { period: IsoDate; granularity: Granularity; rows: T[] }>();
  for (const r of rows) {
    const k = `${r.period_start}|${r.granularity}`;
    const g = map.get(k) ?? { period: r.period_start, granularity: r.granularity, rows: [] };
    g.rows.push(r);
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => (a.period === b.period ? a.granularity.localeCompare(b.granularity) : a.period < b.period ? 1 : -1));
}

/** Periodo que se propone al abrir la carga: hoy dentro del rango (lunes en semanas). */
export function defaultPeriod(today: IsoDate, granularity: Granularity, range: { min: IsoDate; max: IsoDate } | null): IsoDate {
  let d = today;
  if (range) {
    if (d > range.max) d = range.max;
    if (d < range.min) d = range.min;
  }
  return normalizePeriod(d, granularity);
}
