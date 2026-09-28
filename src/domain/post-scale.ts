// Verificación posterior al escalado: ¿el ganador sostuvo el lift en la
// operación normal? Compara el promedio semanal de la métrica del árbol en las
// 4 semanas antes de la decisión con las semanas 1–4 y 5–8 después. Es
// evidencia direccional: en la operación normal pasan muchas cosas a la vez.
import { addDays, weekStart } from "./dates";
import { formatSignedPercent } from "./format";
import { DIRECTIONAL_LABEL } from "./stats";
import type { IsoDate, MetricDirection } from "./types";

export type PostScaleStatus = "held" | "not_held" | "missing";

export const POST_SCALE_LABEL: Record<PostScaleStatus, string> = {
  held: "Sostuvo el lift",
  not_held: "No se sostuvo",
  missing: "Faltan datos",
};

/** Semanas mínimas con dato en cada ventana para leerla. */
export const MIN_WEEKS = 2;

export interface PostScaleWindow {
  weeks: number;
  mean: number | null;
  /** Cambio relativo frente a antes (0,05 = +5 %). */
  change: number | null;
}

export interface PostScaleCheck {
  status: PostScaleStatus;
  label: string;
  evidence: typeof DIRECTIONAL_LABEL;
  before: { weeks: number; mean: number | null };
  after4: PostScaleWindow;
  after8: PostScaleWindow;
  /** Frase para mostrar. */
  message: string;
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function change(after: number | null, before: number | null): number | null {
  if (after == null || before == null || before === 0) return null;
  return (after - before) / Math.abs(before);
}

/** decided_at puede venir con hora (timestamptz): se toma la fecha. */
function toDate(d: string): IsoDate {
  return d.slice(0, 10);
}

export function checkPostScale(input: {
  decidedAt: string | null;
  direction: MetricDirection;
  values: readonly { week_start: IsoDate; value: number }[];
  today: IsoDate;
}): PostScaleCheck {
  const empty: PostScaleWindow = { weeks: 0, mean: null, change: null };
  const base = {
    evidence: DIRECTIONAL_LABEL,
    before: { weeks: 0, mean: null as number | null },
    after4: empty,
    after8: empty,
  } as const;
  if (!input.decidedAt) {
    return { ...base, status: "missing", label: POST_SCALE_LABEL.missing, message: "Sin fecha de decisión no hay con qué comparar." };
  }
  const ws = weekStart(toDate(input.decidedAt));
  const inRange = (from: IsoDate, to: IsoDate) =>
    input.values.filter((v) => v.week_start >= from && v.week_start <= to && Number.isFinite(v.value)).map((v) => v.value);
  const before = inRange(addDays(ws, -28), addDays(ws, -1));
  const a4 = inRange(addDays(ws, 7), addDays(ws, 28));
  const a8 = inRange(addDays(ws, 35), addDays(ws, 56));
  const beforeMean = mean(before);
  const w4: PostScaleWindow = { weeks: a4.length, mean: mean(a4), change: change(mean(a4), beforeMean) };
  const w8: PostScaleWindow = { weeks: a8.length, mean: mean(a8), change: change(mean(a8), beforeMean) };
  const out = { ...base, before: { weeks: before.length, mean: beforeMean }, after4: w4, after8: w8 };

  if (before.length < MIN_WEEKS) {
    return {
      ...out,
      status: "missing",
      label: POST_SCALE_LABEL.missing,
      message: "Faltan valores semanales de la métrica en las 4 semanas antes de la decisión. Cárguelos en la carga semanal.",
    };
  }
  const window = w8.weeks >= MIN_WEEKS ? { w: w8, name: "semanas 5 a 8" } : w4.weeks >= MIN_WEEKS ? { w: w4, name: "semanas 1 a 4" } : null;
  if (!window || window.w.change == null) {
    const ready = addDays(ws, 7 + 7 * MIN_WEEKS);
    return {
      ...out,
      status: "missing",
      label: POST_SCALE_LABEL.missing,
      message:
        input.today < ready
          ? "Todavía es temprano: con dos semanas de datos después de escalar ya se puede leer."
          : "Faltan valores semanales después de escalar. Cárguelos en la carga semanal y aquí sale la lectura.",
    };
  }
  const favorable = (input.direction === "down" ? -1 : 1) * window.w.change;
  const held = favorable > 0;
  return {
    ...out,
    status: held ? "held" : "not_held",
    label: held ? POST_SCALE_LABEL.held : POST_SCALE_LABEL.not_held,
    message: held
      ? `En las ${window.name} después de escalar, la métrica va ${formatSignedPercent(window.w.change)} frente a las 4 semanas antes. ¡Eso! Se sostiene.`
      : `En las ${window.name} después de escalar, la métrica va ${formatSignedPercent(window.w.change)} frente a las 4 semanas antes: el lift no se ve en la operación. Revise si algo cambió o si toca ajustar.`,
  };
}
