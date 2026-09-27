// Lo que el asistente de ejercicios puede deducir solo, para no preguntarlo.
// Mismas funciones en el cliente (lo que se muestra) y en la server action (lo que se guarda).
import { rangesOverlap } from "./dates";
import { plannedRange } from "./calendar";
import type { CalendarEvent, ControlLevel, IsoDate, OwnerType, ProgramRole } from "./types";

export interface CalendarFit {
  /** true: no cruza picos ni congelamientos · false: sí cruza · null: sin fechas. */
  fits: boolean | null;
  /** Picos y congelamientos que se cruzan con las fechas planeadas. */
  conflicts: CalendarEvent[];
}

/**
 * Filtro de calendario calculado: el ejercicio "se puede leer antes de los picos"
 * cuando su rango planeado no cruza ningún pico ni congelamiento. Si falta el fin,
 * se estima con la duración mínima (o se usa solo el día de inicio).
 */
export function inferCalendarFit(
  input: { planned_start: IsoDate | null; planned_end: IsoDate | null; min_duration_days?: number | null },
  events: CalendarEvent[],
): CalendarFit {
  const range = plannedRange(input);
  if (!range.start) return { fits: null, conflicts: [] };
  const end = range.end && range.end >= range.start ? range.end : range.start;
  const conflicts = events.filter(
    (e) => (e.type === "peak" || e.type === "freeze") && rangesOverlap(range.start!, end, e.start_date, e.end_date),
  );
  return { fits: conflicts.length === 0, conflicts };
}

/**
 * Valor que se guarda en `fits_calendar`: el calculado, salvo que la persona lo haya
 * cambiado a mano o que todavía no haya fechas (entonces vale lo que eligió).
 */
export function resolveFitsCalendar(input: { manual: boolean; override: boolean; inferred: boolean | null }): boolean {
  if (input.override || input.inferred === null) return input.manual;
  return input.inferred;
}

/** ¿El valor guardado se aparta del calculado? (así se sabe si fue un cambio manual). */
export function isCalendarOverride(stored: boolean, inferred: boolean | null): boolean {
  return inferred !== null && stored !== inferred;
}

/** El control del ejercicio parte del control del problema del que nace. */
export function inferControl(problemControl: ControlLevel | null | undefined, fallback: ControlLevel = "ours"): ControlLevel {
  return problemControl ?? fallback;
}

/** Tipo de responsable según su rol en el programa (la agencia es "agencia"; el resto, "interno"). */
export function inferOwnerType(role: ProgramRole | null | undefined): OwnerType | null {
  if (!role) return null;
  return role === "agency" ? "agency" : "internal";
}

/**
 * Métrica principal: el nombre de la métrica del árbol elegida. Si la persona ya
 * había escrito otra cosa (distinta del nombre de la métrica anterior), se respeta.
 */
export function resolvePrimaryMetric(input: {
  current: string | null | undefined;
  previousMetricName: string | null | undefined;
  metricName: string | null | undefined;
}): string | null {
  const current = input.current?.trim() ?? "";
  const metric = input.metricName?.trim() || null;
  if (!current) return metric;
  if (input.previousMetricName && current === input.previousMetricName.trim()) return metric ?? current;
  return current;
}

/** Texto del filtro de calendario calculado, para mostrarlo en el asistente. */
export function calendarFitMessage(fit: CalendarFit, bonus: number): string {
  if (fit.fits === null) return "Sin fechas todavía: se calcula solo cuando las ponga en el paso 5.";
  if (fit.fits) return `Calculado: sus fechas no cruzan picos ni congelamientos · +${String(Math.round(bonus * 10) / 10).replace(".", ",")} punto${bonus === 1 ? "" : "s"}`;
  const names = fit.conflicts.map((c) => `"${c.name}"`).join(", ");
  return `Calculado: sus fechas cruzan ${names} · sin bono de calendario`;
}

export interface HypothesisDraft {
  hypothesis_if: string;
  hypothesis_then: string;
  hypothesis_because: string;
}

/**
 * Separa un texto "SI … ENTONCES … PORQUE …" en sus tres partes (sin importar
 * mayúsculas ni tildes). Si no trae los marcadores, todo va en SI.
 */
export function splitHypothesis(text: string | null | undefined): HypothesisDraft {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  const empty = { hypothesis_if: "", hypothesis_then: "", hypothesis_because: "" };
  if (!t) return empty;
  const re = /^(?:s[ií]\s*[,:]?\s+)?(.*?)(?:[,;.]?\s+entonces\s*[,:]?\s+(.*?))?(?:[,;.]?\s+porque\s*[,:]?\s+(.*?))?[.\s]*$/i;
  const m = re.exec(t);
  if (!m) return { ...empty, hypothesis_if: t };
  return { hypothesis_if: (m[1] ?? "").trim(), hypothesis_then: (m[2] ?? "").trim(), hypothesis_because: (m[3] ?? "").trim() };
}

/**
 * Hipótesis inicial de un ejercicio derivado de un aprendizaje: la hipótesis sugerida
 * separada en partes y, si falta el PORQUE, el texto del aprendizaje. Solo llena lo vacío.
 */
export function hypothesisFromLearning(
  current: HypothesisDraft,
  learning: { text: string; suggested_hypothesis: string | null },
): HypothesisDraft {
  const parts = splitHypothesis(learning.suggested_hypothesis);
  return {
    hypothesis_if: current.hypothesis_if.trim() ? current.hypothesis_if : parts.hypothesis_if,
    hypothesis_then: current.hypothesis_then.trim() ? current.hypothesis_then : parts.hypothesis_then,
    hypothesis_because: current.hypothesis_because.trim()
      ? current.hypothesis_because
      : parts.hypothesis_because || learning.text.trim(),
  };
}
