// Regla 8 · Borrado: qué se afecta y qué opciones hay. Los conteos vienen de
// la RPC public.deletion_impact.

export type DeletableEntity =
  | "program"
  | "line"
  | "metric"
  | "stage"
  | "problem"
  | "experiment"
  | "variant"
  | "attachment"
  | "calendar_event";

export const ENTITY_LABEL: Record<DeletableEntity, string> = {
  program: "Programa",
  line: "Línea",
  metric: "Métrica",
  stage: "Etapa",
  problem: "Problema",
  experiment: "Ejercicio",
  variant: "Variante",
  attachment: "Adjunto",
  calendar_event: "Evento del calendario",
};

export type ImpactCounts = Partial<
  Record<
    | "lines"
    | "metrics"
    | "child_metrics"
    | "metric_values"
    | "stages"
    | "problems"
    | "experiments"
    | "variants"
    | "attachments"
    | "learnings",
    number
  >
>;

const NOUNS: Record<keyof ImpactCounts, [string, string]> = {
  lines: ["línea", "líneas"],
  metrics: ["métrica", "métricas"],
  child_metrics: ["métrica hija", "métricas hijas"],
  metric_values: ["valor semanal", "valores semanales"],
  stages: ["etapa", "etapas"],
  problems: ["problema", "problemas"],
  experiments: ["ejercicio", "ejercicios"],
  variants: ["variante", "variantes"],
  attachments: ["adjunto", "adjuntos"],
  learnings: ["aprendizaje", "aprendizajes"],
};

/** Frases legibles de lo que también se borrará ("3 ejercicios", "1 adjunto"). */
export function describeImpact(counts: ImpactCounts): string[] {
  return (Object.keys(NOUNS) as (keyof ImpactCounts)[])
    .filter((k) => (counts[k] ?? 0) > 0)
    .map((k) => {
      const n = counts[k]!;
      return `${n} ${NOUNS[k][n === 1 ? 0 : 1]}`;
    });
}

/** Entidades cuyo borrado obliga a elegir entre reasignar o borrar dependientes. */
export function dependencyChoice(entity: DeletableEntity, counts: ImpactCounts) {
  if (entity === "problem" || entity === "metric") {
    const n = counts.experiments ?? 0;
    return n > 0 ? { dependents: "experiments" as const, count: n } : null;
  }
  if (entity === "stage") {
    const n = counts.problems ?? 0;
    return n > 0 ? { dependents: "problems" as const, count: n } : null;
  }
  return null;
}

export type DeleteStrategy = "reassign" | "cascade";

/** Validación del texto de confirmación para borrar un programa. */
export function confirmsProgramName(typed: string, programName: string): boolean {
  return typed.trim() === programName.trim() && programName.trim().length > 0;
}

export const TRASH_RETENTION_DAYS = 30;

export function daysLeftInTrash(deletedAt: string, now: Date = new Date()): number {
  const elapsed = Math.floor((now.getTime() - new Date(deletedAt).getTime()) / 86_400_000);
  return Math.max(0, TRASH_RETENTION_DAYS - elapsed);
}
