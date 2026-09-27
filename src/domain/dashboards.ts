// Cálculos de los tableros (resultados, portafolio y velocidad). Funciones puras.
import { addDays, mondaysBetween, weekStart } from "./dates";
import { isActive, isClosed } from "./lifecycle";
import { computeVariantResults, headlineDiff, readExperiment } from "./results";
import type { Decision, ExperimentStatus, IsoDate, TestType, Variant, Verdict } from "./types";
import type { MetricEconomics } from "./value";

export interface ClosedExperimentInput {
  id: string;
  status: ExperimentStatus;
  verdict: Verdict | null;
  decision: Decision | null;
  variants: Variant[];
  test_type?: TestType | null;
  /** Datos económicos de la métrica del árbol (para el valor estimado). */
  metric?: Pick<MetricEconomics, "unit" | "baseline" | "latest_value" | "unit_value" | "direction"> | null;
}

export interface WinnerValueSummary {
  /** Suma del valor semanal estimado de los ganadores que se pudieron calcular. */
  weekly: number;
  monthly: number;
  /** Ganadores incluidos en la suma. */
  counted: number;
  /** Ganadores sin valor por unidad en su métrica. */
  missingUnitValue: number;
}

export interface ResultsSummary {
  closed: number;
  winners: number;
  /** Tasa de acierto: ganadores / cerrados (0–1); null si no hay cerrados. */
  winRate: number | null;
  /** Promedio de la diferencia vs control de los ganadores. */
  avgWinnerDiff: number | null;
  /** Valor estimado de los ganadores si se escalan; null si ninguno se pudo calcular. */
  winnerValue: WinnerValueSummary | null;
  verdicts: Record<Verdict, number>;
  decisions: Record<Decision, number>;
}

export function summarizeResults(experiments: ClosedExperimentInput[]): ResultsSummary {
  const closed = experiments.filter((e) => isClosed(e.status));
  const winners = closed.filter((e) => e.verdict === "winner");
  const winnerDiffs = winners
    .map((e) => headlineDiff(computeVariantResults(e.variants)))
    .filter((d): d is number => d != null);
  const verdicts: Record<Verdict, number> = { winner: 0, loser: 0, inconclusive: 0 };
  const decisions: Record<Decision, number> = { scale: 0, adjust: 0, kill: 0 };
  for (const e of closed) {
    if (e.verdict) verdicts[e.verdict] += 1;
    if (e.decision) decisions[e.decision] += 1;
  }
  let weekly = 0;
  let counted = 0;
  let missingUnitValue = 0;
  for (const e of winners) {
    const h = readExperiment({ variants: e.variants, testType: e.test_type, metric: e.metric }).headline;
    if (h?.value_estimate) {
      weekly += h.value_estimate.weekly;
      counted += 1;
    } else if (h?.value_missing === "unit_value") missingUnitValue += 1;
  }
  return {
    closed: closed.length,
    winners: winners.length,
    winRate: closed.length ? winners.length / closed.length : null,
    avgWinnerDiff: winnerDiffs.length ? winnerDiffs.reduce((a, b) => a + b, 0) / winnerDiffs.length : null,
    winnerValue: counted ? { weekly, monthly: (weekly * 52) / 12, counted, missingUnitValue } : null,
    verdicts,
    decisions,
  };
}

export interface PortfolioInput {
  lines: { id: string; name: string }[];
  stages: { id: string; line_id: string; name: string; sort_order: number }[];
  problems: { id: string; line_id: string; stage_id: string; status: string }[];
  experiments: { id: string; line_id: string; problem_id: string; status: ExperimentStatus }[];
}

export interface PortfolioCell {
  lineId: string;
  stageName: string;
  stageId: string | null;
  active: number;
  closed: number;
  total: number;
  /** Hay problemas validados sin ningún ejercicio y la celda no tiene activos. */
  gap: boolean;
  validatedWithoutExperiment: number;
}

/**
 * Matriz líneas × etapas. Las columnas son los nombres de etapa en el orden en
 * que aparecen (las líneas pueden haber renombrado o agregado etapas).
 */
export function portfolioMatrix(input: PortfolioInput) {
  const stageOfProblem = new Map(input.problems.map((p) => [p.id, p.stage_id]));
  const columns: string[] = [];
  for (const s of [...input.stages].sort((a, b) => a.sort_order - b.sort_order)) {
    if (!columns.includes(s.name)) columns.push(s.name);
  }
  const experimentsByProblem = new Map<string, number>();
  for (const e of input.experiments) {
    if (e.status === "discarded") continue;
    experimentsByProblem.set(e.problem_id, (experimentsByProblem.get(e.problem_id) ?? 0) + 1);
  }

  const rows = input.lines.map((line) => {
    const cells: PortfolioCell[] = columns.map((stageName) => {
      const stage = input.stages.find((s) => s.line_id === line.id && s.name === stageName) ?? null;
      const exps = stage
        ? input.experiments.filter((e) => e.line_id === line.id && stageOfProblem.get(e.problem_id) === stage.id)
        : [];
      const active = exps.filter((e) => isActive(e.status)).length;
      const closed = exps.filter((e) => isClosed(e.status)).length;
      const validatedWithoutExperiment = stage
        ? input.problems.filter(
            (p) => p.stage_id === stage.id && p.status === "validated" && !experimentsByProblem.get(p.id),
          ).length
        : 0;
      return {
        lineId: line.id,
        stageName,
        stageId: stage?.id ?? null,
        active,
        closed,
        total: exps.filter((e) => e.status !== "discarded").length,
        gap: active === 0 && validatedWithoutExperiment > 0,
        validatedWithoutExperiment,
      };
    });
    const totalExperiments = input.experiments.filter((e) => e.line_id === line.id && e.status !== "discarded").length;
    return { line, cells, totalExperiments, alert: totalExperiments === 0 };
  });

  return { columns, rows };
}

export interface VelocityPoint {
  week: IsoDate;
  launched: number;
  closed: number;
}

/**
 * Lanzados (inicio real) y cerrados (fecha de decisión) por semana en las
 * últimas `weeks` semanas que terminan en la semana de `until`.
 */
export function learningVelocity(
  experiments: { actual_start: IsoDate | null; decided_at: string | null; status: ExperimentStatus }[],
  until: IsoDate,
  weeks = 12,
): VelocityPoint[] {
  const lastWeek = weekStart(until);
  const firstWeek = addDays(lastWeek, -7 * (weeks - 1));
  const series = mondaysBetween(firstWeek, lastWeek).map((week) => ({ week, launched: 0, closed: 0 }));
  const index = new Map(series.map((p, i) => [p.week, i]));
  for (const e of experiments) {
    if (e.actual_start) {
      const i = index.get(weekStart(e.actual_start));
      if (i != null) series[i].launched += 1;
    }
    if (e.decided_at) {
      const i = index.get(weekStart(e.decided_at.slice(0, 10)));
      if (i != null) series[i].closed += 1;
    }
  }
  return series;
}
