// "Pegar desde Excel" en la carga semanal: interpreta filas copiadas de una hoja
// de cálculo (Métrica · Valor, con semana opcional) y las cruza con las
// métricas del programa. Funciones puras.
import { parseIsoDate, toIsoDate, weekStart } from "./dates";
import { parseDecimal } from "./metric-tree";
import type { IsoDate } from "./types";

export type PasteRowStatus = "matched" | "not_found" | "ambiguous" | "invalid" | "other_week" | "duplicate";

export interface PasteRow {
  /** Número de línea en lo pegado (1 = primera). */
  line: number;
  name: string;
  valueRaw: string;
  week: IsoDate | null;
  status: PasteRowStatus;
  metricId: string | null;
  metricName: string | null;
  value: number | null;
}

export interface PasteMetric {
  id: string;
  name: string;
}

/** Nombre comparable: sin tildes, sin mayúsculas y con espacios simples. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Lee una fecha "2026-09-21", "21/09/2026" o "21-09-2026" y la lleva al lunes de su semana. */
export function parseWeekCell(raw: string): IsoDate | null {
  const s = raw.trim();
  let iso: string | null = null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (!iso) return null;
  const d = parseIsoDate(iso);
  if (Number.isNaN(d.getTime()) || toIsoDate(d) !== iso) return null;
  return weekStart(iso);
}

const HEADER_NAMES = new Set(["metrica", "metricas", "nombre", "indicador", "kpi"]);
const HEADER_VALUES = new Set(["valor", "value", "dato", "resultado"]);

/**
 * Parte una línea en celdas. Tabulador (lo que copia Excel) o ";" se parten
 * tal cual. Con "," solo se separa en la primera coma, porque la coma también
 * es el decimal en es-CO ("Altas,1234,5" → "Altas" | "1234,5").
 */
export function splitLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  if (line.includes(";")) return line.split(";").map((c) => c.trim());
  const cells: string[] = [];
  let rest = line.trim();
  // Semana al inicio: "2026-09-21,Altas,1234"
  const lead = /^([^,]+),(.*)$/.exec(rest);
  if (lead && parseWeekCell(lead[1])) {
    cells.push(lead[1].trim());
    rest = lead[2].trim();
  }
  const i = rest.indexOf(",");
  if (i < 0) return [...cells, rest];
  return [...cells, rest.slice(0, i).trim(), rest.slice(i + 1).trim()];
}

/**
 * Interpreta lo pegado. Cada fila debe tener el nombre de la métrica y el
 * valor; una celda con fecha se toma como la semana. Las filas de otra semana
 * se marcan y no se usan; si una métrica se repite, cuenta la primera.
 */
export function parsePastedRows(text: string, metrics: PasteMetric[], formWeek: IsoDate): PasteRow[] {
  const byName = new Map<string, PasteMetric[]>();
  for (const m of metrics) {
    const key = normalizeName(m.name);
    byName.set(key, [...(byName.get(key) ?? []), m]);
  }
  const seen = new Set<string>();
  const out: PasteRow[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  lines.forEach((rawLine, idx) => {
    if (!rawLine.trim()) return;
    let cells = splitLine(rawLine).filter((c, i, all) => c !== "" || i < all.length - 1);
    let week: IsoDate | null = null;
    const weekIdx = cells.findIndex((c) => parseWeekCell(c) != null);
    if (weekIdx >= 0 && cells.length > 2) {
      week = parseWeekCell(cells[weekIdx]);
      cells = cells.filter((_, i) => i !== weekIdx);
    }
    const nonEmpty = cells.filter((c) => c !== "");
    const name = nonEmpty[0] ?? "";
    const valueRaw = nonEmpty[1] ?? "";

    if (out.length === 0 && (HEADER_NAMES.has(normalizeName(name)) || HEADER_VALUES.has(normalizeName(valueRaw)))) return;

    const row: PasteRow = { line: idx + 1, name, valueRaw, week, status: "matched", metricId: null, metricName: null, value: null };
    const candidates = byName.get(normalizeName(name)) ?? [];
    if (candidates.length === 1) {
      row.metricId = candidates[0].id;
      row.metricName = candidates[0].name;
    }
    const value = parseDecimal(valueRaw);
    if (!candidates.length) row.status = "not_found";
    else if (candidates.length > 1) row.status = "ambiguous";
    else if (value == null || Number.isNaN(value)) row.status = "invalid";
    else if (week && week !== formWeek) row.status = "other_week";
    else if (seen.has(row.metricId!)) row.status = "duplicate";
    if (value != null && !Number.isNaN(value)) row.value = value;
    if (row.status === "matched") seen.add(row.metricId!);
    out.push(row);
  });
  return out;
}

export function countByStatus(rows: PasteRow[]): Record<PasteRowStatus, number> {
  const out: Record<PasteRowStatus, number> = { matched: 0, not_found: 0, ambiguous: 0, invalid: 0, other_week: 0, duplicate: 0 };
  for (const r of rows) out[r.status] += 1;
  return out;
}

export const PASTE_STATUS_LABEL: Record<PasteRowStatus, string> = {
  matched: "Lista",
  not_found: "No se encontró la métrica",
  ambiguous: "El nombre se repite en varias líneas",
  invalid: "El valor no es un número",
  other_week: "Es de otra semana",
  duplicate: "Métrica repetida (se usa la primera)",
};

/** Umbral de la alerta de valor atípico: más de 50 % de cambio frente a la semana anterior. */
export const OUTLIER_THRESHOLD = 0.5;

/**
 * Cambio relativo frente a la semana anterior si supera el umbral; si no, null.
 * Sin dato anterior (o anterior en 0) no hay con qué comparar.
 */
export function outlierChange(
  value: number | null | undefined,
  previous: number | null | undefined,
  threshold = OUTLIER_THRESHOLD,
): number | null {
  if (value == null || previous == null || Number.isNaN(value) || previous === 0) return null;
  const ratio = (value - previous) / Math.abs(previous);
  return Math.abs(ratio) > threshold ? ratio : null;
}
