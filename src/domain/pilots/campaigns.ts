// Vista de campañas: suma los hechos diarios (ad_facts) por campaña en un rango,
// los compara con el periodo anterior del mismo largo y marca lo que pide
// atención. Funciones puras; las divisiones por cero dan null.
import { addDays, daysBetween, parseIsoDate, toIsoDate } from "../dates";
import { normalizeName } from "../paste-import";
import type { IsoDate } from "../types";

export interface CampaignFact {
  day: IsoDate;
  campaign_name: string;
  account_ref?: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversations: number;
}

export interface CampaignTotals {
  spend: number;
  impressions: number;
  clicks: number;
  conversations: number;
  /** Clics / impresiones. */
  ctr: number | null;
  /** Inversión / clics. */
  cpc: number | null;
  /** Inversión / conversaciones. */
  costPerConversation: number | null;
}

export type CampaignFlag = "spend_no_conversations" | "cost_per_conversation_up";

export const CAMPAIGN_FLAG_LABEL: Record<CampaignFlag, string> = {
  spend_no_conversations: "Gasta sin conversaciones",
  cost_per_conversation_up: "Costo por conversación subió más de 20 %",
};

/** Umbral de alerta del costo por conversación frente al periodo anterior. */
export const COST_UP_THRESHOLD = 0.2;

export interface CampaignRow {
  campaign: string;
  current: CampaignTotals;
  previous: CampaignTotals;
  /** Cambio relativo vs. el periodo anterior (0.1 = +10 %); null sin base. */
  change: { spend: number | null; conversations: number | null; costPerConversation: number | null; ctr: number | null };
  flags: CampaignFlag[];
}

export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

export const DEFAULT_CAMPAIGN_DAYS = 14;

const isIso = (v: unknown): v is IsoDate => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && toIsoDate(parseIsoDate(v)) === v;

/** Rango de la URL (?desde=&hasta=); por defecto los últimos 14 días hasta ayer. Máximo 366 días. */
export function parseCampaignRange(sp: Record<string, string | string[] | undefined>, today: IsoDate): DateRange {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const yesterday = addDays(today, -1);
  const rawTo = one(sp.hasta);
  const rawFrom = one(sp.desde);
  const to = isIso(rawTo) && rawTo <= today ? rawTo : yesterday;
  let from = isIso(rawFrom) && rawFrom <= to ? rawFrom : addDays(to, -(DEFAULT_CAMPAIGN_DAYS - 1));
  if (daysBetween(from, to) > 365) from = addDays(to, -365);
  return { from, to };
}

/** Periodo anterior con el mismo número de días, pegado al rango. */
export function previousRange(range: DateRange): DateRange {
  const days = daysBetween(range.from, range.to) + 1;
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) };
}

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function totalsOf(facts: readonly Pick<CampaignFact, "spend" | "impressions" | "clicks" | "conversations">[]): CampaignTotals {
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let conversations = 0;
  for (const f of facts) {
    spend += f.spend;
    impressions += f.impressions;
    clicks += f.clicks;
    conversations += f.conversations;
  }
  return { spend, impressions, clicks, conversations, ctr: ratio(clicks, impressions), cpc: ratio(spend, clicks), costPerConversation: ratio(spend, conversations) };
}

/** Cambio relativo; null si no hay base o alguno falta. */
export function changeRatio(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return current / previous - 1;
}

/** Marcas de atención de una campaña. */
export function campaignFlags(current: CampaignTotals, previous: CampaignTotals): CampaignFlag[] {
  const flags: CampaignFlag[] = [];
  if (current.spend > 0 && current.conversations === 0) flags.push("spend_no_conversations");
  const up = changeRatio(current.costPerConversation, previous.costPerConversation);
  if (up != null && up > COST_UP_THRESHOLD) flags.push("cost_per_conversation_up");
  return flags;
}

/**
 * Una fila por campaña con datos en el rango actual (las del periodo anterior sin
 * datos ahora no aparecen). `facts` puede traer ambos periodos: se separan por fecha.
 * Orden: primero las marcadas, luego por inversión.
 */
export function aggregateCampaigns(facts: readonly CampaignFact[], range: DateRange): CampaignRow[] {
  const prev = previousRange(range);
  const cur = new Map<string, { name: string; facts: CampaignFact[] }>();
  const old = new Map<string, CampaignFact[]>();
  for (const f of facts) {
    const key = normalizeName(f.campaign_name);
    if (f.day >= range.from && f.day <= range.to) {
      const g = cur.get(key) ?? { name: f.campaign_name, facts: [] };
      g.facts.push(f);
      cur.set(key, g);
    } else if (f.day >= prev.from && f.day <= prev.to) {
      old.set(key, [...(old.get(key) ?? []), f]);
    }
  }
  const rows: CampaignRow[] = [...cur.entries()].map(([key, g]) => {
    const current = totalsOf(g.facts);
    const previous = totalsOf(old.get(key) ?? []);
    return {
      campaign: g.name,
      current,
      previous,
      change: {
        spend: changeRatio(current.spend, previous.spend),
        conversations: changeRatio(current.conversations, previous.conversations),
        costPerConversation: changeRatio(current.costPerConversation, previous.costPerConversation),
        ctr: changeRatio(current.ctr, previous.ctr),
      },
      flags: campaignFlags(current, previous),
    };
  });
  return rows.sort((a, b) => b.flags.length - a.flags.length || b.current.spend - a.current.spend || a.campaign.localeCompare(b.campaign, "es-CO"));
}

/** Totales de todas las campañas del rango y del periodo anterior. */
export function campaignSummary(facts: readonly CampaignFact[], range: DateRange): { current: CampaignTotals; previous: CampaignTotals } {
  const prev = previousRange(range);
  return {
    current: totalsOf(facts.filter((f) => f.day >= range.from && f.day <= range.to)),
    previous: totalsOf(facts.filter((f) => f.day >= prev.from && f.day <= prev.to)),
  };
}

/** ¿Un aumento es bueno? En costos, bajar es lo bueno. */
export type TrendTone = "good" | "bad" | "flat" | "none";
export function trendTone(change: number | null, lowerIsBetter: boolean): TrendTone {
  if (change == null) return "none";
  if (Math.abs(change) < 0.005) return "flat";
  return change > 0 !== lowerIsBetter ? "good" : "bad";
}
