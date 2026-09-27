// Carga de datos de un piloto por CSV: plantilla según las métricas del piloto
// y lectura con validaciones (fechas dentro del piloto, grupos y ciudades que
// existen, números no negativos, semanas en lunes). Funciones puras.
import { toCsv } from "../csv";
import { addDays, isMonday, parseIsoDate, toIsoDate } from "../dates";
import { parseDecimal } from "../metric-tree";
import { normalizeName } from "../paste-import";
import type { IsoDate } from "../types";
import type { Granularity, PilotArm, PilotMetricDef } from "./types";

/** Métricas que se cargan a mano para calcular la principal y los guardrails. */
export function baseMetricsFor(metricIds: string[], catalog: PilotMetricDef[]): PilotMetricDef[] {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const out = new Map<string, PilotMetricDef>();
  const add = (id: string | null) => {
    const m = id ? byId.get(id) : undefined;
    if (!m) return;
    if (m.calc === "sum") out.set(m.id, m);
    else {
      add(m.numerator_id);
      add(m.denominator_id);
    }
  };
  metricIds.forEach(add);
  // La inversión siempre se pide: sin ella no hay costo por resultado.
  const spend = catalog.find((m) => m.is_spend && m.calc === "sum");
  if (spend) out.set(spend.id, spend);
  return [...out.values()];
}

export interface ImportContext {
  arms: PilotArm[];
  metrics: PilotMetricDef[];
  /** Pruebas por geografía: se carga por ciudad. */
  byCity: boolean;
  granularity: Granularity;
  /** Rango permitido (incluye el periodo previo en geo y antes/después). */
  minDate: IsoDate;
  maxDate: IsoDate;
}

const DATE_HEADERS = new Set(["fecha", "periodo", "dia", "semana", "date"]);
const ARM_HEADERS = new Set(["grupo", "variante", "brazo", "group"]);
const CITY_HEADERS = new Set(["ciudad", "city", "municipio"]);

/** Plantilla CSV con una fila de ejemplo por grupo (o ciudad) en la primera fecha. */
export function buildTemplate(ctx: ImportContext): string {
  type Row = { date: string; arm: string; city: string };
  const rows: Row[] = [];
  for (const arm of ctx.arms) {
    if (ctx.byCity && arm.cities.length) arm.cities.forEach((city) => rows.push({ date: ctx.minDate, arm: arm.name, city }));
    else rows.push({ date: ctx.minDate, arm: arm.name, city: "" });
  }
  const columns = [
    { header: ctx.granularity === "week" ? "Semana (lunes)" : "Fecha", value: (r: Row) => r.date },
    { header: "Grupo", value: (r: Row) => r.arm },
    ...(ctx.byCity ? [{ header: "Ciudad", value: (r: Row) => r.city }] : []),
    ...ctx.metrics.map((m) => ({ header: m.name, value: () => "" })),
  ];
  return toCsv(rows, columns);
}

/** Parte un CSV en filas y celdas: detecta ";", tabulador o ",", y respeta comillas. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

/** Fecha "2026-10-05", "05/10/2026" o "5-10-2026" → ISO; null si no es válida. */
export function parseDateCell(raw: string): IsoDate | null {
  const s = raw.trim();
  let iso: string | null = null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (!iso) return null;
  const d = parseIsoDate(iso);
  return Number.isNaN(d.getTime()) || toIsoDate(d) !== iso ? null : iso;
}

export interface ImportedValue {
  arm_id: string;
  metric_id: string;
  unit_label: string;
  period_start: IsoDate;
  value: number;
}

export interface ImportIssue {
  /** Línea del archivo (1 = encabezado). */
  line: number;
  message: string;
}

export interface ImportResult {
  values: ImportedValue[];
  issues: ImportIssue[];
  /** Columnas del archivo que no se reconocieron (se ignoran). */
  ignoredColumns: string[];
}

export function readImport(text: string, ctx: ImportContext): ImportResult {
  const rows = parseCsv(text);
  const issues: ImportIssue[] = [];
  const values: ImportedValue[] = [];
  if (rows.length < 2) return { values, issues: [{ line: 1, message: "El archivo está vacío o solo trae el encabezado." }], ignoredColumns: [] };

  const header = rows[0].map(normalizeName);
  const dateCol = header.findIndex((h) => DATE_HEADERS.has(h.split(" ")[0]));
  const armCol = header.findIndex((h) => ARM_HEADERS.has(h));
  const cityCol = header.findIndex((h) => CITY_HEADERS.has(h));
  if (dateCol < 0) issues.push({ line: 1, message: "Falta la columna Fecha." });
  if (armCol < 0) issues.push({ line: 1, message: "Falta la columna Grupo." });
  if (ctx.byCity && cityCol < 0) issues.push({ line: 1, message: "Falta la columna Ciudad (esta prueba se carga por ciudad)." });
  const metricCols = new Map<number, PilotMetricDef>();
  const ignoredColumns: string[] = [];
  header.forEach((h, i) => {
    if (i === dateCol || i === armCol || i === cityCol) return;
    const m = ctx.metrics.find((x) => normalizeName(x.name) === h);
    if (m) metricCols.set(i, m);
    else if (rows[0][i]) ignoredColumns.push(rows[0][i]);
  });
  if (!metricCols.size) issues.push({ line: 1, message: "No se encontró ninguna columna de métrica del piloto." });
  if (issues.length) return { values, issues, ignoredColumns };

  const arms = new Map(ctx.arms.map((a) => [normalizeName(a.name), a]));
  const seen = new Set<string>();
  rows.slice(1).forEach((cells, idx) => {
    const line = idx + 2;
    const date = parseDateCell(cells[dateCol] ?? "");
    if (!date) return issues.push({ line, message: `Fecha inválida: «${cells[dateCol] ?? ""}».` });
    if (date < ctx.minDate || date > ctx.maxDate) {
      return issues.push({ line, message: `La fecha ${date} está fuera del piloto (${ctx.minDate} a ${ctx.maxDate}).` });
    }
    if (ctx.granularity === "week" && !isMonday(date)) return issues.push({ line, message: `La semana ${date} no empieza en lunes.` });
    const arm = arms.get(normalizeName(cells[armCol] ?? ""));
    if (!arm) return issues.push({ line, message: `El grupo «${cells[armCol] ?? ""}» no existe en este piloto.` });
    let city = "";
    if (ctx.byCity) {
      const raw = (cells[cityCol] ?? "").trim();
      const match = arm.cities.find((c) => normalizeName(c) === normalizeName(raw));
      if (!match) return issues.push({ line, message: `La ciudad «${raw}» no está en el grupo ${arm.name}.` });
      city = match;
    }
    for (const [col, metric] of metricCols) {
      const raw = (cells[col] ?? "").trim();
      if (!raw) continue;
      const value = parseDecimal(raw);
      if (value == null || Number.isNaN(value)) {
        issues.push({ line, message: `${metric.name}: «${raw}» no es un número.` });
        continue;
      }
      if (value < 0) {
        issues.push({ line, message: `${metric.name}: no se aceptan valores negativos.` });
        continue;
      }
      const key = `${arm.id}|${metric.id}|${city}|${date}`;
      if (seen.has(key)) {
        issues.push({ line, message: `${metric.name} de ${arm.name}${city ? ` (${city})` : ""} el ${date} está repetido.` });
        continue;
      }
      seen.add(key);
      values.push({ arm_id: arm.id, metric_id: metric.id, unit_label: city, period_start: date, value });
    }
  });
  return { values, issues, ignoredColumns };
}

/** Totales coherentes: el numerador de una tasa no puede superar su base. */
export function coherenceIssues(values: ImportedValue[], metrics: PilotMetricDef[], catalog: PilotMetricDef[]): string[] {
  const out: string[] = [];
  const sums = new Map<string, number>();
  for (const v of values) {
    const k = `${v.arm_id}|${v.unit_label}|${v.metric_id}`;
    sums.set(k, (sums.get(k) ?? 0) + v.value);
  }
  const names = new Map(catalog.map((m) => [m.id, m.name]));
  const groups = new Set(values.map((v) => `${v.arm_id}|${v.unit_label}`));
  for (const rate of metrics.filter((m) => m.calc === "rate")) {
    for (const g of groups) {
      const num = sums.get(`${g}|${rate.numerator_id}`);
      const den = sums.get(`${g}|${rate.denominator_id}`);
      if (num != null && den != null && num > den) {
        out.push(`${names.get(rate.numerator_id!)} supera a ${names.get(rate.denominator_id!)} en un grupo: revise los totales de ${rate.name}.`);
        break;
      }
    }
  }
  return out;
}

/** Rango de fechas permitido para cargar datos. */
export function allowedRange(input: {
  plannedStart: IsoDate | null;
  plannedEnd: IsoDate | null;
  actualStart: IsoDate | null;
  actualEnd: IsoDate | null;
  preStart: IsoDate | null;
  needsPre: boolean;
}): { min: IsoDate; max: IsoDate } | null {
  const start = input.actualStart ?? input.plannedStart;
  const end = input.actualEnd ?? input.plannedEnd;
  if (!start || !end) return null;
  const min = input.needsPre ? (input.preStart && input.preStart < start ? input.preStart : addDays(start, -28)) : start;
  return { min, max: end };
}
