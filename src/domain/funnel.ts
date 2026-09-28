// "Caída del embudo": con la métrica de cada etapa (funnel_stages.metric_id) y
// sus valores semanales, dice cuánto pasa de una etapa a la siguiente, cómo va
// frente a la semana anterior y al promedio de 4 semanas, y dónde se cae más
// gente. Funciones puras, sin React ni Supabase.
import { addDays } from "./dates";
import type { IsoDate } from "./types";

export interface FunnelDropStageInput {
  id: string;
  name: string;
  metric_id: string | null;
}

export interface FunnelDropMetricInput {
  id: string;
  name: string;
  unit: string | null;
}

export interface FunnelDropValueInput {
  metric_id: string;
  week_start: IsoDate;
  value: number;
}

export interface FunnelDropStage {
  id: string;
  name: string;
  metricId: string | null;
  metricName: string | null;
  unit: string | null;
  /** Valor de la semana de referencia. */
  value: number | null;
  /** Valor de la semana anterior. */
  previousWeek: number | null;
  /** Promedio de las 4 semanas anteriores a la de referencia (las que tengan dato). */
  average4: number | null;
  /** Cambio relativo frente a la semana anterior (0.1 = +10 %). */
  changeVsPreviousWeek: number | null;
  /** Cambio relativo frente al promedio de 4 semanas. */
  changeVsAverage4: number | null;
  /** Paso desde la etapa anterior: valor / valor de la etapa anterior (null en la primera o si no aplica). */
  conversion: number | null;
  /** El mismo paso, la semana anterior. */
  previousConversion: number | null;
  /** Cambio de la conversión en puntos (0.02 = +2 pp). */
  conversionChange: number | null;
  /** Es el paso donde se pierde la mayor proporción de gente. */
  biggestDrop: boolean;
}

export type FunnelDropStatus = "no_stages" | "no_metrics" | "no_values" | "ok";

export interface FunnelDropResult {
  status: FunnelDropStatus;
  /** Semana de referencia (el lunes más reciente con algún dato de las etapas). */
  week: IsoDate | null;
  stages: FunnelDropStage[];
  /** Etapas sin métrica asignada. */
  withoutMetric: number;
  /** Id de la etapa donde más se cae la gente (la que recibe el paso), o null. */
  biggestDropStageId: string | null;
  /** Pasos que no se calcularon porque alguna de las dos etapas se mide en %. */
  rateSteps: number;
}

/** ¿La unidad es una tasa? Entonces no se divide contra la etapa anterior. */
export function isRateUnit(unit: string | null | undefined): boolean {
  return !!unit && unit.trim().includes("%");
}

function relChange(current: number | null, base: number | null): number | null {
  if (current == null || base == null || base === 0) return null;
  return (current - base) / Math.abs(base);
}

function ratio(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den <= 0) return null;
  return num / den;
}

/**
 * Calcula la caída del embudo. `stages` en el orden del embudo. `week` fija la
 * semana de referencia; si no viene, se usa la más reciente con datos.
 */
export function funnelDropOff(input: {
  stages: FunnelDropStageInput[];
  metrics: FunnelDropMetricInput[];
  values: FunnelDropValueInput[];
  week?: IsoDate | null;
}): FunnelDropResult {
  const { stages } = input;
  const empty = (status: FunnelDropStatus, withoutMetric = 0): FunnelDropResult => ({
    status,
    week: null,
    stages: [],
    withoutMetric,
    biggestDropStageId: null,
    rateSteps: 0,
  });
  if (!stages.length) return empty("no_stages");

  const metricById = new Map(input.metrics.map((m) => [m.id, m]));
  const withoutMetric = stages.filter((s) => !s.metric_id || !metricById.has(s.metric_id)).length;
  if (withoutMetric === stages.length) return empty("no_metrics", withoutMetric);

  const stageMetricIds = new Set(stages.map((s) => s.metric_id).filter((id): id is string => !!id && metricById.has(id)));
  const byMetricWeek = new Map<string, number>();
  let latest: IsoDate | null = null;
  for (const v of input.values) {
    if (!stageMetricIds.has(v.metric_id) || !Number.isFinite(v.value)) continue;
    byMetricWeek.set(`${v.metric_id}|${v.week_start}`, v.value);
    if (!latest || v.week_start > latest) latest = v.week_start;
  }
  const week = input.week ?? latest;
  if (!week || !byMetricWeek.size) return { ...empty("no_values", withoutMetric) };

  const prevWeek = addDays(week, -7);
  const lookup = (metricId: string | null, w: IsoDate) =>
    metricId && stageMetricIds.has(metricId) ? (byMetricWeek.get(`${metricId}|${w}`) ?? null) : null;

  let rateSteps = 0;
  const rows: FunnelDropStage[] = stages.map((s, i) => {
    const metric = s.metric_id ? (metricById.get(s.metric_id) ?? null) : null;
    const value = lookup(s.metric_id, week);
    const previousWeek = lookup(s.metric_id, prevWeek);
    const last4 = [1, 2, 3, 4].map((k) => lookup(s.metric_id, addDays(week, -7 * k))).filter((x): x is number => x != null);
    const average4 = last4.length ? last4.reduce((a, b) => a + b, 0) / last4.length : null;

    let conversion: number | null = null;
    let previousConversion: number | null = null;
    if (i > 0) {
      const before = stages[i - 1];
      const beforeMetric = before.metric_id ? (metricById.get(before.metric_id) ?? null) : null;
      if (metric && beforeMetric) {
        if (isRateUnit(metric.unit) || isRateUnit(beforeMetric.unit)) {
          rateSteps++;
        } else {
          conversion = ratio(value, lookup(before.metric_id, week));
          previousConversion = ratio(previousWeek, lookup(before.metric_id, prevWeek));
        }
      }
    }
    return {
      id: s.id,
      name: s.name,
      metricId: metric?.id ?? null,
      metricName: metric?.name ?? null,
      unit: metric?.unit ?? null,
      value,
      previousWeek,
      average4,
      changeVsPreviousWeek: relChange(value, previousWeek),
      changeVsAverage4: relChange(value, average4),
      conversion,
      previousConversion,
      conversionChange: conversion != null && previousConversion != null ? conversion - previousConversion : null,
      biggestDrop: false,
    };
  });

  // Donde se pierde la mayor proporción de gente: el paso con menor conversión.
  let biggest: FunnelDropStage | null = null;
  for (const r of rows) {
    if (r.conversion == null) continue;
    if (!biggest || r.conversion < (biggest.conversion as number)) biggest = r;
  }
  if (biggest && (biggest.conversion as number) < 1) biggest.biggestDrop = true;
  else biggest = null;

  return {
    status: "ok",
    week,
    stages: rows,
    withoutMetric,
    biggestDropStageId: biggest?.id ?? null,
    rateSteps,
  };
}
