// "Lo que toca hoy" en el resumen del programa y las vistas rápidas del
// backlog. Funciones puras: reciben los datos ya leídos y deciden qué mostrar.
import { addDays, daysBetween } from "./dates";
import { controlPenalty, DEFAULT_SCORING } from "./scoring";
import type { TargetStatus } from "./targets";
import type { CalendarEvent, ControlLevel, ExperimentStatus, IsoDate, ScoringConfig } from "./types";

// -----------------------------------------------------------------------------
// Días corridos de una prueba
// -----------------------------------------------------------------------------

/** Días desde el inicio real; un inicio en el futuro cuenta como 0. Null si no ha empezado. */
export function daysRunning(actualStart: IsoDate | null | undefined, today: IsoDate): number | null {
  if (!actualStart) return null;
  return Math.max(0, daysBetween(actualStart, today));
}

export interface ReadinessInput {
  status: ExperimentStatus;
  actual_start: IsoDate | null;
  min_duration_days: number | null;
}

/** En prueba y ya cumplió la duración mínima: se puede pasar a lectura. */
export function isReadyToRead(e: ReadinessInput, today: IsoDate): boolean {
  if (e.status !== "in_test" || e.min_duration_days == null) return false;
  const days = daysRunning(e.actual_start, today);
  return days != null && days >= e.min_duration_days;
}

// -----------------------------------------------------------------------------
// Lo que toca hoy
// -----------------------------------------------------------------------------

export type HomeItemKind =
  | "north_star_off_track"
  | "ready_to_read"
  | "calendar_soon"
  | "assigned"
  | "learning_to_try"
  | "stale_ideas";

export interface HomeItem {
  kind: HomeItemKind;
  /** Clave estable para React. */
  key: string;
  title: string;
  detail: string;
  /** Ruta relativa al programa ("/ejercicios/…"). */
  path: string;
  /** Menor = más urgente. */
  priority: number;
  /** Acción secundaria opcional (p. ej. "Convertir en problema"). */
  secondary?: { label: string; path: string };
}

export interface HomeExperiment extends ReadinessInput {
  id: string;
  title: string;
  line_name: string;
  owner_id: string | null;
  status_changed_at: string;
  line_id?: string;
  derived_from_learning_id?: string | null;
}

export interface HomeLearning {
  id: string;
  /** Línea del ejercicio que dejó el aprendizaje. */
  lineId: string;
  lineName: string;
  appliesToLineIds: string[];
}

export interface HomeNorthStar {
  metricId: string;
  lineId: string;
  lineName: string;
  metricName: string;
  status: TargetStatus;
  /** Diferencia relativa a favor (negativa = atrás). */
  gap: number | null;
}

export interface HomeInput {
  today: IsoDate;
  userId: string;
  northStars: HomeNorthStar[];
  experiments: HomeExperiment[];
  calendar: CalendarEvent[];
  learnings?: HomeLearning[];
  /** Líneas del programa (para nombrar a qué línea aplica un aprendizaje). */
  lines?: { id: string; name: string }[];
  /** Días hacia adelante para avisar picos y congelamientos. */
  calendarWindowDays?: number;
  /** Días sin movimiento para considerar una idea quieta. */
  staleDays?: number;
  limit?: number;
}

const PRIORITY: Record<HomeItemKind, number> = {
  north_star_off_track: 1,
  ready_to_read: 2,
  calendar_soon: 3,
  assigned: 4,
  learning_to_try: 5,
  stale_ideas: 6,
};

const ASSIGNED_ACTION: Partial<Record<ExperimentStatus, string>> = {
  prioritized: "Está priorizado: toca diseñarlo.",
  in_design: "Está en diseño: termine el diseño y láncelo.",
  in_reading: "Está en lectura: toca emitir el veredicto.",
};

function pct(ratio: number): string {
  return `${Math.round(Math.abs(ratio) * 100)} %`;
}

/** Hasta `limit` (5) cosas por hacer hoy, de la más urgente a la menos. */
export function homeItems(input: HomeInput): HomeItem[] {
  const { today, userId } = input;
  const windowDays = input.calendarWindowDays ?? 14;
  const staleDays = input.staleDays ?? 30;
  const items: HomeItem[] = [];

  for (const n of input.northStars) {
    if (n.status !== "off_track") continue;
    items.push({
      kind: "north_star_off_track",
      key: `ns-${n.lineId}`,
      title: `${n.lineName}: la métrica norte va muy atrás`,
      detail: `${n.metricName}${n.gap != null ? ` va ${pct(n.gap)} por debajo de lo esperado` : ""}. Revise el árbol y busque dónde se pierde.`,
      path: `/lineas/${n.lineId}?tab=norte`,
      priority: PRIORITY.north_star_off_track,
      secondary: { label: "Convertir en oportunidad de mejora", path: problemFromMetricPath(n.metricId) },
    });
  }

  const ready = new Set<string>();
  for (const e of input.experiments) {
    if (!isReadyToRead(e, today)) continue;
    ready.add(e.id);
    items.push({
      kind: "ready_to_read",
      key: `read-${e.id}`,
      title: `Listo para leer: ${e.title}`,
      detail: `${e.line_name} · lleva ${daysRunning(e.actual_start, today)} días (mínimo ${e.min_duration_days}). Páselo a En lectura.`,
      path: `/ejercicios/${e.id}`,
      priority: PRIORITY.ready_to_read,
    });
  }

  const horizon = addDays(today, windowDays);
  for (const c of input.calendar) {
    if (c.type === "decision" || c.start_date < today || c.start_date > horizon) continue;
    const days = daysBetween(today, c.start_date);
    const when = days === 0 ? "empieza hoy" : days === 1 ? "empieza mañana" : `empieza en ${days} días`;
    items.push({
      kind: "calendar_soon",
      key: `cal-${c.id}`,
      title: `${c.type === "freeze" ? "Congelamiento" : "Pico"}: ${c.name} ${when}`,
      detail:
        c.type === "freeze"
          ? "Lo que no se lance antes, espera hasta que pase. Revise el Gantt."
          : "Temporada fuerte: asegure que lo que corre se pueda leer a tiempo.",
      path: "/tableros/gantt",
      priority: PRIORITY.calendar_soon,
    });
  }

  for (const e of input.experiments) {
    if (e.owner_id !== userId || ready.has(e.id)) continue;
    const action = ASSIGNED_ACTION[e.status];
    if (!action) continue;
    items.push({
      kind: "assigned",
      key: `mine-${e.id}`,
      title: `Suyo: ${e.title}`,
      detail: `${e.line_name} · ${action}`,
      path: `/ejercicios/${e.id}`,
      priority: PRIORITY.assigned,
    });
  }

  const lineName = new Map((input.lines ?? []).map((l) => [l.id, l.name]));
  for (const l of input.learnings ?? []) {
    for (const target of l.appliesToLineIds) {
      if (target === l.lineId || !lineName.has(target)) continue;
      const tried = input.experiments.some((e) => e.derived_from_learning_id === l.id && e.line_id === target);
      if (tried) continue;
      items.push({
        kind: "learning_to_try",
        key: `learn-${l.id}-${target}`,
        title: `${l.lineName} aprendió algo que aplica a ${lineName.get(target)}. ¿Lo prueba?`,
        detail: "Un aprendizaje que no se prueba en otra línea es plata en el piso.",
        path: `/ejercicios/nuevo?aprendizaje=${l.id}&linea=${target}`,
        priority: PRIORITY.learning_to_try,
      });
    }
  }

  const stale = input.experiments.filter(
    (e) => e.status === "idea" && daysBetween(e.status_changed_at.slice(0, 10), today) >= staleDays,
  );
  if (stale.length) {
    items.push({
      kind: "stale_ideas",
      key: "stale-ideas",
      title:
        stale.length === 1
          ? `1 idea lleva más de ${staleDays} días quieta`
          : `${stale.length} ideas llevan más de ${staleDays} días quietas`,
      detail: "Califíquelas con ICE o descártelas: el backlog no es bodega.",
      path: "/ejercicios?estado=idea",
      priority: PRIORITY.stale_ideas,
    });
  }

  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => a.item.priority - b.item.priority || a.i - b.i)
    .slice(0, input.limit ?? 5)
    .map((x) => x.item);
}

/** Ruta (relativa al programa) para crear un problema desde una métrica que va atrás. */
export function problemFromMetricPath(metricId: string): string {
  return `/problemas/nuevo?metrica=${metricId}`;
}

/** ¿Merece el atajo "Convertir en problema"? Solo si va atrás o muy atrás. */
export function suggestsProblem(status: TargetStatus): boolean {
  return status === "behind" || status === "off_track";
}

// -----------------------------------------------------------------------------
// Acciones en lote del backlog
// -----------------------------------------------------------------------------

export interface BulkItemResult {
  id: string;
  ok: boolean;
  error?: string;
}

export type BulkAction = "prioritized" | "discarded" | "assigned";

const BULK_DONE: Record<BulkAction, [string, string]> = {
  prioritized: ["priorizado", "priorizados"],
  discarded: ["descartado", "descartados"],
  assigned: ["asignado", "asignados"],
};

/**
 * Resumen para el aviso: "¡Eso! 4 priorizados · 1 no se pudo: falta ICE".
 * Si varios fallan por motivos distintos, muestra el más común.
 */
export function bulkSummary(action: BulkAction, results: BulkItemResult[]): { tone: "success" | "error" | "mixed"; text: string } {
  const done = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const [one, many] = BULK_DONE[action];
  const doneText = `${done} ${done === 1 ? one : many}`;
  if (!failed.length) return { tone: "success", text: `¡Eso! ${doneText}` };
  const counts = new Map<string, number>();
  for (const f of failed) counts.set(f.error ?? "", (counts.get(f.error ?? "") ?? 0) + 1);
  const reason = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const failText = `${failed.length} no se ${failed.length === 1 ? "pudo" : "pudieron"}${reason ? `: ${reason.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())}` : ""}`;
  if (!done) return { tone: "error", text: `Ese camino no era. ${failText}` };
  return { tone: "mixed", text: `¡Eso! ${doneText} · ${failText}` };
}

// -----------------------------------------------------------------------------
// Vistas rápidas del backlog (?vista=)
// -----------------------------------------------------------------------------

export const BACKLOG_VIEWS = ["semana", "disenar", "alto-impacto", "corriendo", "todos"] as const;
export type BacklogView = (typeof BACKLOG_VIEWS)[number];

export const BACKLOG_VIEW_LABEL: Record<BacklogView, string> = {
  semana: "Lo que toca esta semana",
  disenar: "Listos para diseñar",
  "alto-impacto": "Alto impacto sin empezar",
  corriendo: "Corriendo ahora",
  todos: "Todos",
};

export function parseBacklogView(raw: string | string[] | undefined): BacklogView | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (BACKLOG_VIEWS as readonly string[]).includes(v ?? "") ? (v as BacklogView) : null;
}

export interface BacklogViewExperiment extends ReadinessInput {
  impact: number | null;
  planned_start: IsoDate | null;
}

/** Impacto desde el cual un ejercicio cuenta como "alto impacto". */
export const HIGH_IMPACT = 7;

/**
 * ¿El ejercicio entra en la vista? Sin vista se muestran los abiertos (ni
 * decididos, ni escalados, ni descartados).
 */
export function matchesBacklogView(e: BacklogViewExperiment, view: BacklogView | null, today: IsoDate): boolean {
  switch (view) {
    case "semana": {
      const weekAhead = addDays(today, 7);
      return (
        isReadyToRead(e, today) ||
        e.status === "in_reading" ||
        ((e.status === "prioritized" || e.status === "in_design") && !!e.planned_start && e.planned_start <= weekAhead)
      );
    }
    case "disenar":
      return e.status === "prioritized";
    case "alto-impacto":
      return (e.status === "idea" || e.status === "prioritized") && (e.impact ?? 0) >= HIGH_IMPACT;
    case "corriendo":
      return e.status === "in_test" || e.status === "in_reading";
    case "todos":
      return true;
    default:
      return !["decided", "scaled", "discarded"].includes(e.status);
  }
}

// -----------------------------------------------------------------------------
// Filtros del puntaje en palabras
// -----------------------------------------------------------------------------

/** "+1 calendario · −1 control", o "Sin ajustes". */
export function describeScoreFilters(
  e: { fits_calendar: boolean; control: ControlLevel },
  config: ScoringConfig = DEFAULT_SCORING,
): string {
  const parts: string[] = [];
  if (e.fits_calendar && config.calendar_bonus) parts.push(`+${config.calendar_bonus} calendario`);
  const penalty = controlPenalty(e.control, config);
  if (penalty) parts.push(`−${penalty} control`);
  return parts.length ? parts.join(" · ") : "Sin ajustes";
}
