// Exportación a CSV pensada para Excel en español: separador ";" (la coma es el
// separador decimal en es-CO) y BOM para que las tildes se vean bien.

export type CsvCell = string | number | boolean | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvCell;
}

const SEP = ";";

function cell(v: CsvCell): string {
  if (v == null) return "";
  let s: string;
  if (typeof v === "number") s = Number.isFinite(v) ? String(v).replace(".", ",") : "";
  else if (typeof v === "boolean") s = v ? "Sí" : "No";
  else s = v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(SEP), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(SEP))];
  return "﻿" + lines.join("\r\n");
}

/** Nombre de archivo seguro: "backlog-pospago-2026-09-26.csv". */
export function csvFileName(...parts: string[]): string {
  const slug = parts
    .join("-")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "export"}.csv`;
}
