// Tiempo de ciclo: cuántos días se quedan los ejercicios en cada estado antes
// de avanzar, y cuánto tardan desde que nacen hasta dejar un aprendizaje.
// Sale de la bitácora (activity_log, action = 'status_changed' con payload
// { from, to }; la decisión llega como action = 'verdict', que es el paso de
// En lectura a Decidido). Funciones puras.
import { STATUS_LABEL } from "./labels";
import type { ExperimentStatus } from "./types";

/** Tramos que se miden, en el orden del ciclo. */
export const CYCLE_STAGES = ["idea", "prioritized", "in_design", "in_test", "in_reading"] as const;
export type CycleStage = (typeof CYCLE_STAGES)[number];

const NEXT: Record<CycleStage, ExperimentStatus> = {
  idea: "prioritized",
  prioritized: "in_design",
  in_design: "in_test",
  in_test: "in_reading",
  in_reading: "decided",
};

export const CYCLE_STAGE_LABEL: Record<CycleStage, string> = Object.fromEntries(
  CYCLE_STAGES.map((s) => [s, `${STATUS_LABEL[s]} → ${STATUS_LABEL[NEXT[s]]}`]),
) as Record<CycleStage, string>;

export interface CycleExperiment {
  id: string;
  owner_id: string | null;
  created_at: string;
  status: ExperimentStatus;
  decided_at: string | null;
}

export interface CycleEvent {
  entity_id: string;
  created_at: string;
  action: string;
  payload: unknown;
}

export interface StageStat {
  stage: CycleStage;
  label: string;
  /** Mediana en días (a un decimal), o null sin datos. */
  medianDays: number | null;
  /** Ejercicios que ya salieron de ese estado hacia adelante. */
  count: number;
}

export interface CycleTimeSummary {
  stages: StageStat[];
  /** Mediana de días desde que se creó hasta la decisión. */
  timeToLearning: { medianDays: number | null; count: number };
  /** Tramo con la mediana más alta (con al menos un dato). */
  bottleneck: StageStat | null;
}

const DAY_MS = 86_400_000;
/** Mediana mínima (en días) para señalar un tramo como cuello de botella. */
export const MIN_BOTTLENECK_DAYS = 1;
const ORDER: ExperimentStatus[] = ["idea", "prioritized", "in_design", "in_test", "in_reading", "decided", "scaled"];

function rank(s: ExperimentStatus): number {
  const i = ORDER.indexOf(s);
  return i < 0 ? -1 : i;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

interface Transition {
  at: number;
  from: ExperimentStatus | null;
  to: ExperimentStatus;
}

/** Convierte una fila de la bitácora en una transición (o null si no aplica). */
export function toTransition(e: CycleEvent): Transition | null {
  const at = new Date(e.created_at).getTime();
  if (!Number.isFinite(at)) return null;
  if (e.action === "verdict") return { at, from: "in_reading", to: "decided" };
  if (e.action !== "status_changed") return null;
  const p = (e.payload ?? {}) as { from?: unknown; to?: unknown };
  if (typeof p.to !== "string") return null;
  return { at, from: typeof p.from === "string" ? (p.from as ExperimentStatus) : null, to: p.to as ExperimentStatus };
}

/**
 * Días que un ejercicio pasó en cada estado, contando solo los estados de los
 * que salió hacia adelante (si volvió atrás, el tiempo se suma igual).
 */
export function daysInStages(exp: CycleExperiment, events: CycleEvent[]): Partial<Record<CycleStage, number>> {
  const transitions = events
    .map(toTransition)
    .filter((t): t is Transition => !!t)
    .sort((a, b) => a.at - b.at)
    // Un 'verdict' repetido junto a un status_changed a decidido: se queda el primero.
    .filter((t, i, all) => !(t.to === "decided" && all.slice(0, i).some((x) => x.to === "decided")));
  const created = new Date(exp.created_at).getTime();
  if (!Number.isFinite(created)) return {};

  const spent: Partial<Record<CycleStage, number>> = {};
  const forward = new Set<CycleStage>();
  let current: ExperimentStatus = transitions[0]?.from ?? exp.status;
  let since = created;
  for (const t of transitions) {
    const from = t.from ?? current;
    if ((CYCLE_STAGES as readonly string[]).includes(from)) {
      const stage = from as CycleStage;
      spent[stage] = (spent[stage] ?? 0) + Math.max(0, t.at - since) / DAY_MS;
      if (rank(t.to) > rank(from)) forward.add(stage);
    }
    current = t.to;
    since = t.at;
  }
  const out: Partial<Record<CycleStage, number>> = {};
  for (const s of forward) out[s] = spent[s];
  return out;
}

/** Días desde que se creó hasta la decisión (null si no se ha decidido). */
export function daysToLearning(exp: CycleExperiment, events: CycleEvent[]): number | null {
  const created = new Date(exp.created_at).getTime();
  let decided = exp.decided_at ? new Date(exp.decided_at).getTime() : NaN;
  if (!Number.isFinite(decided)) {
    const t = events
      .map(toTransition)
      .filter((x): x is Transition => !!x && x.to === "decided")
      .sort((a, b) => a.at - b.at)[0];
    decided = t?.at ?? NaN;
  }
  if (!Number.isFinite(created) || !Number.isFinite(decided)) return null;
  return Math.max(0, decided - created) / DAY_MS;
}

/** Resumen del tiempo de ciclo para un grupo de ejercicios. */
export function summarizeCycleTime(experiments: CycleExperiment[], events: CycleEvent[]): CycleTimeSummary {
  const byExp = new Map<string, CycleEvent[]>();
  for (const e of events) byExp.set(e.entity_id, [...(byExp.get(e.entity_id) ?? []), e]);

  const perStage = new Map<CycleStage, number[]>(CYCLE_STAGES.map((s) => [s, []]));
  const learning: number[] = [];
  for (const exp of experiments) {
    const evs = byExp.get(exp.id) ?? [];
    const days = daysInStages(exp, evs);
    for (const s of CYCLE_STAGES) if (days[s] != null) perStage.get(s)!.push(days[s] as number);
    if (exp.status === "decided" || exp.status === "scaled") {
      const d = daysToLearning(exp, evs);
      if (d != null) learning.push(d);
    }
  }

  const stages: StageStat[] = CYCLE_STAGES.map((stage) => {
    const list = perStage.get(stage)!;
    return { stage, label: CYCLE_STAGE_LABEL[stage], medianDays: round1(median(list)), count: list.length };
  });
  // Un tramo de menos de un día no es cuello de botella (p. ej. datos cargados de un tirón).
  let bottleneck: StageStat | null = null;
  for (const s of stages) {
    if (s.medianDays == null || s.medianDays < MIN_BOTTLENECK_DAYS) continue;
    if (!bottleneck || s.medianDays > (bottleneck.medianDays as number)) bottleneck = s;
  }
  return { stages, timeToLearning: { medianDays: round1(median(learning)), count: learning.length }, bottleneck };
}

/** Resumen por responsable (owner_id; null = sin responsable). */
export function cycleTimeByOwner(experiments: CycleExperiment[], events: CycleEvent[]): Map<string | null, CycleTimeSummary> {
  const groups = new Map<string | null, CycleExperiment[]>();
  for (const e of experiments) groups.set(e.owner_id, [...(groups.get(e.owner_id) ?? []), e]);
  const ids = new Map<string | null, Set<string>>();
  for (const [owner, list] of groups) ids.set(owner, new Set(list.map((e) => e.id)));
  const out = new Map<string | null, CycleTimeSummary>();
  for (const [owner, list] of groups) {
    const set = ids.get(owner)!;
    out.set(owner, summarizeCycleTime(list, events.filter((e) => set.has(e.entity_id))));
  }
  return out;
}

/** "12 días", "1 día", "0,5 días". */
export function formatDays(days: number | null): string {
  if (days == null) return "—";
  const text = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(days);
  return `${text} ${days === 1 ? "día" : "días"}`;
}

/** "El cuello de botella está en En lectura: 12 días en mediana". Null sin datos. */
export function bottleneckText(summary: CycleTimeSummary): string | null {
  const b = summary.bottleneck;
  if (!b || b.medianDays == null) return null;
  return `El cuello de botella está en ${STATUS_LABEL[b.stage]}: ${formatDays(b.medianDays)} en mediana`;
}
