// ICE asistido: Arriero sugiere Impacto y Confianza con lo que ya sabe del
// ejercicio, para que la calificación no salga del estómago. Es una sugerencia:
// la calificación la pone el equipo y es la que cuenta.
//
// - Impacto (1–10): del valor mensual estimado si funciona (volumen × efecto
//   esperado × valor por unidad). Con 3 o más ejercicios del programa con valor,
//   se ubica frente a ellos; si no, en escala logarítmica ($ 100 mil → 1,
//   $ 1 M → 3, $ 10 M → 5, $ 100 M → 7, $ 1.000 M → 9). Sin valor, del impacto del problema.
// - Confianza (1–10): parte de 4; +2 si el problema está validado (−1 si está
//   descartado); +1 con evidencia escrita de peso; +1 con adjuntos; ±1 por cada
//   aprendizaje parecido que ganó o perdió (máximo ±2).
import { findSimilar } from "./similarity";
import { formatCop, estimateValue, type MetricEconomics } from "./value";
import type { ImpactLevel, MetricDirection, ProblemStatus, Verdict } from "./types";

export interface IceAssistInput {
  /** Efecto esperado de la hipótesis, en % relativo a favor de la métrica. */
  expectedEffectPct: number | null | undefined;
  metric: Pick<MetricEconomics, "unit" | "baseline" | "latest_value" | "unit_value" | "direction"> | null | undefined;
  /** Valor mensual estimado de los otros ejercicios del programa (para ubicarlo). */
  peerMonthlyValues?: readonly number[];
  problem?: {
    status: ProblemStatus | string;
    evidence: string | null;
    attachments: number;
    impact: ImpactLevel | null;
  } | null;
  /** Título + hipótesis del ejercicio, para buscar aprendizajes parecidos. */
  draftText: string;
  learnings?: readonly { text: string; verdict: Verdict | null }[];
}

export interface IceSuggestion {
  impact: number | null;
  confidence: number | null;
  /** Valor mensual estimado si funciona (null si falta algún dato). */
  monthlyValue: number | null;
  why: { impact: string; confidence: string[] };
}

const clamp = (n: number) => Math.min(10, Math.max(1, Math.round(n)));

/** Evidencia de peso: al menos 120 caracteres escritos. */
export const SOLID_EVIDENCE_CHARS = 120;

const IMPACT_FROM_PROBLEM: Record<ImpactLevel, number> = { high: 8, medium: 5, low: 3 };
const IMPACT_LABEL: Record<ImpactLevel, string> = { high: "alto", medium: "medio", low: "bajo" };

/** Valor mensual si la hipótesis se cumple. El efecto se toma a favor de la métrica. */
export function expectedMonthlyValue(
  expectedEffectPct: number | null | undefined,
  metric: IceAssistInput["metric"],
): number | null {
  if (expectedEffectPct == null || !Number.isFinite(expectedEffectPct) || expectedEffectPct === 0 || !metric) return null;
  const direction: MetricDirection = metric.direction ?? "up";
  const lift = ((direction === "down" ? -1 : 1) * Math.abs(expectedEffectPct)) / 100;
  const { value } = estimateValue({ lift, metric });
  return value && value.monthly > 0 ? value.monthly : null;
}

/** Impacto en escala logarítmica del valor mensual. */
export function impactFromValue(monthly: number): number {
  return clamp(1 + 2 * Math.log10(Math.max(monthly, 1) / 100_000));
}

/** Impacto por posición frente a los demás ejercicios (percentil → 1–10). */
export function impactFromPeers(monthly: number, peers: readonly number[]): number {
  const below = peers.filter((p) => p < monthly).length;
  const equal = peers.filter((p) => p === monthly).length;
  const pct = (below + equal / 2) / peers.length;
  return clamp(1 + pct * 9);
}

export function suggestIce(input: IceAssistInput): IceSuggestion {
  // Impacto
  const monthly = expectedMonthlyValue(input.expectedEffectPct, input.metric);
  const peers = (input.peerMonthlyValues ?? []).filter((p) => Number.isFinite(p) && p > 0);
  let impact: number | null = null;
  let impactWhy: string;
  if (monthly != null) {
    if (peers.length >= 3) {
      impact = impactFromPeers(monthly, peers);
      impactWhy = `Si funciona vale ≈ ${formatCop(monthly)} al mes; frente a los otros ${peers.length} ejercicios del programa con valor, queda en ${impact}.`;
    } else {
      impact = impactFromValue(monthly);
      impactWhy = `Si funciona vale ≈ ${formatCop(monthly)} al mes (escala: $ 1 M → 3, $ 10 M → 5, $ 100 M → 7).`;
    }
  } else if (input.problem?.impact) {
    impact = IMPACT_FROM_PROBLEM[input.problem.impact];
    impactWhy = `Sale del impacto ${IMPACT_LABEL[input.problem.impact]} del problema. Con el efecto esperado y el valor por unidad de la métrica se calcula en pesos.`;
  } else {
    impactWhy = "Falta el efecto esperado (paso 4) o el valor por unidad de la métrica para calcularlo.";
  }

  // Confianza
  const why: string[] = [];
  let confidence: number | null = null;
  if (input.problem) {
    let c = 4;
    if (input.problem.status === "validated") {
      c += 2;
      why.push("El problema está validado (+2).");
    } else if (input.problem.status === "discarded") {
      c -= 1;
      why.push("El problema está descartado (−1).");
    } else {
      why.push("El problema todavía está por validar (sin bono).");
    }
    if ((input.problem.evidence ?? "").trim().length >= SOLID_EVIDENCE_CHARS) {
      c += 1;
      why.push("La evidencia del problema está bien escrita (+1).");
    }
    if (input.problem.attachments > 0) {
      c += 1;
      why.push(`El problema tiene ${input.problem.attachments} adjunto${input.problem.attachments === 1 ? "" : "s"} (+1).`);
    }
    const similar = findSimilar(input.draftText, [...(input.learnings ?? [])], (l) => l.text, { limit: 5 });
    const wins = similar.filter((s) => s.item.verdict === "winner").length;
    const losses = similar.filter((s) => s.item.verdict === "loser").length;
    const delta = Math.max(-2, Math.min(2, wins - losses));
    if (delta > 0) why.push(`Hay ${wins} aprendizaje${wins === 1 ? "" : "s"} parecido${wins === 1 ? "" : "s"} que ganó (+${delta}).`);
    if (delta < 0) why.push(`Hay ${losses} aprendizaje${losses === 1 ? "" : "s"} parecido${losses === 1 ? "" : "s"} que perdió (${delta}).`);
    c += delta;
    confidence = clamp(c);
  } else {
    why.push("Elija el problema para sugerir la confianza.");
  }

  return { impact, confidence, monthlyValue: monthly, why: { impact: impactWhy, confidence: why } };
}

/** "I 7 · C 6" (con "—" en lo que no se pudo sugerir). */
export function iceSuggestionLabel(s: Pick<IceSuggestion, "impact" | "confidence">): string {
  return `I ${s.impact ?? "—"} · C ${s.confidence ?? "—"}`;
}
