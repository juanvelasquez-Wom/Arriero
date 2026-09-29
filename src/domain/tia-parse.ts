// Intérpretes locales para el copiloto de La Tía: fechas, números, sí/no.
// Todo lo que se entiende aquí no se le pregunta a Claude (cero tokens).
import { addDays, weekStart } from "./dates";
import type { IsoDate } from "./types";
import { addMonths } from "./quick-start";
import { normalizeText } from "./search";

const WEEKDAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number): IsoDate | null => {
  const date = new Date(Date.UTC(y, m, d));
  if (date.getUTCMonth() !== m || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m + 1)}-${pad(d)}`;
};
const dayOfWeek = (date: IsoDate) => new Date(`${date}T00:00:00Z`).getUTCDay();

/**
 * Fecha a partir de lo que escribe una persona: "hoy", "mañana", "el lunes",
 * "en 2 semanas", "15 de octubre", "15/10", "2026-10-15". Null si no la entiende.
 * Sin año, toma la próxima vez que llega esa fecha.
 */
export function parseDateEs(text: string, today: IsoDate): IsoDate | null {
  const t = normalizeText(text);
  if (!t) return null;
  const isoMatch = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) return iso(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  if (/\bpasado manana\b/.test(t)) return addDays(today, 2);
  if (/\bmanana\b/.test(t)) return addDays(today, 1);
  if (/\bantier|anteayer\b/.test(t)) return addDays(today, -2);
  if (/\bayer\b/.test(t)) return addDays(today, -1);
  if (/\bhoy\b|\bahora\b|\bya\b/.test(t)) return today;

  const rel = t.match(/\ben (\d{1,3}|un|una|dos|tres|cuatro|seis) (dia|dias|semana|semanas|mes|meses)\b/);
  if (rel) {
    const words: Record<string, number> = { un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, seis: 6 };
    const n = words[rel[1]] ?? Number(rel[1]);
    if (rel[2].startsWith("dia")) return addDays(today, n);
    if (rel[2].startsWith("semana")) return addDays(today, n * 7);
    return addMonths(today, n);
  }

  const dm = t.match(/\b(\d{1,2})\s*(?:de\s+)?([a-z]{3,10})\.?(?:\s+(?:de|del)?\s*(\d{4}))?\b/);
  const month = dm ? MONTHS.findIndex((m) => m.startsWith(dm[2])) : -1;
  if (dm && month >= 0) return withYear(Number(dm[1]), month, dm[3] ? Number(dm[3]) : null, today);
  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const y = slash[3] ? (slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3])) : null;
    return withYear(Number(slash[1]), Number(slash[2]) - 1, y, today);
  }

  const wd = WEEKDAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(t));
  if (wd >= 0) {
    const diff = (wd - dayOfWeek(today) + 7) % 7 || 7;
    return addDays(today, diff);
  }
  if (/\b(1|primero) del (otro|proximo|siguiente) mes\b/.test(t)) {
    const [y, m] = today.split("-").map(Number);
    return m === 12 ? iso(y + 1, 0, 1) : iso(y, m, 1);
  }
  return null;
}

function withYear(d: number, m: number, y: number | null, today: IsoDate): IsoDate | null {
  if (y != null) return iso(y, m, d);
  const year = Number(today.slice(0, 4));
  const candidate = iso(year, m, d);
  if (candidate && candidate >= addDays(today, -60)) return candidate;
  return iso(year + 1, m, d);
}

/** Lunes de la semana que nombra la persona ("esta semana", "la pasada", o una fecha). */
export function parseWeekEs(text: string, today: IsoDate): IsoDate | null {
  const t = normalizeText(text);
  if (/\b(semana )?(pasada|anterior)\b/.test(t)) return weekStart(addDays(today, -7));
  if (/\besta semana\b|\besta\b/.test(t)) return weekStart(today);
  const date = parseDateEs(text, today);
  return date ? weekStart(date) : null;
}

/**
 * Número en español de Colombia: "2.500.000", "1,5 millones", "300 mil", "2 palos",
 * "15 %", "$ 4.000". Null si no hay número.
 */
export function parseNumberEs(text: string): number | null {
  const t = normalizeText(text).replace(/\$/g, " ");
  const match = t.match(/-?\d[\d.,]*/);
  if (!match) return null;
  let raw = match[0].replace(/[.,]$/, "");
  const hasDot = raw.includes(".");
  const hasComma = raw.includes(",");
  if (hasDot && hasComma) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (hasComma) raw = /^-?\d{1,3}(,\d{3})+$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(",", ".");
  else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, "");
  let n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const rest = t.slice((match.index ?? 0) + match[0].length);
  if (/^\s*(millones|millon|palos?|mm|m\b)/.test(rest)) n *= 1_000_000;
  else if (/^\s*(mil\b|k\b)/.test(rest)) n *= 1_000;
  return n;
}

export type YesNo = "yes" | "no" | null;

export function parseYesNo(text: string): YesNo {
  const t = normalizeText(text);
  if (/^(no|nel|nop|mejor no|no gracias|negativo|para nada)\b/.test(t)) return "no";
  if (/^(si|sii+|claro|de una|hagale|listo|ok|okey|dale|confirmo|confirmado|creelo|cree|correcto|exacto|eso|bueno|perfecto|obvio|por supuesto)\b/.test(t)) return "yes";
  return null;
}

/** Días de un plazo: "4 semanas" → 28, "un mes" → 30, "15 días" → 15. Null si no hay plazo. */
export function parseDurationDays(text: string): number | null {
  const t = normalizeText(text);
  const words: Record<string, number> = { un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, ocho: 8, diez: 10, doce: 12 };
  const m = t.match(/\b(\d{1,3}|un|una|dos|tres|cuatro|cinco|seis|ocho|diez|doce)\s+(dia|dias|semana|semanas|mes|meses)\b/);
  if (!m) return null;
  const n = words[m[1]] ?? Number(m[1]);
  return m[2].startsWith("dia") ? n : m[2].startsWith("semana") ? n * 7 : n * 30;
}

/** "después", "no sé", "saltar"… */
export function isSkip(text: string): boolean {
  return /^(despues|luego|mas tarde|saltar|salte|omitir|no se|ns|paso|ninguno|ninguna|no tengo|todavia no|aun no|no aplica|n\/a)\b/.test(normalizeText(text));
}

/** "cancelar", "olvídelo", "empecemos de nuevo". */
export function isCancel(text: string): boolean {
  return /^(cancelar|cancele|olvidelo|olvidalo|dejelo asi|empezar de nuevo|empecemos de nuevo|reiniciar|borre todo)\b/.test(normalizeText(text));
}
