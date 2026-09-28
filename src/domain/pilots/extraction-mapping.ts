// De una extracción validada (integrations.ts) a datos de Arriero: filas de un
// piloto (grupo × métrica × periodo) y hechos diarios de campañas. Funciones puras.
// La IA nunca calcula: aquí solo se suman y se reparten las filas que trajo la
// plataforma, con el mapeo que eligió una persona (o el sugerido por nombre).
import { normalizeName } from "../paste-import";
import { weekStart } from "../dates";
import type { IsoDate } from "../types";
import { EXTRACTION_METRICS, type Extraction } from "./integrations";
import type { Granularity, PilotMetricDef } from "./types";

/** Nombre de campaña, conjunto o anuncio → id del grupo del piloto (null = no se usa). */
export type EntityMap = Record<string, string | null>;

export interface MappableArm {
  id: string;
  name: string;
  description?: string | null;
}

/** Entidades distintas de la extracción, en orden alfabético. */
export function extractionEntities(extraction: Pick<Extraction, "rows">): string[] {
  return [...new Set(extraction.rows.map((r) => r.entity))].sort((a, b) => a.localeCompare(b, "es-CO"));
}

/**
 * Mapeo sugerido: la entidad es igual al nombre del grupo o lo contiene; si no,
 * la descripción del grupo nombra la entidad; si no, la campaña del medio
 * (cuando el piloto tiene un solo grupo que no es control, esa campaña es la suya).
 * Con varias coincidencias gana el nombre más largo (el más específico).
 */
export function suggestEntityMap(
  entities: readonly string[],
  arms: readonly MappableArm[],
  options: { mediaCampaigns?: readonly (string | null)[]; singleVariantId?: string | null; previous?: EntityMap | null } = {},
): EntityMap {
  const out: EntityMap = {};
  const byLength = [...arms].sort((a, b) => b.name.length - a.name.length);
  const campaigns = (options.mediaCampaigns ?? []).filter((c): c is string => !!c && !!c.trim()).map(normalizeName);
  const armIds = new Set(arms.map((a) => a.id));
  for (const entity of entities) {
    const prev = options.previous?.[entity];
    if (prev !== undefined && (prev === null || armIds.has(prev))) {
      out[entity] = prev;
      continue;
    }
    const e = normalizeName(entity);
    const byName = byLength.find((a) => {
      const n = normalizeName(a.name);
      return n.length > 0 && (e === n || e.includes(n));
    });
    if (byName) {
      out[entity] = byName.id;
      continue;
    }
    const byDescription = arms.find((a) => a.description && normalizeName(a.description).includes(e));
    if (byDescription) {
      out[entity] = byDescription.id;
      continue;
    }
    const byCampaign = options.singleVariantId && campaigns.some((c) => e === c || e.includes(c));
    out[entity] = byCampaign ? options.singleVariantId! : null;
  }
  return out;
}

/** Clave de métrica de la extracción → id de la métrica `sum` del catálogo (por nombre). */
export function metricKeyMap(catalog: readonly PilotMetricDef[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, name] of Object.entries(EXTRACTION_METRICS)) {
    const m = catalog.find((x) => x.calc === "sum" && normalizeName(x.name) === normalizeName(name));
    if (m) out[key] = m.id;
  }
  return out;
}

export interface MappedValue {
  arm_id: string;
  metric_id: string;
  period_start: IsoDate;
  value: number;
}

export interface MappingResult {
  values: MappedValue[];
  /** Filas que no entraron, con el motivo (para contarlo en pantalla). */
  skipped: { unmapped: number; unknownMetric: number; outOfRange: number; notInPilot: number };
}

/**
 * Suma las filas por grupo, métrica y periodo (día o lunes de la semana). Solo
 * entran las métricas del piloto (`allowedMetricIds`) y las fechas del rango.
 */
export function extractionToValues(
  extraction: Pick<Extraction, "rows">,
  entityMap: EntityMap,
  metricIds: Record<string, string>,
  options: { granularity: Granularity; allowedMetricIds?: readonly string[]; minDate?: IsoDate | null; maxDate?: IsoDate | null },
): MappingResult {
  const allowed = options.allowedMetricIds ? new Set(options.allowedMetricIds) : null;
  const totals = new Map<string, MappedValue>();
  const skipped = { unmapped: 0, unknownMetric: 0, outOfRange: 0, notInPilot: 0 };
  for (const row of extraction.rows) {
    const arm = entityMap[row.entity];
    if (!arm) {
      skipped.unmapped++;
      continue;
    }
    const metric = metricIds[row.metric];
    if (!metric) {
      skipped.unknownMetric++;
      continue;
    }
    if (allowed && !allowed.has(metric)) {
      skipped.notInPilot++;
      continue;
    }
    if ((options.minDate && row.date < options.minDate) || (options.maxDate && row.date > options.maxDate)) {
      skipped.outOfRange++;
      continue;
    }
    const period = options.granularity === "week" ? weekStart(row.date) : row.date;
    const key = `${arm}|${metric}|${period}`;
    const cur = totals.get(key);
    if (cur) cur.value += row.value;
    else totals.set(key, { arm_id: arm, metric_id: metric, period_start: period, value: row.value });
  }
  const values = [...totals.values()].sort((a, b) => a.period_start.localeCompare(b.period_start) || a.arm_id.localeCompare(b.arm_id) || a.metric_id.localeCompare(b.metric_id));
  return { values, skipped };
}

export interface AdFactInput {
  day: IsoDate;
  campaign_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversations: number;
  landing_views: number;
}

const FACT_FIELD: Record<string, keyof Omit<AdFactInput, "day" | "campaign_name">> = {
  spend: "spend",
  impressions: "impressions",
  clicks: "clicks",
  conversations_started: "conversations",
  landing_page_views: "landing_views",
};

/** Filas de la extracción → un hecho por campaña y día (las métricas se suman). */
export function extractionToAdFacts(extraction: Pick<Extraction, "rows">): AdFactInput[] {
  const out = new Map<string, AdFactInput>();
  for (const row of extraction.rows) {
    const field = FACT_FIELD[row.metric];
    if (!field) continue;
    const key = `${row.date}|${row.entity}`;
    let fact = out.get(key);
    if (!fact) {
      fact = { day: row.date, campaign_name: row.entity, spend: 0, impressions: 0, clicks: 0, conversations: 0, landing_views: 0 };
      out.set(key, fact);
    }
    fact[field] += row.value;
  }
  return [...out.values()].sort((a, b) => a.day.localeCompare(b.day) || a.campaign_name.localeCompare(b.campaign_name, "es-CO"));
}

/** "act_123" y "123" son la misma cuenta de Meta. */
export function sameAccount(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (x: string | null | undefined) => (x ?? "").trim().toLowerCase().replace(/^act_/, "");
  return !!n(a) && n(a) === n(b);
}

/** Id de cuenta de Meta válido: "act_" y dígitos. */
export function isMetaAccountId(v: string): boolean {
  return /^act_\d{3,30}$/.test(v.trim());
}

/**
 * Conexión para un piloto: la conectada cuya cuenta coincide con la del medio; si
 * el medio no dice cuenta y solo hay una conexión conectada, esa.
 */
export function pickConnection<T extends { id: string; account_ref: string | null; status: string }>(
  accounts: readonly (string | null)[],
  connections: readonly T[],
): T | null {
  const live = connections.filter((c) => c.status === "connected");
  for (const acc of accounts) {
    const hit = live.find((c) => sameAccount(c.account_ref, acc));
    if (hit) return hit;
  }
  const anyAccount = accounts.some((a) => a && a.trim());
  return !anyAccount && live.length === 1 ? live[0] : null;
}

export type ConnectionStatus = "disconnected" | "connected" | "expired" | "error";

export const CONNECTION_STATUS_LABEL: Record<ConnectionStatus, string> = {
  disconnected: "Desconectada",
  connected: "Conectada",
  expired: "Vencida",
  error: "Error",
};

/** Estado que se muestra: una conexión con el token vencido cuenta como vencida. */
export function effectiveConnectionStatus(c: { status: ConnectionStatus; expires_at: string | null }, now: Date = new Date()): ConnectionStatus {
  if (c.status === "connected" && c.expires_at && new Date(c.expires_at).getTime() < now.getTime()) return "expired";
  return c.status;
}
