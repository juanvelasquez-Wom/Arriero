// Potencia de un ejercicio: el mismo cálculo de Pilotos (pilots/power.ts), con
// los datos que tiene un ejercicio del árbol. Es una guía para planear: dice si
// la prueba alcanza a ver el efecto que espera la hipótesis.
//
// - Métrica de tasa (unidad "%"): tasa actual + personas por semana, que se
//   reparten entre las variantes (por día: semana / 7 / variantes).
// - Métrica de volumen: valor semanal actual / 7 como promedio diario y la
//   variación diaria (coeficiente de variación; 30 % si no se indica).
import { computePower, DEFAULT_DAILY_CV } from "./pilots/power";
import { pctText } from "./pilots/numbers";
import type { PowerResult } from "./pilots/types";

export type ExperimentPowerCalc = "rate" | "volume";

/** Lo que se guarda en `experiments.power_inputs`. */
export interface ExperimentPowerInputs {
  /** Tasa: tasa actual en % (4,5 = 4,5 %). Volumen: valor semanal actual. */
  baseline: number | null;
  /** Solo tasas: personas (o sesiones) por semana entre todas las variantes. */
  weekly_traffic?: number | null;
  /** Solo volumen: variación diaria en % (30 = 30 %). */
  daily_cv_pct?: number | null;
}

/** Una métrica con unidad "%" se trata como tasa; lo demás, como volumen. */
export function powerCalcFor(unit: string | null | undefined): ExperimentPowerCalc {
  return unit === "%" ? "rate" : "volume";
}

/** Valor de partida sugerido: el último valor semanal o la línea base. */
export function suggestedBaseline(m: { latest_value?: number | null; baseline?: number | null }): number | null {
  const v = m.latest_value ?? m.baseline ?? null;
  return v != null && Number.isFinite(v) && v > 0 ? v : null;
}

const valid = (n: number | null | undefined): n is number => n != null && Number.isFinite(n) && n > 0;

/** Los ejercicios hablan de "ejercicio", no de "piloto". */
function asExperimentText(s: string): string {
  return s.replace(/el piloto/g, "el ejercicio").replace(/un piloto/g, "un ejercicio");
}

/**
 * Potencia del ejercicio. `expectedPct` es el efecto esperado (% relativo, con o sin
 * signo); `arms` el número de variantes con el control; `plannedDays` la duración.
 * Null si todavía no hay ni valor de partida ni días (no hay nada que mostrar).
 */
export function computeExperimentPower(input: {
  calc: ExperimentPowerCalc;
  inputs: ExperimentPowerInputs | null | undefined;
  expectedPct: number | null | undefined;
  arms: number;
  plannedDays: number | null | undefined;
}): PowerResult | null {
  const i = input.inputs ?? { baseline: null };
  if (!valid(i.baseline) && !valid(input.plannedDays)) return null;
  const arms = Math.max(2, Math.floor(input.arms || 2));
  const expected = input.expectedPct != null && Number.isFinite(input.expectedPct) && input.expectedPct !== 0 ? Math.abs(input.expectedPct) : null;
  const plannedDays = valid(input.plannedDays) ? input.plannedDays : 0;
  const r =
    input.calc === "rate"
      ? computePower(
          "rate",
          {
            baseline: valid(i.baseline) ? i.baseline / 100 : Number.NaN,
            daily_volume_per_arm: valid(i.weekly_traffic) ? i.weekly_traffic / 7 / arms : null,
            planned_days: plannedDays,
          },
          expected,
          arms,
        )
      : computePower(
          "sum",
          {
            baseline: valid(i.baseline) ? i.baseline / 7 : Number.NaN,
            daily_cv: valid(i.daily_cv_pct) ? i.daily_cv_pct / 100 : null,
            planned_days: plannedDays,
          },
          expected,
          arms,
        );
  return { ...r, warnings: r.warnings.map(asExperimentText) };
}

/** Variación diaria que se asume para métricas de volumen (en %). */
export const DEFAULT_DAILY_CV_PCT = DEFAULT_DAILY_CV * 100;

/**
 * Aviso cuando la prueba no alcanza a ver el efecto esperado (MDE > efecto
 * esperado). Null si alcanza o si falta algún dato.
 */
export function powerShortfall(power: Pick<PowerResult, "mde_pct" | "days_needed"> | null | undefined, expectedPct: number | null | undefined): string | null {
  if (!power || power.mde_pct == null || expectedPct == null || !Number.isFinite(expectedPct) || expectedPct === 0) return null;
  const expected = Math.abs(expectedPct);
  if (power.mde_pct <= expected) return null;
  const days = power.days_needed != null ? ` Para verlo necesitaría unos ${power.days_needed} días.` : "";
  return `Con la duración planeada la prueba solo ve cambios desde ${pctText(power.mde_pct)} y la hipótesis espera ${pctText(expected)}: puede salir "no concluyente" aunque funcione.${days}`;
}
