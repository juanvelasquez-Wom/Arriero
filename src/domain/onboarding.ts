// Lista de verificación de primeros pasos de un programa.

export interface OnboardingCounts {
  lines: number;
  linesWithNorthStar: number;
  inputMetrics: number;
  stages: number;
  problems: number;
  experiments: number;
}

export interface OnboardingStep {
  key: "lines" | "north_star" | "tree" | "funnel" | "problem" | "experiment";
  label: string;
  hint: string;
  done: boolean;
}

export function onboardingSteps(c: OnboardingCounts): OnboardingStep[] {
  return [
    {
      key: "lines",
      label: "Configure las líneas de negocio",
      hint: "Cada línea tiene su propia métrica norte, árbol y embudo.",
      done: c.lines > 0,
    },
    {
      key: "north_star",
      label: "Defina la métrica norte de cada línea",
      hint: "La métrica que representa el valor que la línea quiere crecer.",
      done: c.lines > 0 && c.linesWithNorthStar >= c.lines,
    },
    {
      key: "tree",
      label: "Arme el árbol de métricas",
      hint: "Descomponga la métrica norte en métricas de entrada que el equipo controla.",
      done: c.inputMetrics > 0,
    },
    {
      key: "funnel",
      label: "Revise el embudo",
      hint: "Ajuste las etapas propuestas y vincule una métrica a cada una.",
      done: c.stages > 0,
    },
    {
      key: "problem",
      label: "Registre la primera oportunidad de mejora con evidencia",
      hint: "Nada de corazonadas: los ejercicios nacen de oportunidades de mejora.",
      done: c.problems > 0,
    },
    {
      key: "experiment",
      label: "Cree el primer ejercicio",
      hint: "Hipótesis SI / ENTONCES / PORQUE, priorizada con ICE.",
      done: c.experiments > 0,
    },
  ];
}

export function onboardingComplete(c: OnboardingCounts): boolean {
  return onboardingSteps(c).every((s) => s.done);
}
