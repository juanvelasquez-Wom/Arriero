// Plataforma vs. negocio: lo que la plataforma se atribuye (conversaciones) frente
// a lo que el negocio registra (ventas del CRM/BSS). Lectura del CSV de ventas y
// conciliación por campaña y periodo. Funciones puras.
import { toCsv } from "../csv";
import { weekStart } from "../dates";
import { parseDecimal } from "../metric-tree";
import { normalizeName } from "../paste-import";
import type { IsoDate } from "../types";
import { parseCsv, parseDateCell } from "./data-import";

// -----------------------------------------------------------------------------
// CSV de ventas del negocio
// -----------------------------------------------------------------------------

export interface BusinessConversionInput {
  day: IsoDate;
  channel: string;
  campaign_name: string;
  sales: number;
  revenue_cop: number | null;
  match_key: string;
}

export interface BusinessImportIssue {
  line: number;
  message: string;
}

export interface BusinessImportResult {
  rows: BusinessConversionInput[];
  issues: BusinessImportIssue[];
  ignoredColumns: string[];
}

export const MAX_BUSINESS_ROWS = 5000;

const HEADERS = {
  day: ["fecha", "dia", "date"],
  channel: ["canal", "channel"],
  campaign: ["campana", "campaign", "campaña"],
  sales: ["ventas", "sales", "venta"],
  revenue: ["ingresos", "ingresos cop", "ingresos (cop)", "revenue"],
  key: ["clave", "key", "match key", "ctwa_clid", "hash"],
} as const;

/** Plantilla con una fila de ejemplo. La clave es opcional y va con hash. */
export function businessTemplate(example: IsoDate): string {
  return toCsv(
    [{ day: example, channel: "WhatsApp", campaign: "Nombre de la campaña en Meta", sales: "12", revenue: "1500000", key: "" }],
    [
      { header: "Fecha", value: (r) => r.day },
      { header: "Canal", value: (r) => r.channel },
      { header: "Campaña", value: (r) => r.campaign },
      { header: "Ventas", value: (r) => r.sales },
      { header: "Ingresos", value: (r) => r.revenue },
      { header: "Clave", value: (r) => r.key },
    ],
  );
}

/**
 * ¿Parece un teléfono en claro? Solo dígitos (se ignoran espacios, +, guiones,
 * puntos y paréntesis) y 7 o más. La clave debe ser un hash, nunca el número.
 */
export function looksLikePhone(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (!/^[\d\s+\-().]+$/.test(s)) return false;
  return s.replace(/\D/g, "").length >= 7;
}

export function readBusinessImport(text: string, options: { maxDate?: IsoDate } = {}): BusinessImportResult {
  const rows = parseCsv(text);
  const issues: BusinessImportIssue[] = [];
  const out: BusinessConversionInput[] = [];
  if (rows.length < 2) return { rows: out, issues: [{ line: 1, message: "El archivo está vacío o solo trae el encabezado." }], ignoredColumns: [] };
  const header = rows[0].map(normalizeName);
  const find = (names: readonly string[]) => header.findIndex((h) => names.some((n) => normalizeName(n) === h));
  const col = {
    day: find(HEADERS.day),
    channel: find(HEADERS.channel),
    campaign: find(HEADERS.campaign),
    sales: find(HEADERS.sales),
    revenue: find(HEADERS.revenue),
    key: find(HEADERS.key),
  };
  if (col.day < 0) issues.push({ line: 1, message: "Falta la columna Fecha." });
  if (col.channel < 0) issues.push({ line: 1, message: "Falta la columna Canal." });
  if (col.sales < 0) issues.push({ line: 1, message: "Falta la columna Ventas." });
  const known = new Set(Object.values(col).filter((i) => i >= 0));
  const ignoredColumns = rows[0].filter((h, i) => !known.has(i) && h.trim() !== "");
  if (issues.length) return { rows: out, issues, ignoredColumns };

  const seen = new Set<string>();
  rows.slice(1).forEach((cells, idx) => {
    const line = idx + 2;
    const cell = (i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");
    const day = parseDateCell(cell(col.day));
    if (!day) return issues.push({ line, message: `Fecha inválida: «${cell(col.day)}».` });
    if (options.maxDate && day > options.maxDate) return issues.push({ line, message: `La fecha ${day} es futura.` });
    const channel = cell(col.channel);
    if (!channel) return issues.push({ line, message: "Falta el canal." });
    if (channel.length > 80) return issues.push({ line, message: "El canal tiene más de 80 caracteres." });
    const campaign = cell(col.campaign).slice(0, 200);
    const sales = parseDecimal(cell(col.sales));
    if (sales == null || Number.isNaN(sales)) return issues.push({ line, message: `Ventas: «${cell(col.sales)}» no es un número.` });
    if (sales < 0) return issues.push({ line, message: "Ventas: no se aceptan valores negativos." });
    let revenue: number | null = null;
    const rawRevenue = cell(col.revenue);
    if (rawRevenue) {
      const r = parseDecimal(rawRevenue);
      if (r == null || Number.isNaN(r)) return issues.push({ line, message: `Ingresos: «${rawRevenue}» no es un número.` });
      if (r < 0) return issues.push({ line, message: "Ingresos: no se aceptan valores negativos." });
      revenue = r;
    }
    const key = cell(col.key);
    if (looksLikePhone(key)) {
      return issues.push({ line, message: "La clave parece un teléfono en claro. Use un hash (por ejemplo SHA-256) o el ctwa_clid, nunca el número." });
    }
    if (key.length > 200) return issues.push({ line, message: "La clave tiene más de 200 caracteres." });
    const dedupe = `${day}|${normalizeName(channel)}|${normalizeName(campaign)}|${key}`;
    if (seen.has(dedupe)) return issues.push({ line, message: `Fila repetida (${day}, ${channel}${campaign ? `, ${campaign}` : ""}).` });
    seen.add(dedupe);
    out.push({ day, channel, campaign_name: campaign, sales, revenue_cop: revenue, match_key: key });
  });
  return { rows: out, issues, ignoredColumns };
}

// -----------------------------------------------------------------------------
// Conciliación
// -----------------------------------------------------------------------------

export interface PlatformFact {
  day: IsoDate;
  campaign_name: string;
  spend: number;
  conversations: number;
}

export interface BusinessFact {
  day: IsoDate;
  channel: string;
  campaign_name: string;
  sales: number;
  revenue_cop: number | null;
}

export type ReconcilePeriod = "range" | "week";

export interface ReconciliationRow {
  campaign: string;
  /** Lunes de la semana, o null si es todo el rango. */
  period: IsoDate | null;
  channels: string[];
  spend: number;
  conversations: number;
  sales: number;
  revenue: number | null;
  /** Ventas / conversaciones. */
  conversationToSale: number | null;
  /** Inversión / ventas del negocio. */
  realCac: number | null;
  /** Inversión / conversaciones (lo que dice la plataforma). */
  platformCostPerConversation: number | null;
  /** Conversaciones − ventas. */
  gap: number;
  /** El negocio registra más ventas que conversaciones: posible doble conteo. */
  doubleCountRisk: boolean;
  /** Solo hay dato de un lado. */
  side: "both" | "platform_only" | "business_only";
}

const NO_CAMPAIGN = "Sin campaña";

/**
 * Cruza por nombre de campaña (sin tildes ni mayúsculas) y periodo. Las ventas sin
 * campaña quedan en "Sin campaña". Orden: primero los riesgos, luego por inversión.
 */
export function reconcile(
  platform: readonly PlatformFact[],
  business: readonly BusinessFact[],
  options: { from: IsoDate; to: IsoDate; period?: ReconcilePeriod },
): ReconciliationRow[] {
  const by = options.period ?? "range";
  const inRange = (d: IsoDate) => d >= options.from && d <= options.to;
  const periodOf = (d: IsoDate) => (by === "week" ? weekStart(d) : null);
  type Acc = { campaign: string; period: IsoDate | null; channels: Set<string>; spend: number; conversations: number; sales: number; revenue: number | null; p: boolean; b: boolean };
  const acc = new Map<string, Acc>();
  const get = (name: string, day: IsoDate) => {
    const campaign = name.trim() || NO_CAMPAIGN;
    const period = periodOf(day);
    const key = `${normalizeName(campaign)}|${period ?? ""}`;
    let a = acc.get(key);
    if (!a) {
      a = { campaign, period, channels: new Set(), spend: 0, conversations: 0, sales: 0, revenue: null, p: false, b: false };
      acc.set(key, a);
    }
    return a;
  };
  for (const f of platform) {
    if (!inRange(f.day)) continue;
    const a = get(f.campaign_name, f.day);
    a.spend += f.spend;
    a.conversations += f.conversations;
    a.p = true;
  }
  for (const s of business) {
    if (!inRange(s.day)) continue;
    const a = get(s.campaign_name, s.day);
    a.sales += s.sales;
    if (s.revenue_cop != null) a.revenue = (a.revenue ?? 0) + s.revenue_cop;
    a.channels.add(s.channel);
    a.b = true;
  }
  const rows: ReconciliationRow[] = [...acc.values()].map((a) => ({
    campaign: a.campaign,
    period: a.period,
    channels: [...a.channels].sort((x, y) => x.localeCompare(y, "es-CO")),
    spend: a.spend,
    conversations: a.conversations,
    sales: a.sales,
    revenue: a.revenue,
    conversationToSale: a.conversations > 0 ? a.sales / a.conversations : null,
    realCac: a.sales > 0 ? a.spend / a.sales : null,
    platformCostPerConversation: a.conversations > 0 ? a.spend / a.conversations : null,
    gap: a.conversations - a.sales,
    doubleCountRisk: a.p && a.b && a.sales > a.conversations,
    side: a.p && a.b ? "both" : a.p ? "platform_only" : "business_only",
  }));
  return rows.sort(
    (x, y) =>
      Number(y.doubleCountRisk) - Number(x.doubleCountRisk) ||
      (x.period ?? "").localeCompare(y.period ?? "") ||
      y.spend - x.spend ||
      y.sales - x.sales ||
      x.campaign.localeCompare(y.campaign, "es-CO"),
  );
}

const fmt = (n: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);

/** "La plataforma atribuye X conversaciones, el negocio registra Y ventas." */
export function gapText(row: Pick<ReconciliationRow, "conversations" | "sales">): string {
  const conv = `${fmt(row.conversations)} ${row.conversations === 1 ? "conversación" : "conversaciones"}`;
  const sales = `${fmt(row.sales)} ${row.sales === 1 ? "venta" : "ventas"}`;
  return `La plataforma atribuye ${conv}, el negocio registra ${sales}.`;
}

/** Totales de la conciliación (solo campañas con dato en ambos lados). */
export function reconciliationTotals(rows: readonly ReconciliationRow[]) {
  const both = rows.filter((r) => r.side === "both");
  const spend = both.reduce((s, r) => s + r.spend, 0);
  const conversations = both.reduce((s, r) => s + r.conversations, 0);
  const sales = both.reduce((s, r) => s + r.sales, 0);
  return {
    matched: both.length,
    spend,
    conversations,
    sales,
    conversationToSale: conversations > 0 ? sales / conversations : null,
    realCac: sales > 0 ? spend / sales : null,
    doubleCountRisks: rows.filter((r) => r.doubleCountRisk).length,
    platformOnly: rows.filter((r) => r.side === "platform_only").length,
    businessOnly: rows.filter((r) => r.side === "business_only").length,
  };
}
