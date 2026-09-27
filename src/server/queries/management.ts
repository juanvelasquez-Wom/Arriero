import "server-only";
import { addDays } from "@/domain/dates";
import type { ReportExperiment } from "@/domain/report";
import type { RollupNorthStar } from "@/domain/rollup";
import type { TargetHorizon } from "@/domain/targets";
import type {
  CalendarEvent,
  CalendarEventType,
  Decision,
  ExperimentStatus,
  IsoDate,
  MetricDirection,
  MetricType,
  ProgramRole,
  TestType,
  Variant,
  Verdict,
} from "@/domain/types";
import type { MetricEconomics } from "@/domain/value";
import type { WorkloadActivity, WorkloadMember } from "@/domain/workload";
import { createClient, type ServerSupabase } from "@/lib/supabase/server";

// Lecturas de la capa de gestión (dirección, equipo e informe). Todo pasa por
// el cliente SSR: RLS decide qué programas y datos ve cada persona.

/** Semanas hacia atrás que se leen de valores (bastan para el último valor y el cambio del periodo). */
const VALUE_WINDOW_WEEKS = 26;
const PAGE = 1000;

type PgError = { message: string; code?: string };
type PageResult = { data: unknown[] | null; error: PgError | null };

/** Lee todas las filas en páginas de 1.000 (el límite por defecto de la API). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<PageResult>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function isMissingColumn(error: PgError | null) {
  return !!error && (error.code === "42703" || /unit_value/.test(error.message));
}

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

export interface ManagementProgram {
  id: string;
  name: string;
  is_demo: boolean;
  start_date: IsoDate | null;
  end_date: IsoDate | null;
}

export interface ManagementExperiment extends ReportExperiment {
  program_id: string;
  owner_id: string | null;
  planned_end: IsoDate | null;
  min_duration_days: number | null;
}

export interface ProgramSnapshot {
  program: ManagementProgram;
  horizons: TargetHorizon[];
  northStars: RollupNorthStar[];
  experiments: ManagementExperiment[];
  economics: Map<string, MetricEconomics>;
  calendar: CalendarEvent[];
}

/** Programas activos que el usuario puede ver (RLS), reales primero. */
export async function listVisiblePrograms(): Promise<ManagementProgram[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("programs")
    .select("id, name, is_demo, start_date, end_date")
    .is("deleted_at", null)
    .order("is_demo", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ManagementProgram[];
}

interface MetricRowRaw {
  id: string;
  program_id: string;
  line_id: string;
  type: MetricType;
  name: string;
  unit: string | null;
  direction: MetricDirection;
  baseline: number | string | null;
  unit_value?: number | string | null;
}

async function loadMetrics(supabase: ServerSupabase, ids: string[]): Promise<MetricRowRaw[]> {
  const base = "id, program_id, line_id, type, name, unit, direction, baseline";
  try {
    return await fetchAll<MetricRowRaw>((a, b) =>
      supabase.from("metrics").select(`${base}, unit_value`).in("program_id", ids).order("id").range(a, b),
    );
  } catch (e) {
    // La columna unit_value llega con una migración; sin ella se sigue sin valor por unidad.
    if (!isMissingColumn({ message: (e as Error).message })) throw e;
    return fetchAll<MetricRowRaw>((a, b) => supabase.from("metrics").select(base).in("program_id", ids).order("id").range(a, b));
  }
}

/**
 * Todo lo necesario para la dirección y el informe de uno o varios programas,
 * con una consulta por tabla (no una por programa).
 */
export async function loadSnapshots(programs: ManagementProgram[], today: IsoDate): Promise<ProgramSnapshot[]> {
  if (!programs.length) return [];
  const ids = programs.map((p) => p.id);
  const supabase = await createClient();
  const since = addDays(today, -7 * VALUE_WINDOW_WEEKS);

  const [horizons, lines, metrics, targets, values, experiments, variants, learnings, calendar] = await Promise.all([
    fetchAll<TargetHorizon & { program_id: string }>((a, b) =>
      supabase.from("program_horizons").select("id, program_id, name, start_date, end_date").in("program_id", ids).order("id").range(a, b),
    ),
    fetchAll<{ id: string; program_id: string; name: string; sort_order: number }>((a, b) =>
      supabase.from("business_lines").select("id, program_id, name, sort_order").in("program_id", ids).order("id").range(a, b),
    ),
    loadMetrics(supabase, ids),
    fetchAll<{ metric_id: string; horizon_id: string; target: number | string }>((a, b) =>
      supabase.from("metric_targets").select("metric_id, horizon_id, target").in("program_id", ids).order("id").range(a, b),
    ),
    fetchAll<{ metric_id: string; week_start: IsoDate; value: number | string }>((a, b) =>
      supabase
        .from("metric_values")
        .select("metric_id, week_start, value")
        .in("program_id", ids)
        .gte("week_start", since)
        .order("id")
        .range(a, b),
    ),
    fetchAll<Record<string, unknown>>((a, b) =>
      supabase
        .from("experiments")
        .select(
          `id, program_id, title, status, metric_id, test_type, verdict, decision, decided_at, status_changed_at, final_score,
           actual_start, planned_end, min_duration_days, owner_id, decision_rationale,
           line:business_lines!experiments_line_id_fkey(name),
           owner:profiles!experiments_owner_id_fkey(name, email)`,
        )
        .in("program_id", ids)
        .order("id")
        .range(a, b),
    ),
    fetchAll<Variant & { experiment_id: string }>((a, b) =>
      supabase
        .from("experiment_variants")
        .select("id, experiment_id, name, is_control, sample, conversions, metric_value, sort_order")
        .in("program_id", ids)
        .order("id")
        .range(a, b),
    ),
    fetchAll<{ experiment_id: string; text: string }>((a, b) =>
      supabase.from("learnings").select("experiment_id, text").in("program_id", ids).order("id").range(a, b),
    ),
    fetchAll<CalendarEvent & { program_id: string }>((a, b) =>
      supabase.from("calendar_events").select("id, program_id, type, name, start_date, end_date").in("program_id", ids).order("id").range(a, b),
    ),
  ]);

  const lineName = new Map(lines.map((l) => [l.id, l.name]));
  const lineOrder = new Map(lines.map((l) => [l.id, l.sort_order]));
  const valuesBy = new Map<string, { week_start: IsoDate; value: number }[]>();
  for (const v of values) {
    const list = valuesBy.get(v.metric_id) ?? [];
    list.push({ week_start: v.week_start, value: Number(v.value) });
    valuesBy.set(v.metric_id, list);
  }
  for (const list of valuesBy.values()) list.sort((a, b) => a.week_start.localeCompare(b.week_start));
  const targetsBy = new Map<string, { horizon_id: string; target: number }[]>();
  for (const t of targets) targetsBy.set(t.metric_id, [...(targetsBy.get(t.metric_id) ?? []), { horizon_id: t.horizon_id, target: Number(t.target) }]);

  const economics = new Map<string, MetricEconomics>();
  for (const m of metrics) {
    const last = valuesBy.get(m.id)?.at(-1);
    economics.set(m.id, {
      id: m.id,
      unit: m.unit,
      direction: m.direction,
      baseline: num(m.baseline),
      unit_value: num(m.unit_value),
      latest_value: last?.value ?? null,
      latest_week: last?.week_start ?? null,
    });
  }

  const variantsBy = new Map<string, Variant[]>();
  for (const v of variants) {
    variantsBy.set(v.experiment_id, [
      ...(variantsBy.get(v.experiment_id) ?? []),
      {
        id: v.id,
        name: v.name,
        is_control: v.is_control,
        sample: num(v.sample),
        conversions: num(v.conversions),
        metric_value: num(v.metric_value),
      },
    ]);
  }
  const learningBy = new Map(learnings.map((l) => [l.experiment_id, l.text]));

  const mappedExperiments: ManagementExperiment[] = experiments.map((r) => {
    const owner = r.owner as { name: string; email: string } | null;
    const line = r.line as { name: string } | null;
    return {
      id: r.id as string,
      program_id: r.program_id as string,
      title: r.title as string,
      status: r.status as ExperimentStatus,
      line_name: line?.name ?? "",
      metric_id: r.metric_id as string,
      test_type: (r.test_type as TestType) ?? null,
      verdict: (r.verdict as Verdict) ?? null,
      decision: (r.decision as Decision) ?? null,
      decided_at: (r.decided_at as string) ?? null,
      status_changed_at: r.status_changed_at as string,
      final_score: num(r.final_score),
      actual_start: (r.actual_start as string) ?? null,
      planned_end: (r.planned_end as string) ?? null,
      min_duration_days: (r.min_duration_days as number) ?? null,
      owner_id: (r.owner_id as string) ?? null,
      owner_name: owner ? owner.name || owner.email : null,
      decision_rationale: (r.decision_rationale as string) ?? null,
      learning: learningBy.get(r.id as string) ?? null,
      variants: variantsBy.get(r.id as string) ?? [],
    };
  });

  return programs.map((program) => ({
    program,
    horizons: horizons.filter((h) => h.program_id === program.id).map(({ id, name, start_date, end_date }) => ({ id, name, start_date, end_date })),
    northStars: metrics
      .filter((m) => m.program_id === program.id && m.type === "north_star")
      .sort((a, b) => (lineOrder.get(a.line_id) ?? 0) - (lineOrder.get(b.line_id) ?? 0))
      .map((m) => ({
        metric_id: m.id,
        metric_name: m.name,
        line_id: m.line_id,
        line_name: lineName.get(m.line_id) ?? "",
        unit: m.unit,
        direction: m.direction,
        baseline: num(m.baseline),
        targets: targetsBy.get(m.id) ?? [],
        values: valuesBy.get(m.id) ?? [],
      })),
    experiments: mappedExperiments.filter((e) => e.program_id === program.id),
    economics,
    calendar: calendar
      .filter((c) => c.program_id === program.id)
      .map(({ id, type, name, start_date, end_date }) => ({ id, type: type as CalendarEventType, name, start_date, end_date })),
  }));
}

/** Snapshot de un solo programa (el contexto ya validó el acceso). */
export async function loadProgramSnapshot(program: ManagementProgram, today: IsoDate): Promise<ProgramSnapshot> {
  const [snap] = await loadSnapshots([program], today);
  return snap;
}

/** Miembros del programa con nombre. */
export async function listTeamMembers(programId: string): Promise<WorkloadMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("program_members")
    .select("user_id, role, profile:profiles!program_members_user_id_fkey(name, email)")
    .eq("program_id", programId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => {
    const p = m.profile as unknown as { name: string; email: string } | null;
    return { user_id: m.user_id as string, role: m.role as ProgramRole, name: p?.name || p?.email || "Sin nombre" };
  });
}

/**
 * Actividad reciente (últimos 90 días) para saber la última vez que cada
 * persona movió algo. Si la bitácora no se puede leer, devuelve vacío.
 */
export async function listRecentActivity(programId: string, today: IsoDate): Promise<WorkloadActivity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select("actor_id, created_at")
    .eq("program_id", programId)
    .gte("created_at", `${addDays(today, -90)}T00:00:00Z`)
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (error) return [];
  return (data ?? []) as WorkloadActivity[];
}
