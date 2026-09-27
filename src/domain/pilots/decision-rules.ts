// Sugerencia de decisión a partir de las reglas registradas antes de lanzar.
// Es una sugerencia: la decisión la toma una persona.
import type { Decision, DecisionRules, MetricDirection } from "./types";
import { pctText } from "./numbers";

export interface DecisionInput {
  /** Probabilidad (0–1) de que la mejor variante le gane al control. */
  probability: number | null;
  /** Mejora relativa de esa variante (%). */
  liftPct: number | null;
  guardrailsBroken: boolean;
  rules: DecisionRules;
}

export interface DecisionSuggestion {
  decision: Decision | null;
  reasons: string[];
}

/**
 * - Escalar: probabilidad ≥ mínima, mejora ≥ mínima y sin guardrail roto (si la regla lo exige).
 * - Si escalaría pero hay un guardrail roto que bloquea: ajustar.
 * - Apagar: probabilidad ≤ máxima para apagar.
 * - Si no: ajustar. Null sin probabilidad.
 */
export function suggestDecision(input: DecisionInput): DecisionSuggestion {
  const { probability, liftPct, guardrailsBroken, rules } = input;
  if (probability == null || !Number.isFinite(probability)) {
    return { decision: null, reasons: ["Todavía no hay datos suficientes para sugerir una decisión."] };
  }
  const probText = pctText(probability * 100);
  const blocked = guardrailsBroken && rules.guardrails_block_scale;
  const liftOk = liftPct != null && liftPct >= rules.scale_min_lift_pct;

  if (probability >= rules.scale_min_probability && liftOk) {
    if (blocked) {
      return {
        decision: "adjust",
        reasons: [
          `La probabilidad de ganar es ${probText} y cumple la regla para escalar.`,
          "Pero un guardrail se rompió: ajuste antes de escalar.",
        ],
      };
    }
    const reasons = [
      `La probabilidad de ganar es ${probText} (la regla pide ${pctText(rules.scale_min_probability * 100)}).`,
      `La mejora es ${pctText(liftPct!)} (la regla pide ${pctText(rules.scale_min_lift_pct)}).`,
    ];
    if (guardrailsBroken) reasons.push("Un guardrail se rompió; la regla permite escalar igual, pero revíselo.");
    return { decision: "scale", reasons };
  }
  if (probability <= rules.kill_max_probability) {
    return {
      decision: "kill",
      reasons: [`La probabilidad de ganar es ${probText}, a lo sumo ${pctText(rules.kill_max_probability * 100)}: apague la variante.`],
    };
  }
  const reasons: string[] = [];
  if (probability >= rules.scale_min_probability && !liftOk) {
    reasons.push(
      liftPct == null
        ? "No se pudo calcular la mejora frente al control."
        : `La mejora es ${pctText(liftPct)} y la regla pide al menos ${pctText(rules.scale_min_lift_pct)}.`,
    );
  } else {
    reasons.push(`La probabilidad de ganar es ${probText}: no alcanza para escalar ni para apagar.`);
  }
  if (guardrailsBroken) reasons.push("Además, un guardrail se rompió.");
  return { decision: "adjust", reasons };
}

/**
 * ¿Se rompió un guardrail? Se rompe si la métrica empeora más del límite:
 * con `up` (más es mejor) si changePct < −limitPct; con `down` si changePct > limitPct.
 * Null sin cambio calculado.
 */
export function evaluateGuardrail(input: { changePct: number | null; limitPct: number; direction: MetricDirection }): boolean | null {
  const { changePct, limitPct, direction } = input;
  if (changePct == null || !Number.isFinite(changePct)) return null;
  const limit = Math.abs(limitPct);
  return direction === "down" ? changePct > limit : changePct < -limit;
}
