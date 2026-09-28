import "server-only";
// Escrituras de integración (Meta primero). Usan el cliente con secret key porque
// los snapshots, los hechos de campañas y los datos traídos por MCP solo los
// escribe el servidor; quien llama ya validó el rol y el acceso al piloto.
// Nunca se loguea ni se devuelve el token.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, maxDate, minDate, todayIso, weekStart } from "@/domain/dates";
import { allowedRange, baseMetricsFor } from "@/domain/pilots/data-import";
import {
  extractionEntities,
  extractionToAdFacts,
  extractionToValues,
  metricKeyMap,
  suggestEntityMap,
  type EntityMap,
  type MappingResult,
} from "@/domain/pilots/extraction-mapping";
import { extractionSchema, type Extraction } from "@/domain/pilots/integrations";
import { needsPrePeriod, pilotGranularity } from "@/domain/pilots/reading";
import type { CatalogMetric, PilotDetail } from "@/server/queries/pilots";

/** Estados en que un piloto recibe datos de integración. */
export const SYNC_STATUSES = ["approved", "in_test", "in_reading"] as const;

/** Medios del piloto que salen de Meta (integración "meta" del catálogo). */
export function metaMediaOf(detail: Pick<PilotDetail, "media">, mediaIntegration: Map<string, string | null>) {
  return detail.media.filter((m) => mediaIntegration.get(m.media_id) === "meta");
}

/** Rango que se le pide a la plataforma: el del piloto, hasta ayer. Null si no hay fechas o todo es futuro. */
export function extractionRange(detail: Pick<PilotDetail, "pilot">, today = todayIso()): { from: string; to: string } | null {
  const p = detail.pilot;
  const range = allowedRange({
    plannedStart: p.planned_start,
    plannedEnd: p.planned_end,
    actualStart: p.actual_start,
    actualEnd: p.actual_end,
    preStart: p.design_config?.pre_start ?? null,
    needsPre: needsPrePeriod(p.test_type),
  });
  if (!range) return null;
  const to = minDate(range.max, addDays(today, -1))!;
  // Tope de 92 días por extracción: lo demás se trae por partes o por el sync diario.
  let from = range.min < addDays(to, -91) ? addDays(to, -91) : range.min;
  // En semanas se pide la semana completa: si no, el total de la semana quedaría corto.
  if (pilotGranularity(p) === "week") from = maxDate(range.min, weekStart(from))!;
  return from <= to ? { from, to } : null;
}

/**
 * Días que pide el sync diario: ayer, o en pilotos semanales desde el lunes de
 * esa semana (el dato semanal se reemplaza con el total de la semana hasta ayer).
 */
export function dailySyncRange(detail: Pick<PilotDetail, "pilot">, today = todayIso()): { from: string; to: string } | null {
  const full = extractionRange(detail, today);
  if (!full) return null;
  const yesterday = addDays(today, -1);
  if (full.to < yesterday) return null;
  const from = pilotGranularity(detail.pilot) === "week" ? weekStart(yesterday) : yesterday;
  return { from: maxDate(full.from, from)!, to: yesterday };
}

/** Mapeo sugerido para una extracción (reusa el último que aplicó una persona). */
export async function suggestedMapFor(admin: SupabaseClient, detail: PilotDetail, extraction: Extraction): Promise<EntityMap> {
  const { data } = await admin
    .from("pilot_snapshots")
    .select("query")
    .eq("pilot_id", detail.pilot.id)
    .eq("status", "ok")
    .not("query->entity_map", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const previous = ((data?.[0]?.query as { entity_map?: EntityMap } | undefined)?.entity_map ?? null) as EntityMap | null;
  const variants = detail.arms.filter((a) => !a.is_control);
  return suggestEntityMap(extractionEntities(extraction), detail.arms, {
    previous,
    mediaCampaigns: detail.media.map((m) => m.campaign),
    singleVariantId: variants.length === 1 ? variants[0].id : null,
  });
}

/** Lee el JSON validado de un snapshot del piloto (null si no es de este piloto o no quedó bien). */
export async function readSnapshotExtraction(admin: SupabaseClient, pilotId: string, snapshotId: string): Promise<Extraction | null> {
  const { data } = await admin.from("pilot_snapshots").select("pilot_id, status, validated").eq("id", snapshotId).maybeSingle();
  if (!data || data.pilot_id !== pilotId || data.status !== "ok") return null;
  const parsed = extractionSchema.safeParse(data.validated);
  return parsed.success ? parsed.data : null;
}

export interface ApplyOutcome extends MappingResult {
  written: number;
  /** Datos cargados a mano o ajustados que se respetaron (no se pisan). */
  keptManual: number;
  unchanged: number;
}

/**
 * Convierte la extracción en datos del piloto y los guarda con `source: mcp` y el
 * snapshot como origen. Lo cargado a mano (o un dato de integración ajustado a
 * mano) nunca se pisa. Un dato de integración que cambió se reemplaza (borrar e
 * insertar) para que no quede marcado como "ajustado a mano".
 */
export async function applyExtractionToPilot(
  admin: SupabaseClient,
  detail: PilotDetail,
  catalogMetrics: CatalogMetric[],
  extraction: Extraction,
  snapshotId: string,
  entityMap: EntityMap,
): Promise<ApplyOutcome> {
  const p = detail.pilot;
  const granularity = pilotGranularity(p);
  const metricIds = [p.primary_metric_id, ...detail.guardrails.map((g) => g.metric_id)].filter((x): x is string => !!x);
  const base = baseMetricsFor(metricIds, catalogMetrics);
  const range = allowedRange({
    plannedStart: p.planned_start,
    plannedEnd: p.planned_end,
    actualStart: p.actual_start,
    actualEnd: p.actual_end,
    preStart: p.design_config?.pre_start ?? null,
    needsPre: needsPrePeriod(p.test_type),
  });
  const armIds = new Set(detail.arms.map((a) => a.id));
  const cleanMap: EntityMap = Object.fromEntries(Object.entries(entityMap).map(([k, v]) => [k, v && armIds.has(v) ? v : null]));
  const mapped = extractionToValues(extraction, cleanMap, metricKeyMap(catalogMetrics), {
    granularity,
    allowedMetricIds: base.map((m) => m.id),
    minDate: range?.min ?? null,
    maxDate: range?.max ?? null,
  });

  const { data: existing } = await admin
    .from("pilot_measurements")
    .select("id, arm_id, metric_id, period_start, value, source, adjusted_at")
    .eq("pilot_id", p.id)
    .eq("granularity", granularity)
    .eq("unit_label", "");
  const byKey = new Map((existing ?? []).map((m) => [`${m.arm_id}|${m.metric_id}|${m.period_start}`, m]));

  let keptManual = 0;
  let unchanged = 0;
  const replaceIds: string[] = [];
  const inserts: Record<string, unknown>[] = [];
  for (const v of mapped.values) {
    const prev = byKey.get(`${v.arm_id}|${v.metric_id}|${v.period_start}`);
    if (prev && (prev.source !== "mcp" || prev.adjusted_at)) {
      keptManual++;
      continue;
    }
    if (prev && Number(prev.value) === v.value) {
      unchanged++;
      continue;
    }
    if (prev) replaceIds.push(prev.id as string);
    inserts.push({ pilot_id: p.id, arm_id: v.arm_id, metric_id: v.metric_id, unit_label: "", period_start: v.period_start, granularity, value: v.value, source: "mcp", snapshot_id: snapshotId });
  }
  if (replaceIds.length) {
    const { error } = await admin.from("pilot_measurements").delete().in("id", replaceIds);
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await admin.from("pilot_measurements").insert(inserts.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  // El mapeo queda en el snapshot: así se sabe cómo se repartió cada fila y el sync lo reusa.
  const { data: snap } = await admin.from("pilot_snapshots").select("query").eq("id", snapshotId).maybeSingle();
  await admin
    .from("pilot_snapshots")
    .update({ query: { ...((snap?.query as Record<string, unknown>) ?? {}), entity_map: cleanMap } })
    .eq("id", snapshotId);
  return { ...mapped, written: inserts.length, keptManual, unchanged };
}

/** Guarda los hechos diarios de campañas de una extracción de la cuenta (idempotente). */
export async function upsertAdFacts(
  admin: SupabaseClient,
  input: { connectionId: string; provider: string; accountRef: string; extraction: Extraction; snapshotId: string | null },
): Promise<number> {
  const rows = extractionToAdFacts(input.extraction).map((f) => ({
    ...f,
    connection_id: input.connectionId,
    source: input.provider,
    account_ref: input.accountRef,
    adset_name: "",
    ad_name: "",
    snapshot_id: input.snapshotId,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from("ad_facts")
      .upsert(rows.slice(i, i + 500), { onConflict: "source,account_ref,day,campaign_name,adset_name,ad_name" });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}
