// Estructura de una línea: árbol de métricas, orden entre hermanos, embudo y
// carga semanal. Funciones puras (sin React ni Supabase).
import type { MetricBranch, MetricType, ProblemStatus, ExperimentStatus } from "./types";

// -----------------------------------------------------------------------------
// Árbol de métricas
// -----------------------------------------------------------------------------

export interface TreeMetric {
  id: string;
  parent_id: string | null;
  type: MetricType;
  branch: MetricBranch | null;
  sort_order: number;
}

export type MetricTreeNode<T extends TreeMetric> = T & { depth: number; children: MetricTreeNode<T>[] };

const TYPE_RANK: Record<MetricType, number> = { north_star: 0, efficiency: 1, input: 2 };

/** Orden estable: sort_order y, a igualdad, el orden en que llegaron. */
function bySortOrder<T extends TreeMetric>(items: T[], index: Map<string, number>): T[] {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
}

/**
 * Construye el bosque de métricas de una línea. La métrica norte va primero;
 * las raíces restantes (eficiencia, entradas sin padre o con padre borrado)
 * van después. Los ciclos (no deberían existir: la BD los impide) se cortan.
 */
export function buildMetricTree<T extends TreeMetric>(metrics: T[]): MetricTreeNode<T>[] {
  const index = new Map(metrics.map((m, i) => [m.id, i]));
  const ids = new Set(metrics.map((m) => m.id));
  const childrenOf = new Map<string | null, T[]>();
  for (const m of metrics) {
    const parent = m.parent_id && ids.has(m.parent_id) && m.parent_id !== m.id ? m.parent_id : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(m);
    childrenOf.set(parent, list);
  }
  const visited = new Set<string>();
  const build = (m: T, depth: number): MetricTreeNode<T> => {
    visited.add(m.id);
    const kids = bySortOrder(childrenOf.get(m.id) ?? [], index).filter((c) => !visited.has(c.id));
    return { ...m, depth, children: kids.map((c) => build(c, depth + 1)) };
  };
  const roots = [...(childrenOf.get(null) ?? [])].sort(
    (a, b) =>
      TYPE_RANK[a.type] - TYPE_RANK[b.type] || a.sort_order - b.sort_order || (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0),
  );
  return roots.map((r) => build(r, 0));
}

/** Recorre el bosque en profundidad (orden visual). */
export function flattenTree<T extends TreeMetric>(nodes: MetricTreeNode<T>[]): MetricTreeNode<T>[] {
  const out: MetricTreeNode<T>[] = [];
  const walk = (n: MetricTreeNode<T>) => {
    out.push(n);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

/** Ids de todos los descendientes de `id` (sin incluirlo). */
export function descendantIds(metrics: Pick<TreeMetric, "id" | "parent_id">[], id: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const m of metrics) {
    if (!m.parent_id) continue;
    const list = childrenOf.get(m.parent_id) ?? [];
    list.push(m.id);
    childrenOf.set(m.parent_id, list);
  }
  const out = new Set<string>();
  const stack = [...(childrenOf.get(id) ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.has(cur) || cur === id) continue;
    out.add(cur);
    stack.push(...(childrenOf.get(cur) ?? []));
  }
  return out;
}

/**
 * Métricas que pueden ser padre de `id` sin crear un ciclo: todas menos ella
 * misma y sus descendientes. Con `id` null (métrica nueva) sirven todas.
 */
export function parentCandidates<T extends Pick<TreeMetric, "id" | "parent_id">>(metrics: T[], id: string | null): T[] {
  if (!id) return metrics;
  const blocked = descendantIds(metrics, id);
  blocked.add(id);
  return metrics.filter((m) => !blocked.has(m.id));
}

/** ¿Asignar `parentId` como padre de `id` crearía un ciclo? */
export function createsCycle(metrics: Pick<TreeMetric, "id" | "parent_id">[], id: string, parentId: string | null): boolean {
  if (!parentId) return false;
  return parentId === id || descendantIds(metrics, id).has(parentId);
}

/**
 * Opciones para reasignar ejercicios al borrar una métrica: métricas de la
 * misma línea que no se borran con ella (ni ella ni su subárbol).
 */
export function reassignCandidates<T extends Pick<TreeMetric, "id" | "parent_id">>(metrics: T[], id: string): T[] {
  return parentCandidates(metrics, id);
}

/** Cantidad de métricas de entrada por rama (para la leyenda del árbol). */
export function countByBranch(metrics: Pick<TreeMetric, "type" | "branch">[]): Record<MetricBranch, number> {
  const out: Record<MetricBranch, number> = { demand_volume: 0, conversion: 0, efficiency: 0, recovery_recurrence: 0 };
  for (const m of metrics) if (m.type === "input" && m.branch) out[m.branch] += 1;
  return out;
}

// -----------------------------------------------------------------------------
// Orden entre hermanos (métricas y etapas)
// -----------------------------------------------------------------------------

export interface Orderable {
  id: string;
  sort_order: number;
}

export type MoveDirection = "up" | "down";

/**
 * Mueve `id` una posición dentro de `siblings` (ya en orden visual) y
 * normaliza el orden a 0..n−1. Devuelve solo los elementos cuyo sort_order
 * cambia, o null si el movimiento no es posible (extremo o id ajeno).
 */
export function moveWithinSiblings(siblings: Orderable[], id: string, direction: MoveDirection): Orderable[] | null {
  const from = siblings.findIndex((s) => s.id === id);
  if (from < 0) return null;
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= siblings.length) return null;
  const next = [...siblings];
  [next[from], next[to]] = [next[to], next[from]];
  return next.map((s, i) => ({ id: s.id, sort_order: i })).filter((s, i) => next[i].sort_order !== s.sort_order);
}

/** sort_order para agregar un elemento al final de sus hermanos. */
export function nextSortOrder(siblings: Pick<Orderable, "sort_order">[]): number {
  return siblings.length ? Math.max(...siblings.map((s) => s.sort_order)) + 1 : 0;
}

/** Ordena como lo hace la consulta: sort_order y luego orden de llegada. */
export function sortSiblings<T extends Orderable>(items: T[]): T[] {
  return items.map((item, i) => ({ item, i })).sort((a, b) => a.item.sort_order - b.item.sort_order || a.i - b.i).map((x) => x.item);
}

// -----------------------------------------------------------------------------
// Embudo
// -----------------------------------------------------------------------------

export interface FunnelStageStats {
  stageId: string;
  /** Problemas no descartados de la etapa. */
  problems: number;
  validatedProblems: number;
  /** Ejercicios no descartados cuyo problema está en la etapa. */
  experiments: number;
  /** Sin problemas ni ejercicios. */
  empty: boolean;
  /** Hay problemas validados y ningún ejercicio: exige atención. */
  needsAttention: boolean;
}

export function funnelStats(
  stages: { id: string }[],
  problems: { id: string; stage_id: string; status: ProblemStatus }[],
  experiments: { problem_id: string; stage_id?: string | null; status: ExperimentStatus }[],
): FunnelStageStats[] {
  const stageOfProblem = new Map(problems.map((p) => [p.id, p.stage_id]));
  return stages.map((s) => {
    const own = problems.filter((p) => p.stage_id === s.id && p.status !== "discarded");
    const validated = own.filter((p) => p.status === "validated").length;
    const exps = experiments.filter(
      (e) => e.status !== "discarded" && (e.stage_id ?? stageOfProblem.get(e.problem_id)) === s.id,
    ).length;
    return {
      stageId: s.id,
      problems: own.length,
      validatedProblems: validated,
      experiments: exps,
      empty: own.length === 0 && exps === 0,
      needsAttention: validated > 0 && exps === 0,
    };
  });
}

/** Ancho relativo (0–1) de cada barra del embudo: decrece de 1 a `min`. */
export function funnelWidths(count: number, min = 0.45): number[] {
  if (count <= 0) return [];
  if (count === 1) return [1];
  return Array.from({ length: count }, (_, i) => 1 - ((1 - min) * i) / (count - 1));
}

// -----------------------------------------------------------------------------
// Carga semanal
// -----------------------------------------------------------------------------

/**
 * Lee un número escrito a mano. Acepta "1234,5", "1234.5", "1.234,5",
 * "1,234.5" y "1.234.567". Con un solo separador se toma como decimal.
 * Devuelve null si está vacío y NaN si no es un número.
 */
export function parseDecimal(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : Number.NaN;
  let s = raw.trim().replace(/\s/g, "").replace(/^\$/, "").replace(/%$/, "");
  if (!s) return null;
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    // El último separador es el decimal.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    s = (s.match(/,/g)?.length ?? 0) > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot && (s.match(/\./g)?.length ?? 0) > 1) {
    s = s.replace(/\./g, "");
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return Number.NaN;
  return Number(s);
}

/** Valor numérico para mostrar en un campo editable ("1234,5"). */
export function toInputValue(value: number | null | undefined): string {
  return value == null ? "" : String(value).replace(".", ",");
}

export interface WeeklyDraft {
  value: string;
  note: string;
}

export interface WeeklySaved {
  value: number;
  note: string | null;
}

export interface WeeklyRow {
  metric_id: string;
  value: number;
  note: string | null;
}

/**
 * Compara lo escrito con lo guardado y devuelve solo las filas que cambiaron,
 * más los errores por métrica (valor inválido, vaciar un valor guardado o
 * dejar una nota sin valor).
 */
export function diffWeeklyLoad(
  metricIds: string[],
  saved: Map<string, WeeklySaved>,
  draft: Map<string, WeeklyDraft>,
): { rows: WeeklyRow[]; errors: Map<string, string> } {
  const rows: WeeklyRow[] = [];
  const errors = new Map<string, string>();
  for (const id of metricIds) {
    const d = draft.get(id);
    if (!d) continue;
    const prev = saved.get(id);
    const value = parseDecimal(d.value);
    const note = d.note.trim() ? d.note.trim() : null;
    if (value != null && Number.isNaN(value)) {
      errors.set(id, "Escribe un número (p. ej. 1234,5).");
      continue;
    }
    if (value == null) {
      if (prev) errors.set(id, "Un valor guardado no se puede dejar vacío; corrígelo con el valor correcto.");
      else if (note) errors.set(id, "Escribe el valor para poder guardar la nota.");
      continue;
    }
    if (prev && prev.value === value && (prev.note ?? null) === note) continue;
    rows.push({ metric_id: id, value, note });
  }
  return { rows, errors };
}

/** Métricas sin valor guardado en la semana. */
export function pendingMetricIds(metricIds: string[], saved: Map<string, unknown>): string[] {
  return metricIds.filter((id) => !saved.has(id));
}

// -----------------------------------------------------------------------------
// Avance frente a la línea base
// -----------------------------------------------------------------------------

/**
 * Cambio relativo del último valor frente a la línea base y si va en la
 * dirección deseada. `ratio` es null si falta un dato o la base es 0.
 */
export function changeVsBaseline(
  last: number | null | undefined,
  baseline: number | null | undefined,
  direction: "up" | "down",
): { ratio: number | null; favorable: boolean | null } {
  if (last == null || baseline == null) return { ratio: null, favorable: null };
  const diff = last - baseline;
  const ratio = baseline === 0 ? null : diff / Math.abs(baseline);
  const favorable = diff === 0 ? null : direction === "up" ? diff > 0 : diff < 0;
  return { ratio, favorable };
}
