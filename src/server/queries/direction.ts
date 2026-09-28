import "server-only";
import { addDays } from "@/domain/dates";
import { directionPilots, sustainedLiftShare, type DirectionPilot } from "@/domain/executive";
import { headlineResult, type HeadlineResult } from "@/domain/pilots/portfolio";
import { checkPostScale } from "@/domain/post-scale";
import { bogotaDate } from "@/domain/rollup";
import type { IsoDate, MetricDirection } from "@/domain/types";
import type { MetricEconomics } from "@/domain/value";
import { createClient } from "@/lib/supabase/server";
import { analyzePilotDetail } from "@/server/pilot-reading";
import { loadPilotCatalogs, loadPilotDetailsBatch, type PilotCatalogs, type PilotDetail } from "@/server/queries/pilots";

// Lecturas del resumen de dirección que no están en los snapshots de programas:
// pilotos de medios, días de uso (adopción) y la verificación de los escalados.
// Todo con el cliente de la persona (RLS). Si una tabla aún no existe, vacío.

const PAGE = 1000;

/** Pilotos visibles (sin borrar), con lo necesario para la North Star y la sección de dirección. */
export async function listPilotsForDirection(): Promise<DirectionPilot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pilots")
    .select("id, title, status, decision, decided_at, is_example")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) return [];
  return (data ?? []) as DirectionPilot[];
}

/** Pilotos activos (aprobados, en prueba o en lectura), sin los de ejemplo. Null si no se pudo contar. */
export async function countActivePilots(): Promise<number | null> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("pilots")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("is_example", false)
    .in("status", ["approved", "in_test", "in_reading"]);
  return error ? null : (count ?? 0);
}

export interface DirectionPilotRow extends DirectionPilot {
  result: HeadlineResult | null;
  resultArmName: string | null;
}

/** Activos y decididos en los últimos 30 días (hasta 10), con el resultado principal de la lectura. */
export async function loadDirectionPilots(pilots: DirectionPilot[], today: IsoDate): Promise<{ active: DirectionPilotRow[]; decided: DirectionPilotRow[]; hasMore: boolean }> {
  const picked = directionPilots(pilots, today, 10);
  const ids = [...picked.active, ...picked.decided].filter((p) => p.status !== "approved").map((p) => p.id);
  let details = new Map<string, PilotDetail>();
  let catalogs: PilotCatalogs | null = null;
  try {
    if (ids.length) [details, catalogs] = await Promise.all([loadPilotDetailsBatch(ids), loadPilotCatalogs()]);
  } catch {
    // Sin lectura: la sección sigue, solo sin el resultado.
  }
  const withResult = (p: DirectionPilot): DirectionPilotRow => {
    const detail = details.get(p.id);
    if (!detail || !catalogs) return { ...p, result: null, resultArmName: null };
    try {
      const result = headlineResult(analyzePilotDetail(detail, catalogs));
      return { ...p, result, resultArmName: result ? (detail.arms.find((a) => a.id === result.armId)?.name ?? null) : null };
    } catch {
      return { ...p, result: null, resultArmName: null };
    }
  };
  return { active: picked.active.map(withResult), decided: picked.decided.map(withResult), hasMore: picked.hasMore };
}

/** Días de uso desde una fecha (solo el admin ve los de todos; RLS). */
export async function loadUsageDays(since: IsoDate): Promise<{ user_id: string; day: IsoDate }[] | null> {
  const supabase = await createClient();
  const out: { user_id: string; day: IsoDate }[] = [];
  for (let from = 0; from < 50 * PAGE; from += PAGE) {
    const { data, error } = await supabase
      .from("usage_days")
      .select("user_id, day")
      .gte("day", since)
      .order("day")
      .order("user_id")
      .order("area")
      .range(from, from + PAGE - 1);
    if (error) return null;
    out.push(...((data ?? []) as { user_id: string; day: IsoDate }[]));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

/**
 * % de ejercicios escalados que sostienen el lift en la operación (lectura
 * posterior al escalado con los valores semanales de su métrica del árbol).
 */
export async function loadSustainedLift(
  experiments: { metric_id: string; decision: string | null; decided_at: string | null }[],
  economics: Map<string, MetricEconomics>,
  today: IsoDate,
): Promise<ReturnType<typeof sustainedLiftShare> & { scaled: number }> {
  const scaled = experiments.filter((e) => e.decision === "scale" && e.decided_at);
  if (!scaled.length) return { ...sustainedLiftShare([]), scaled: 0 };
  const earliest = scaled.map((e) => bogotaDate(e.decided_at)!).sort()[0];
  const metricIds = [...new Set(scaled.map((e) => e.metric_id))];
  const supabase = await createClient();
  const values = new Map<string, { week_start: IsoDate; value: number }[]>();
  for (let from = 0; from < 50 * PAGE; from += PAGE) {
    const { data, error } = await supabase
      .from("metric_values")
      .select("metric_id, week_start, value")
      .in("metric_id", metricIds)
      .gte("week_start", addDays(earliest, -35))
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return { ...sustainedLiftShare(scaled.map(() => "missing" as const)), scaled: scaled.length };
    for (const v of data ?? []) {
      const list = values.get(v.metric_id as string) ?? [];
      list.push({ week_start: v.week_start as IsoDate, value: Number(v.value) });
      values.set(v.metric_id as string, list);
    }
    if ((data ?? []).length < PAGE) break;
  }
  const statuses = scaled.map(
    (e) =>
      checkPostScale({
        decidedAt: e.decided_at,
        direction: (economics.get(e.metric_id)?.direction ?? "up") as MetricDirection,
        values: values.get(e.metric_id) ?? [],
        today,
      }).status,
  );
  return { ...sustainedLiftShare(statuses), scaled: scaled.length };
}
