// Guardrails de un ejercicio: métricas de la misma línea que no pueden empeorar
// más de un límite (% relativo) frente al control. Se fijan en el diseño y se
// evalúan con el valor que se carga por variante. Usa la misma regla de Pilotos
// (evaluateGuardrail). Un guardrail roto es una advertencia: decide una persona.
import { evaluateGuardrail } from "./pilots/decision-rules";
import { pctText } from "./pilots/numbers";
import { relativeDiff } from "./results";
import type { MetricDirection } from "./types";

/** Máximo de guardrails por ejercicio (lo exige también la base). */
export const MAX_GUARDRAILS = 3;

export interface ExperimentGuardrail {
  id: string;
  metric_id: string;
  metric_name: string;
  direction: MetricDirection;
  /** Cuánto se permite empeorar, en % relativo (15 = "no empeora más de 15 %"). */
  limit_pct: number;
  note?: string | null;
}

export interface GuardrailVariantInput {
  id: string;
  name: string;
  is_control: boolean;
  /** { guardrail_id: valor } */
  guardrail_values: Record<string, number | null | undefined> | null | undefined;
}

export interface GuardrailVariantReading {
  variant_id: string;
  variant_name: string;
  value: number | null;
  /** Cambio relativo frente al control, en % (−12 = bajó 12 %). */
  change_pct: number | null;
  /** null: falta el dato del control o de la variante. */
  broken: boolean | null;
}

export interface GuardrailReading {
  guardrail: ExperimentGuardrail;
  control_value: number | null;
  rows: GuardrailVariantReading[];
  broken: boolean;
}

function valueOf(v: GuardrailVariantInput | undefined, guardrailId: string): number | null {
  const x = v?.guardrail_values?.[guardrailId];
  return x == null || !Number.isFinite(Number(x)) ? null : Number(x);
}

/** Cambio de cada variante frente al control en cada guardrail, y si se rompió. */
export function evaluateGuardrails(guardrails: readonly ExperimentGuardrail[], variants: readonly GuardrailVariantInput[]): GuardrailReading[] {
  const control = variants.find((v) => v.is_control);
  return guardrails.map((g) => {
    const controlValue = valueOf(control, g.id);
    const rows = variants
      .filter((v) => !v.is_control)
      .map((v) => {
        const value = valueOf(v, g.id);
        const diff = relativeDiff(value, controlValue);
        const change = diff == null ? null : diff * 100;
        return {
          variant_id: v.id,
          variant_name: v.name,
          value,
          change_pct: change,
          broken: evaluateGuardrail({ changePct: change, limitPct: g.limit_pct, direction: g.direction }),
        };
      });
    return { guardrail: g, control_value: controlValue, rows, broken: rows.some((r) => r.broken === true) };
  });
}

/** Frases para avisar de los guardrails rotos (en usted, cortas). */
export function brokenGuardrailMessages(readings: readonly GuardrailReading[]): string[] {
  const out: string[] = [];
  for (const r of readings) {
    for (const row of r.rows) {
      if (row.broken !== true || row.change_pct == null) continue;
      out.push(
        `Se rompió el guardrail «${r.guardrail.metric_name}»: en «${row.variant_name}» empeoró ${pctText(Math.abs(row.change_pct))} y el límite era ${pctText(r.guardrail.limit_pct)}.`,
      );
    }
  }
  return out;
}

/** "No empeora más de 15 %" (sube o baja según la dirección de la métrica). */
export function describeGuardrail(g: Pick<ExperimentGuardrail, "limit_pct" | "direction">): string {
  return `${g.direction === "down" ? "No sube" : "No baja"} más de ${pctText(g.limit_pct)} frente al control`;
}
