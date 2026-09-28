// Valor económico estimado de escalar un resultado. Es un orden de magnitud
// para priorizar, no una proyección financiera:
//   unidades extra por semana = mejora relativa × volumen semanal de la métrica
//   valor semanal            = unidades extra × valor por unidad (COP)
//   valor mensual            = valor semanal × 52 / 12
import type { IsoDate, MetricDirection } from "./types";

export const WEEKS_PER_MONTH = 52 / 12;

export interface MetricEconomics {
  id: string;
  unit: string | null;
  direction: MetricDirection;
  baseline: number | null;
  /** Valor de una unidad de la métrica en COP (opcional). */
  unit_value: number | null;
  /** Último valor semanal cargado, si hay. */
  latest_value: number | null;
  latest_week: IsoDate | null;
}

/**
 * Volumen semanal de referencia: el último valor semanal cargado o, si no hay,
 * la línea base. Una tasa (unidad "%") no es un volumen: devuelve null.
 */
export function weeklyVolume(m: Pick<MetricEconomics, "unit" | "baseline" | "latest_value">): number | null {
  if (m.unit === "%") return null;
  const v = m.latest_value ?? m.baseline;
  return v == null || !Number.isFinite(v) || v <= 0 ? null : v;
}

export interface EstimatedValue {
  /** Unidades extra por semana (positivo = a favor de la dirección de la métrica). */
  extraUnitsPerWeek: number;
  weekly: number;
  monthly: number;
}

export type MissingValueInput = "lift" | "volume" | "unit_value";

/**
 * Valor estimado si se escala. Positivo = a favor (si la métrica "baja es
 * mejor", una reducción cuenta como ganancia). Null si falta algún dato; en
 * `missing` se dice cuál para orientar a la persona.
 */
export function estimateValue(input: {
  lift: number | null;
  metric: Pick<MetricEconomics, "unit" | "baseline" | "latest_value" | "unit_value" | "direction"> | null;
}): { value: EstimatedValue | null; missing: MissingValueInput | null } {
  if (input.lift == null || !Number.isFinite(input.lift)) return { value: null, missing: "lift" };
  const m = input.metric;
  const volume = m ? weeklyVolume(m) : null;
  if (volume == null) return { value: null, missing: "volume" };
  if (m!.unit_value == null || !Number.isFinite(m!.unit_value) || m!.unit_value <= 0) return { value: null, missing: "unit_value" };
  const sign = m!.direction === "down" ? -1 : 1;
  const extraUnitsPerWeek = sign * input.lift * volume;
  const weekly = extraUnitsPerWeek * m!.unit_value;
  return { value: { extraUnitsPerWeek, weekly, monthly: weekly * WEEKS_PER_MONTH }, missing: null };
}

/**
 * Mejora "conservadora": el extremo del intervalo menos favorable. Si más es
 * mejor, el límite inferior; si menos es mejor, el superior (la reducción más chica).
 */
export function conservativeLift(interval: { low: number; high: number } | null | undefined, direction: MetricDirection): number | null {
  if (!interval || !Number.isFinite(interval.low) || !Number.isFinite(interval.high)) return null;
  return direction === "down" ? interval.high : interval.low;
}

/**
 * Valor conservador: el mismo cálculo con el extremo menos favorable del
 * intervalo de la mejora. Nunca es negativo (si el intervalo cruza el cero, el
 * piso honesto es $0). Null sin intervalo o si falta algún dato del valor.
 */
export function estimateConservativeValue(input: {
  interval: { low: number; high: number } | null | undefined;
  metric: Pick<MetricEconomics, "unit" | "baseline" | "latest_value" | "unit_value" | "direction"> | null;
}): EstimatedValue | null {
  const lift = conservativeLift(input.interval, input.metric?.direction ?? "up");
  if (lift == null) return null;
  const { value } = estimateValue({ lift, metric: input.metric });
  if (!value) return null;
  if (value.weekly >= 0) return value;
  return { extraUnitsPerWeek: 0, weekly: 0, monthly: 0 };
}

/**
 * "entre $ 2 M y $ 8 M (techo optimista)" o, sin piso, "≈ $ 8 M (techo optimista)".
 * `high` es el valor puntual (techo); `low`, el conservador.
 */
export function formatValueRange(low: number | null | undefined, high: number | null | undefined, suffix = ""): string {
  if (high == null || !Number.isFinite(high)) return "—";
  const end = suffix ? ` ${suffix}` : "";
  if (low == null || !Number.isFinite(low) || Math.round(low) === Math.round(high)) return `≈ ${formatCop(high)}${end} (techo optimista)`;
  return `entre ${formatCop(Math.min(low, high))} y ${formatCop(high)}${end} (techo optimista)`;
}

const copFmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const compactFmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

/** 12500000 → "$ 12,5 M"; 850000 → "$ 850.000". Con signo si es negativo. */
export function formatCop(value: number | null | undefined, fallback = "—"): string {
  if (value == null || !Number.isFinite(value)) return fallback;
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000_000) return `${sign}$ ${compactFmt.format(abs / 1_000_000_000)} mil M`;
  if (abs >= 1_000_000) return `${sign}$ ${compactFmt.format(abs / 1_000_000)} M`;
  return `${sign}${copFmt.format(abs).replace(/ /g, " ")}`;
}

export const UNIT_VALUE_HINT = "Agregue el valor por unidad en la métrica";
