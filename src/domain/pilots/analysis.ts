// Punto de entrada de la lectura de un piloto: toma el diseño (tipo de prueba,
// métricas, grupos, guardrails, reglas) y los valores cargados, y devuelve el
// resultado de la métrica principal, los guardrails, una decisión sugerida y
// las advertencias. Es determinista (semillas fijas) y no toca la base.
//
// Valor de una métrica en un grupo y un conjunto de periodos:
// - `sum`: suma de sus valores.
// - `rate`: suma(numerador) / suma(denominador).
// - `cost_per`: suma(numerador = inversión) / suma(denominador = resultados).
//
// Ruteo por tipo de prueba:
// - ab_creative / ab_platform: `rate` → comparación bayesiana (bayes.ts); otras →
//   bootstrap por periodos (bootstrap.ts). En `sum`, cada periodo se divide por la
//   participación del grupo (`split_pct` / 100) cuando todos los grupos la tienen y
//   no es igual para todos: así un reparto 70 / 30 se compara por unidad de reparto.
// - holdout: requiere `rate`; el control es el holdout y los demás grupos son el
//   expuesto (se suman si hay varios). La inversión es la suma de las métricas con
//   `is_spend` en el expuesto.
// - geo / pre_post: diferencia en diferencias, placebo y control sintético (geo.ts).
//   La prueba es la suma de los grupos que no son control; el control se parte por
//   ciudad (`unit_label`) cuando las tiene, si no es una sola serie.
//
// Ventana: en A/B y holdout solo cuentan los periodos desde `postStart` hasta
// `postEnd` (si existen). En geo y pre_post lo anterior a `postStart` es el "antes".
//
// Métricas donde menos es mejor (`direction = "down"`): la mejora sigue siendo
// (v − c) / c; para las reglas de decisión se usa la mejora en la dirección buena
// (−mejora), de modo que `scale_min_lift_pct` siempre significa "mejora de al menos".
import type { IsoDate } from "../types";
import { compareRates } from "./bayes";
import { bootstrapRatio, type RatioPeriod } from "./bootstrap";
import { evaluateGuardrail, suggestDecision } from "./decision-rules";
import { analyzeGeo, diffInDiff, averageSeries, type ControlUnit, type GeoAnalysis, type Series } from "./geo";
import { analyzeHoldout, type HoldoutResult } from "./holdout";
import { pctText, round } from "./numbers";
import type {
  Decision,
  DecisionRules,
  Measurement,
  PilotArm,
  PilotGuardrail,
  PilotMetricDef,
  PilotTestType,
} from "./types";

export interface PilotAnalysisInput {
  testType: PilotTestType;
  /** Métricas del catálogo involucradas (principal, guardrails y sus métricas base). */
  metrics: PilotMetricDef[];
  primaryMetricId: string;
  guardrails: PilotGuardrail[];
  /** Exactamente uno es el control. */
  arms: PilotArm[];
  measurements: Measurement[];
  /** Inicio real; lo anterior es el "antes" en geo y pre_post, y se ignora en los demás. */
  postStart: IsoDate | null;
  postEnd: IsoDate | null;
  plannedDays: number | null;
  /** Denominador total esperado por grupo, para advertir poco volumen. */
  plannedVolumePerArm?: number | null;
  rules: DecisionRules;
}

export type PilotEvidence = "probabilistic" | "placebo" | "weak";

export interface PilotComparison {
  armId: string;
  liftPct: number | null;
  lowPct: number | null;
  highPct: number | null;
  probabilityBetter: number | null;
}

export interface PilotPrimaryResult {
  metricId: string;
  perArm: { armId: string; value: number | null }[];
  /** Grupos que no son control. */
  comparisons: PilotComparison[];
  probabilityBest: Record<string, number> | null;
  bestArmId: string | null;
}

export interface PilotGuardrailResult {
  guardrailId: string;
  metricId: string;
  changePct: number | null;
  limitPct: number;
  broken: boolean | null;
}

export interface PilotAnalysis {
  evidence: PilotEvidence;
  primary: PilotPrimaryResult | null;
  geo: GeoAnalysis | null;
  holdout: HoldoutResult | null;
  guardrails: PilotGuardrailResult[];
  suggestion: { decision: Decision | null; reasons: string[] };
  warnings: string[];
  /** False cuando no hay datos suficientes para el resultado principal. */
  ready: boolean;
}

export const WEAK_EVIDENCE_LABEL = "Evidencia débil: antes / después con control. Úsela con cuidado.";

const DAY_MS = 86_400_000;
function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** Lecturas de una métrica: sumas de numerador y denominador (o del valor en `sum`). */
interface Totals {
  num: number;
  den: number;
  count: number;
}

class MetricReader {
  private readonly metrics: Map<string, PilotMetricDef>;
  constructor(
    metrics: readonly PilotMetricDef[],
    private readonly measurements: readonly Measurement[],
  ) {
    this.metrics = new Map(metrics.map((m) => [m.id, m]));
  }

  get(id: string): PilotMetricDef | undefined {
    return this.metrics.get(id);
  }

  /** ¿Se puede calcular? (`rate` y `cost_per` necesitan numerador y denominador). */
  usable(metric: PilotMetricDef): boolean {
    return metric.calc === "sum" || (metric.numerator_id != null && metric.denominator_id != null);
  }

  private base(id: string, keep: (m: Measurement) => boolean): { total: number; count: number } {
    let total = 0;
    let count = 0;
    for (const m of this.measurements) {
      if (m.metric_id !== id || !Number.isFinite(m.value) || !keep(m)) continue;
      total += m.value;
      count++;
    }
    return { total, count };
  }

  totals(metric: PilotMetricDef, keep: (m: Measurement) => boolean): Totals {
    if (metric.calc === "sum") {
      const v = this.base(metric.id, keep);
      return { num: v.total, den: 1, count: v.count };
    }
    const n = this.base(metric.numerator_id ?? "", keep);
    const d = this.base(metric.denominator_id ?? "", keep);
    return { num: n.total, den: d.total, count: Math.min(n.count, d.count) };
  }

  /** Valor de la métrica (sum, tasa o costo por) o null sin datos. */
  value(metric: PilotMetricDef, keep: (m: Measurement) => boolean): number | null {
    const t = this.totals(metric, keep);
    if (t.count === 0) return null;
    if (metric.calc === "sum") return t.num;
    return t.den > 0 ? t.num / t.den : null;
  }

  /** Periodos con dato de la métrica (o de sus métricas base). */
  periods(metric: PilotMetricDef, keep: (m: Measurement) => boolean): IsoDate[] {
    const ids = metric.calc === "sum" ? [metric.id] : [metric.numerator_id, metric.denominator_id];
    const set = new Set<IsoDate>();
    for (const m of this.measurements) if (ids.includes(m.metric_id) && keep(m)) set.add(m.period_start);
    return [...set].sort();
  }

  /** Serie por periodo: suma en `sum`, cociente del periodo en `rate` / `cost_per` (se omiten denominadores en cero). */
  series(metric: PilotMetricDef, keep: (m: Measurement) => boolean): Series {
    const out: Series = [];
    for (const period of this.periods(metric, keep)) {
      const v = this.value(metric, (m) => m.period_start === period && keep(m));
      if (v != null) out.push({ period, value: v });
    }
    return out;
  }
}

function toPct(x: number | null | undefined): number | null {
  return x == null || !Number.isFinite(x) ? null : round(x * 100);
}

function relativeChange(variant: number | null, control: number | null): number | null {
  if (variant == null || control == null || control === 0) return null;
  return variant / control - 1;
}

/** Costo de la simulación. Sin opciones se usan los valores por defecto (la ficha del piloto). */
export interface AnalyzeOptions {
  /** Muestras de Monte Carlo (tasas y holdout). */
  draws?: number;
  /** Iteraciones del bootstrap (sumas y costos por unidad). */
  iterations?: number;
}

export function analyzePilot(input: PilotAnalysisInput, options: AnalyzeOptions = {}): PilotAnalysis {
  const mc = options.draws == null ? {} : { draws: options.draws };
  const boot = options.iterations == null ? {} : { iterations: options.iterations };
  const warnings: string[] = [];
  const reader = new MetricReader(input.metrics, input.measurements);
  const primaryMetric = reader.get(input.primaryMetricId);
  const controls = input.arms.filter((a) => a.is_control);
  const control = controls.length === 1 ? controls[0] : null;
  const variants = input.arms.filter((a) => !a.is_control);
  const isGeoLike = input.testType === "geo" || input.testType === "pre_post";
  const evidenceBase: PilotEvidence = input.testType === "pre_post" ? "weak" : isGeoLike ? "placebo" : "probabilistic";

  const empty = (extra: string[]): PilotAnalysis => ({
    evidence: evidenceBase,
    primary: null,
    geo: null,
    holdout: null,
    guardrails: input.guardrails.map((g) => ({
      guardrailId: g.id,
      metricId: g.metric_id,
      changePct: null,
      limitPct: g.limit_pct,
      broken: null,
    })),
    suggestion: { decision: null, reasons: ["Todavía no hay datos suficientes para sugerir una decisión."] },
    warnings: [...warnings, ...extra],
    ready: false,
  });

  if (input.testType === "pre_post") warnings.push(WEAK_EVIDENCE_LABEL);
  if (!primaryMetric || !reader.usable(primaryMetric)) return empty(["La métrica principal no está bien definida en el catálogo."]);
  if (!control) return empty(["El piloto debe tener exactamente un grupo de control."]);
  if (variants.length === 0) return empty(["El piloto necesita al menos un grupo además del control."]);
  if (isGeoLike && !input.postStart) return empty(["Falta la fecha de inicio real para separar el antes y el después."]);

  const inPost = (m: Measurement) =>
    (input.postStart == null || m.period_start >= input.postStart) && (input.postEnd == null || m.period_start <= input.postEnd);
  const upToEnd = (m: Measurement) => input.postEnd == null || m.period_start <= input.postEnd;
  const ofArms = (ids: readonly string[]) => {
    const set = new Set(ids);
    return (m: Measurement) => set.has(m.arm_id);
  };
  const and =
    (...fs: ((m: Measurement) => boolean)[]) =>
    (m: Measurement) =>
      fs.every((f) => f(m));

  const postPeriods = reader.periods(primaryMetric, inPost);
  if (postPeriods.length === 0) return empty(["Todavía no hay datos cargados para la métrica principal."]);

  // Días corridos frente a los planeados.
  if (input.plannedDays != null && input.plannedDays > 0) {
    const first = input.postStart ?? postPeriods[0];
    const last = input.postEnd ?? postPeriods[postPeriods.length - 1];
    const ran = daysBetween(first, last) + 1;
    if (ran < input.plannedDays) {
      warnings.push(`El piloto lleva ${ran} de ${input.plannedDays} días planeados: la lectura todavía puede cambiar.`);
    }
  }

  // Volumen frente al planeado (denominador de tasas y costos por resultado).
  const plannedVolume = input.plannedVolumePerArm;
  if (plannedVolume != null && plannedVolume > 0 && primaryMetric.calc !== "sum") {
    for (const arm of input.arms) {
      const t = reader.totals(primaryMetric, and(inPost, ofArms([arm.id])));
      if (t.den < plannedVolume) {
        warnings.push(
          `El grupo ${arm.name} lleva ${Math.round(t.den)} de ${Math.round(plannedVolume)} de volumen planeado (${pctText((t.den / plannedVolume) * 100)}).`,
        );
      }
    }
  }

  const direction = primaryMetric.direction;
  const perArm = input.arms.map((a) => ({
    armId: a.id,
    value: reader.value(primaryMetric, and(inPost, ofArms([a.id]))),
  }));

  let primary: PilotPrimaryResult | null = null;
  let geo: GeoAnalysis | null = null;
  let holdout: HoldoutResult | null = null;
  let probability: number | null = null;
  let evidence = evidenceBase;
  /** Grupo que se compara contra el control para los guardrails. */
  let compareArmIds: string[] = [];
  /** Solo en geo / pre_post: cambio relativo de un guardrail por diferencia en diferencias. */
  let guardrailChange: ((metric: PilotMetricDef) => number | null) | null = null;

  if (input.testType === "ab_creative" || input.testType === "ab_platform") {
    let comparisons: PilotComparison[] = [];
    let probabilityBest: Record<string, number> | null = null;
    if (primaryMetric.calc === "rate") {
      const rateArms = input.arms
        .map((a) => {
          const t = reader.totals(primaryMetric, and(inPost, ofArms([a.id])));
          return { id: a.id, name: a.name, successes: t.num, trials: t.den };
        })
        .filter((a) => {
          const ok = a.trials > 0 && a.successes >= 0 && a.successes <= a.trials;
          if (!ok) warnings.push(`El grupo ${a.name} no tiene datos válidos todavía.`);
          return ok;
        });
      const result = compareRates(rateArms, control.id, direction, mc);
      if (result) {
        comparisons = result.comparisons.map((c) => ({
          armId: c.arm_id,
          liftPct: toPct(c.lift),
          lowPct: toPct(c.lift_low),
          highPct: toPct(c.lift_high),
          probabilityBetter: c.probability_better,
        }));
        probabilityBest = result.probability_best;
      }
    } else {
      const shares = input.arms.map((a) => a.split_pct);
      const normalize =
        primaryMetric.calc === "sum" &&
        shares.every((s) => s != null && s > 0) &&
        new Set(shares).size > 1;
      const periodsOf = (arm: PilotArm): RatioPeriod[] => {
        const keep = and(inPost, ofArms([arm.id]));
        const share = normalize ? arm.split_pct! / 100 : 1;
        return reader.periods(primaryMetric, keep).map((period) => {
          const t = reader.totals(primaryMetric, (m) => m.period_start === period && keep(m));
          return { num: t.num / share, den: t.den };
        });
      };
      const controlPeriods = periodsOf(control);
      for (const v of variants) {
        const r = bootstrapRatio(controlPeriods, periodsOf(v), direction, boot);
        if (!r) {
          warnings.push(`El grupo ${v.name} necesita al menos 2 periodos con datos para compararlo.`);
          continue;
        }
        comparisons.push({
          armId: v.id,
          liftPct: toPct(r.lift),
          lowPct: toPct(r.lift_low),
          highPct: toPct(r.lift_high),
          probabilityBetter: r.probability_better,
        });
      }
      if (normalize) warnings.push("Los grupos tienen repartos distintos: los totales se comparan por unidad de reparto.");
    }
    const best = comparisons.reduce<PilotComparison | null>(
      (acc, c) => (c.probabilityBetter != null && (acc == null || c.probabilityBetter > acc.probabilityBetter!) ? c : acc),
      null,
    );
    primary = { metricId: primaryMetric.id, perArm, comparisons, probabilityBest, bestArmId: best?.armId ?? null };
    probability = best?.probabilityBetter ?? null;
    compareArmIds = best ? [best.armId] : [];
  } else if (input.testType === "holdout") {
    if (primaryMetric.calc !== "rate") return empty(["El holdout necesita una métrica principal de tipo tasa."]);
    const exposedIds = variants.map((v) => v.id);
    if (variants.length > 1) warnings.push("Hay varios grupos expuestos: se leen juntos contra el holdout.");
    const exp = reader.totals(primaryMetric, and(inPost, ofArms(exposedIds)));
    const hold = reader.totals(primaryMetric, and(inPost, ofArms([control.id])));
    const spendMetrics = input.metrics.filter((m) => m.is_spend && m.calc === "sum");
    let spend: number | null = null;
    for (const m of spendMetrics) {
      const v = reader.value(m, and(inPost, ofArms(exposedIds)));
      if (v != null) spend = (spend ?? 0) + v;
    }
    holdout = analyzeHoldout({
      exposed: { successes: exp.num, trials: exp.den },
      holdout: { successes: hold.num, trials: hold.den },
      spendCop: spend,
      direction,
    }, mc);
    if (holdout) {
      const comparison: PilotComparison = {
        armId: variants[0].id,
        liftPct: toPct(holdout.lift),
        lowPct: toPct(holdout.lift_low),
        highPct: toPct(holdout.lift_high),
        probabilityBetter: holdout.probability_better,
      };
      primary = { metricId: primaryMetric.id, perArm, comparisons: [comparison], probabilityBest: null, bestArmId: variants[0].id };
      probability = holdout.probability_better;
      compareArmIds = exposedIds;
    } else {
      warnings.push("Falta volumen en el grupo expuesto o en el holdout para comparar.");
    }
  } else {
    // geo y pre_post
    const build = (metric: PilotMetricDef) => {
      const testKeep = and(upToEnd, ofArms(variants.map((v) => v.id)));
      // Con varias ciudades de prueba se usa la ciudad promedio, igual que en el
      // control: así prueba y control quedan en la misma escala (DiD y control sintético).
      const testLabels = [...new Set(input.measurements.filter(testKeep).map((m) => m.unit_label))].filter((l) => l !== "");
      const test =
        testLabels.length >= 2
          ? averageSeries(testLabels.map((label) => reader.series(metric, (m) => testKeep(m) && m.unit_label === label)).filter((s) => s.length > 0))
          : reader.series(metric, testKeep);
      const controlKeep = and(upToEnd, ofArms([control.id]));
      const labels = [...new Set(input.measurements.filter(controlKeep).map((m) => m.unit_label))].filter((l) => l !== "");
      const units: ControlUnit[] =
        labels.length >= 2
          ? labels.map((label) => ({ label, series: reader.series(metric, (m) => controlKeep(m) && m.unit_label === label) }))
          : [{ label: control.name, series: reader.series(metric, controlKeep) }];
      return { test, units: units.filter((u) => u.series.length > 0) };
    };
    const { test, units } = build(primaryMetric);
    geo = analyzeGeo({ test, controls: units, postStart: input.postStart! });
    warnings.push(...geo.warnings);
    if (geo.did) {
      const rel = geo.did.relative;
      const good = rel != null && (direction === "down" ? rel < 0 : rel > 0);
      const conf = geo.placebo?.placebo_confidence ?? null;
      // La confianza del placebo mide la magnitud; si el efecto va en contra se invierte.
      const probBetter = conf == null ? null : good ? conf : 1 - conf;
      if (conf == null) evidence = "weak";
      primary = {
        metricId: primaryMetric.id,
        perArm,
        comparisons: [
          { armId: variants[0].id, liftPct: toPct(rel), lowPct: null, highPct: null, probabilityBetter: probBetter },
        ],
        probabilityBest: null,
        bestArmId: variants[0].id,
      };
      probability = probBetter;
      compareArmIds = variants.map((v) => v.id);
    }
    guardrailChange = (metric) => {
      const g = build(metric);
      if (g.units.length === 0) return null;
      const controlSeries = g.units.length === 1 ? g.units[0].series : averageSeries(g.units.map((u) => u.series));
      return diffInDiff(g.test, controlSeries, input.postStart!)?.relative ?? null;
    };
  }

  const ready = primary != null && primary.comparisons.length > 0;

  // Guardrails.
  const guardrails: PilotGuardrailResult[] = input.guardrails.map((g) => {
    const metric = reader.get(g.metric_id);
    let change: number | null = null;
    if (metric && reader.usable(metric) && ready) {
      if (guardrailChange) change = guardrailChange(metric);
      else if (compareArmIds.length) {
        change = relativeChange(
          reader.value(metric, and(inPost, ofArms(compareArmIds))),
          reader.value(metric, and(inPost, ofArms([control.id]))),
        );
      }
    }
    const changePct = toPct(change);
    const broken = metric ? evaluateGuardrail({ changePct, limitPct: g.limit_pct, direction: metric.direction }) : null;
    if (broken) warnings.push(`El guardrail ${metric!.name} empeoró ${pctText(Math.abs(changePct!))} y el límite es ${pctText(g.limit_pct)}.`);
    return { guardrailId: g.id, metricId: g.metric_id, changePct, limitPct: g.limit_pct, broken };
  });

  // Decisión sugerida.
  const bestComparison = primary?.comparisons.find((c) => c.armId === primary?.bestArmId) ?? null;
  const lift = bestComparison?.liftPct ?? null;
  const improvement = lift == null ? null : direction === "down" ? -lift : lift;
  const suggestion = ready
    ? suggestDecision({
        probability,
        liftPct: improvement,
        guardrailsBroken: guardrails.some((g) => g.broken === true),
        rules: input.rules,
      })
    : { decision: null, reasons: ["Todavía no hay datos suficientes para sugerir una decisión."] };
  if (input.testType === "pre_post" && suggestion.decision === "scale") {
    suggestion.reasons.push("Es evidencia débil (antes / después): confirme con una prueba A/B antes de escalar del todo.");
  }
  if (ready && probability == null && isGeoLike) {
    suggestion.reasons.push("Sin prueba placebo no hay una probabilidad para aplicar la regla: decida con cuidado.");
  }

  return { evidence, primary, geo, holdout, guardrails, suggestion, warnings, ready };
}
