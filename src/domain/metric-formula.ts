// Definición de las métricas del árbol: alcance (negocio o plataforma),
// fórmula opcional (numerador ÷ denominador) y lo que le falta a una métrica
// para estar bien definida. Funciones puras.

export const METRIC_SCOPES = ["business", "platform"] as const;
export type MetricScope = (typeof METRIC_SCOPES)[number];

/** Tolerancia de la coherencia: 2 % de diferencia relativa. */
export const FORMULA_TOLERANCE = 0.02;

export interface FormulaMetric {
  id: string;
  line_id: string;
  unit: string | null;
  numerator_id: string | null;
  denominator_id: string | null;
}

/** ¿Tiene fórmula completa? */
export function hasFormula(m: Pick<FormulaMetric, "numerator_id" | "denominator_id">): boolean {
  return !!m.numerator_id && !!m.denominator_id;
}

/**
 * Valida la fórmula de una métrica: numerador y denominador van juntos, son
 * distintos, no son la misma métrica y pertenecen a la misma línea.
 * Devuelve el mensaje de error o null.
 */
export function formulaError(
  metricId: string | null,
  numeratorId: string | null,
  denominatorId: string | null,
  lineMetricIds: readonly string[],
): { field: "numerator_id" | "denominator_id"; message: string } | null {
  if (!numeratorId && !denominatorId) return null;
  if (!numeratorId) return { field: "numerator_id", message: "Elija también el numerador." };
  if (!denominatorId) return { field: "denominator_id", message: "Elija también el denominador." };
  if (numeratorId === denominatorId) return { field: "denominator_id", message: "El numerador y el denominador deben ser distintos." };
  if (metricId && (numeratorId === metricId || denominatorId === metricId)) {
    return { field: numeratorId === metricId ? "numerator_id" : "denominator_id", message: "Una métrica no se calcula con ella misma." };
  }
  if (!lineMetricIds.includes(numeratorId)) return { field: "numerator_id", message: "Elija una métrica de esta línea." };
  if (!lineMetricIds.includes(denominatorId)) return { field: "denominator_id", message: "Elija una métrica de esta línea." };
  return null;
}

export interface FormulaCheck {
  /** Lo que da numerador ÷ denominador (× 100 si la unidad es %). */
  expected: number;
  loaded: number;
  /** Diferencia relativa |cargado − esperado| / |esperado|. */
  diff: number;
  coherent: boolean;
}

/**
 * Compara el valor cargado de una métrica con fórmula contra numerador ÷
 * denominador de la misma semana. Si la unidad es %, la división se multiplica
 * por 100. Null si falta algún dato o el denominador es 0.
 */
export function checkFormula(input: {
  value: number | null | undefined;
  numerator: number | null | undefined;
  denominator: number | null | undefined;
  unit: string | null | undefined;
  tolerance?: number;
}): FormulaCheck | null {
  const { value, numerator, denominator } = input;
  if (value == null || numerator == null || denominator == null) return null;
  if (![value, numerator, denominator].every(Number.isFinite) || denominator === 0) return null;
  const scale = input.unit && input.unit.includes("%") ? 100 : 1;
  const expected = (numerator / denominator) * scale;
  const diff = expected === 0 ? (value === 0 ? 0 : Infinity) : Math.abs(value - expected) / Math.abs(expected);
  return { expected, loaded: value, diff, coherent: diff <= (input.tolerance ?? FORMULA_TOLERANCE) };
}

/**
 * Chequeos de coherencia para todas las métricas con fórmula en una semana.
 * `values` = valor de cada métrica en esa semana. Solo devuelve las que se
 * pudieron calcular.
 */
export function formulaChecks(metrics: FormulaMetric[], values: ReadonlyMap<string, number>): Map<string, FormulaCheck> {
  const out = new Map<string, FormulaCheck>();
  for (const m of metrics) {
    if (!hasFormula(m)) continue;
    const check = checkFormula({
      value: values.get(m.id),
      numerator: values.get(m.numerator_id as string),
      denominator: values.get(m.denominator_id as string),
      unit: m.unit,
    });
    if (check) out.set(m.id, check);
  }
  return out;
}

/**
 * Chequeo de la semana más reciente en la que la métrica, su numerador y su
 * denominador tienen dato. Null si no tiene fórmula o no hay semana completa.
 */
export function latestFormulaCheck(
  m: FormulaMetric,
  values: { metric_id: string; week_start: string; value: number }[],
): (FormulaCheck & { week: string }) | null {
  if (!hasFormula(m)) return null;
  const by = (id: string) => new Map(values.filter((v) => v.metric_id === id).map((v) => [v.week_start, v.value]));
  const own = by(m.id);
  const num = by(m.numerator_id as string);
  const den = by(m.denominator_id as string);
  const weeks = [...own.keys()].filter((w) => num.has(w) && den.has(w)).sort();
  const week = weeks.at(-1);
  if (!week) return null;
  const check = checkFormula({ value: own.get(week), numerator: num.get(week), denominator: den.get(week), unit: m.unit });
  return check ? { ...check, week } : null;
}

// -----------------------------------------------------------------------------
// Lo que le falta a una métrica
// -----------------------------------------------------------------------------

export type MetricGap = "definition" | "source" | "owner";

export const METRIC_GAP_LABEL: Record<MetricGap, string> = {
  definition: "Sin definición",
  source: "Sin fuente",
  owner: "Sin dueño",
};

/** Definición, fuente y dueño: lo mínimo para que todos carguen lo mismo. */
export function metricGaps(m: { definition: string | null; source: string | null; owner_id: string | null }): MetricGap[] {
  const gaps: MetricGap[] = [];
  if (!m.definition?.trim()) gaps.push("definition");
  if (!m.source?.trim()) gaps.push("source");
  if (!m.owner_id) gaps.push("owner");
  return gaps;
}
