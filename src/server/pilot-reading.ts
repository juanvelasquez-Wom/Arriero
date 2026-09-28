import "server-only";
import { analyzePilot, type AnalyzeOptions, type PilotAnalysis } from "@/domain/pilots/analysis";
import { buildAnalysisInput } from "@/domain/pilots/reading";
import type { PilotCatalogs, PilotDetail } from "@/server/queries/pilots";

/**
 * Lectura determinista de un piloto (motor de src/domain/pilots). No toca la base.
 * Null si al piloto le falta el tipo de prueba, la métrica principal o los grupos.
 * `options` baja el costo de la simulación (p. ej. en el portafolio); sin opciones,
 * el resultado es el mismo de la ficha del piloto.
 */
export function analyzePilotDetail(detail: PilotDetail, catalogs: PilotCatalogs, options?: AnalyzeOptions): PilotAnalysis | null {
  const input = buildAnalysisInput(
    { pilot: detail.pilot, arms: detail.arms, guardrails: detail.guardrails, measurements: detail.measurements },
    catalogs.metrics,
  );
  return input ? analyzePilot(input, options) : null;
}
