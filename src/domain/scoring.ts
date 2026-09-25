// Regla 2 · Puntaje. Espejo de private.compute_ice / compute_final_score.
import type { ControlLevel, ScoringConfig } from "./types";

export const DEFAULT_SCORING: ScoringConfig = {
  calendar_bonus: 1,
  shared_penalty: 1,
  external_penalty: 3,
};

/** Redondeo a un decimal, mitad hacia arriba (igual que round(numeric, 1) para positivos). */
export function round1(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(value) + Number.EPSILON) * 10)) / 10;
}

export function isValidIceScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10;
}

/** ICE = promedio de impacto, confianza y facilidad, a un decimal. Null si falta alguno. */
export function computeIce(
  impact: number | null | undefined,
  confidence: number | null | undefined,
  ease: number | null | undefined,
): number | null {
  if (impact == null || confidence == null || ease == null) return null;
  return round1((impact + confidence + ease) / 3);
}

export function controlPenalty(control: ControlLevel, config: ScoringConfig = DEFAULT_SCORING): number {
  if (control === "shared") return config.shared_penalty;
  if (control === "external") return config.external_penalty;
  return 0;
}

/** Puntaje final = ICE + bono de calendario − penalidad de control. */
export function computeFinalScore(
  ice: number | null,
  fitsCalendar: boolean,
  control: ControlLevel,
  config: ScoringConfig = DEFAULT_SCORING,
): number | null {
  if (ice == null) return null;
  const bonus = fitsCalendar ? config.calendar_bonus : 0;
  return round1(ice + bonus - controlPenalty(control, config));
}

export function scoreExperiment(
  input: {
    impact: number | null;
    confidence: number | null;
    ease: number | null;
    fits_calendar: boolean;
    control: ControlLevel;
  },
  config: ScoringConfig = DEFAULT_SCORING,
): { ice: number | null; final: number | null } {
  const ice = computeIce(input.impact, input.confidence, input.ease);
  return { ice, final: computeFinalScore(ice, input.fits_calendar, input.control, config) };
}

/** Lee la configuración guardada en programs.scoring_config con valores por defecto. */
export function parseScoringConfig(raw: unknown): ScoringConfig {
  const obj = (raw ?? {}) as Partial<Record<keyof ScoringConfig, unknown>>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    calendar_bonus: num(obj.calendar_bonus, DEFAULT_SCORING.calendar_bonus),
    shared_penalty: num(obj.shared_penalty, DEFAULT_SCORING.shared_penalty),
    external_penalty: num(obj.external_penalty, DEFAULT_SCORING.external_penalty),
  };
}
