// Vista de dirección: resume cada programa (métricas norte frente a la meta,
// ejercicios corriendo, cerrados, ganadores, valor estimado y decisiones
// pendientes) y responde "¿Estamos creciendo?" sobre el conjunto.
// Funciones puras: reciben los datos ya leídos.
import { summarizeResults, type WinnerValueSummary } from "./dashboards";
import { todayIso } from "./dates";
import { isClosed } from "./lifecycle";
import { evaluateTarget, type TargetEvaluation, type TargetHorizon, type TargetStatus } from "./targets";
import type { Decision, ExperimentStatus, IsoDate, MetricDirection, TestType, Variant, Verdict } from "./types";
import type { MetricEconomics } from "./value";

export interface RollupNorthStar {
  metric_id: string;
  metric_name: string;
  line_id: string;
  line_name: string;
  unit: string | null;
  direction: MetricDirection;
  baseline: number | null;
  targets: { horizon_id: string; target: number }[];
  values: { week_start: IsoDate; value: number }[];
}

export interface RollupExperiment {
  id: string;
  title: string;
  status: ExperimentStatus;
  line_name: string;
  metric_id: string;
  test_type: TestType | null;
  verdict: Verdict | null;
  decision: Decision | null;
  /** timestamptz de la decisión. */
  decided_at: string | null;
  status_changed_at: string;
  final_score?: number | null;
  variants: Variant[];
}

export interface ProgramRollupInput {
  id: string;
  name: string;
  is_demo: boolean;
  start_date: IsoDate | null;
  horizons: TargetHorizon[];
  northStars: RollupNorthStar[];
  experiments: RollupExperiment[];
  /** Datos económicos por métrica del árbol (para el valor estimado). */
  economics: Map<string, MetricEconomics>;
  today: IsoDate;
}

export interface NorthStarStatus {
  line_id: string;
  line_name: string;
  metric_id: string;
  metric_name: string;
  unit: string | null;
  direction: MetricDirection;
  evaluation: TargetEvaluation;
  values: { week_start: IsoDate; value: number }[];
}

export interface PendingDecision {
  id: string;
  title: string;
  line_name: string;
  /** Desde cuándo está en lectura (timestamptz). */
  since: string;
}

export interface ProgramRollup {
  id: string;
  name: string;
  is_demo: boolean;
  northStars: NorthStarStatus[];
  statusCounts: Record<TargetStatus, number>;
  /** Peor semáforo entre las métricas norte con datos; no_data si ninguna tiene. */
  health: TargetStatus;
  running: number;
  closedThisMonth: number;
  winnersThisMonth: number;
  closedTotal: number;
  winnersTotal: number;
  /** Ganadores / cerrados (0–1); null si no hay cerrados. */
  hitRate: number | null;
  /** Valor estimado de todos los ganadores cerrados. */
  value: WinnerValueSummary | null;
  pendingDecisions: PendingDecision[];
}

/** Fecha (Bogotá) de un timestamptz. */
export function bogotaDate(ts: string | null | undefined): IsoDate | null {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? todayIso(d) : null;
}

export function sameMonth(a: IsoDate | null, b: IsoDate): boolean {
  return !!a && a.slice(0, 7) === b.slice(0, 7);
}

const SEVERITY: Record<TargetStatus, number> = { no_data: 0, on_track: 1, behind: 2, off_track: 3 };

export function worstStatus(statuses: TargetStatus[]): TargetStatus {
  return statuses.reduce<TargetStatus>((worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst), "no_data");
}

export function evaluateNorthStars(input: Pick<ProgramRollupInput, "northStars" | "horizons" | "start_date" | "today">): NorthStarStatus[] {
  return input.northStars.map((n) => ({
    line_id: n.line_id,
    line_name: n.line_name,
    metric_id: n.metric_id,
    metric_name: n.metric_name,
    unit: n.unit,
    direction: n.direction,
    values: [...n.values].sort((a, b) => a.week_start.localeCompare(b.week_start)),
    evaluation: evaluateTarget({
      baseline: n.baseline,
      direction: n.direction,
      targets: n.targets,
      horizons: input.horizons,
      values: n.values,
      today: input.today,
      programStart: input.start_date,
    }),
  }));
}

function withEconomics(e: RollupExperiment, economics: Map<string, MetricEconomics>) {
  return { ...e, metric: economics.get(e.metric_id) ?? null };
}

export function rollupProgram(input: ProgramRollupInput): ProgramRollup {
  const northStars = evaluateNorthStars(input);
  const statusCounts: Record<TargetStatus, number> = { on_track: 0, behind: 0, off_track: 0, no_data: 0 };
  for (const n of northStars) statusCounts[n.evaluation.status] += 1;

  const closed = input.experiments.filter((e) => isClosed(e.status));
  const closedThisMonth = closed.filter((e) => sameMonth(bogotaDate(e.decided_at), input.today));
  const all = summarizeResults(closed.map((e) => withEconomics(e, input.economics)));

  return {
    id: input.id,
    name: input.name,
    is_demo: input.is_demo,
    northStars,
    statusCounts,
    health: worstStatus(northStars.map((n) => n.evaluation.status)),
    running: input.experiments.filter((e) => e.status === "in_test").length,
    closedThisMonth: closedThisMonth.length,
    winnersThisMonth: closedThisMonth.filter((e) => e.verdict === "winner").length,
    closedTotal: all.closed,
    winnersTotal: all.winners,
    hitRate: all.winRate,
    value: all.winnerValue,
    pendingDecisions: input.experiments
      .filter((e) => e.status === "in_reading")
      .sort((a, b) => a.status_changed_at.localeCompare(b.status_changed_at))
      .map((e) => ({ id: e.id, title: e.title, line_name: e.line_name, since: e.status_changed_at })),
  };
}

export type GrowthAnswer = "yes" | "mixed" | "no" | "unknown";

export interface DirectionHeadline {
  answer: GrowthAnswer;
  answerTitle: string;
  answerText: string;
  northStarsTotal: number;
  northStarsEvaluated: number;
  northStarsOnTrack: number;
  northStarsOffTrack: number;
  running: number;
  closedThisMonth: number;
  winnersThisMonth: number;
  closedTotal: number;
  winnersTotal: number;
  hitRate: number | null;
  /** Valor mensual estimado de los ganadores (suma de los que se pudieron calcular). */
  monthlyValue: number | null;
  valueCounted: number;
  missingUnitValue: number;
  pendingDecisions: number;
  /** El resumen incluye el programa de ejemplo (solo si no hay programas reales). */
  includesDemo: boolean;
  programs: number;
}

/**
 * Respuesta a "¿Estamos creciendo?":
 * - unknown: ninguna métrica norte tiene meta y valores.
 * - yes: al menos 2 de cada 3 van bien y ninguna va muy atrás.
 * - no: la mitad o más va muy atrás.
 * - mixed: lo demás.
 */
export function growthAnswer(onTrack: number, offTrack: number, evaluated: number): GrowthAnswer {
  if (evaluated === 0) return "unknown";
  if (onTrack / evaluated >= 2 / 3 && offTrack === 0) return "yes";
  if (offTrack / evaluated >= 0.5) return "no";
  return "mixed";
}

const ANSWER_COPY: Record<GrowthAnswer, { title: string; text: (h: { on: number; evaluated: number }) => string }> = {
  yes: {
    title: "Sí, vamos creciendo",
    text: ({ on, evaluated }) => `${on} de ${evaluated} métricas norte van en la meta o adelante. ¡Eso! Sigan así.`,
  },
  mixed: {
    title: "Más o menos",
    text: ({ on, evaluated }) =>
      `${on} de ${evaluated} métricas norte van en la meta. Las que van atrás necesitan oportunidades de mejora y ejercicios que las muevan.`,
  },
  no: {
    title: "Todavía no",
    text: ({ on, evaluated }) =>
      `Solo ${on} de ${evaluated} métricas norte van en la meta. Hay que revisar qué se está probando: menos carreta, más crecimiento.`,
  },
  unknown: {
    title: "Todavía no se puede saber",
    text: () => "Faltan metas por horizonte o valores semanales en las métricas norte. Sin dato no hay camino.",
  },
};

export function directionHeadline(rollups: ProgramRollup[]): DirectionHeadline {
  const real = rollups.filter((r) => !r.is_demo);
  const scope = real.length ? real : rollups;
  let total = 0;
  let on = 0;
  let off = 0;
  let noData = 0;
  let monthly = 0;
  let valueCounted = 0;
  let missingUnitValue = 0;
  let running = 0;
  let closedThisMonth = 0;
  let winnersThisMonth = 0;
  let closedTotal = 0;
  let winnersTotal = 0;
  let pending = 0;
  for (const r of scope) {
    total += r.northStars.length;
    on += r.statusCounts.on_track;
    off += r.statusCounts.off_track;
    noData += r.statusCounts.no_data;
    running += r.running;
    closedThisMonth += r.closedThisMonth;
    winnersThisMonth += r.winnersThisMonth;
    closedTotal += r.closedTotal;
    winnersTotal += r.winnersTotal;
    pending += r.pendingDecisions.length;
    if (r.value) {
      monthly += r.value.monthly;
      valueCounted += r.value.counted;
      missingUnitValue += r.value.missingUnitValue;
    }
  }
  const evaluated = total - noData;
  const answer = growthAnswer(on, off, evaluated);
  return {
    answer,
    answerTitle: ANSWER_COPY[answer].title,
    answerText: ANSWER_COPY[answer].text({ on, evaluated }),
    northStarsTotal: total,
    northStarsEvaluated: evaluated,
    northStarsOnTrack: on,
    northStarsOffTrack: off,
    running,
    closedThisMonth,
    winnersThisMonth,
    closedTotal,
    winnersTotal,
    hitRate: closedTotal ? winnersTotal / closedTotal : null,
    monthlyValue: valueCounted ? monthly : null,
    valueCounted,
    missingUnitValue,
    pendingDecisions: pending,
    includesDemo: !real.length && rollups.some((r) => r.is_demo),
    programs: scope.length,
  };
}
