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
      label: "Configura las líneas de negocio",
      hint: "Cada línea tiene su propia métrica norte, árbol y embudo.",
      done: c.lines > 0,
    },
    {
      key: "north_star",
      label: "Define la métrica norte de cada línea",
      hint: "La métrica que representa el valor que la línea quiere crecer.",
      done: c.lines > 0 && c.linesWithNorthStar >= c.lines,
    },
    {
      key: "tree",
      label: "Arma el árbol de métricas",
      hint: "Descompón la métrica norte en métricas de entrada que el equipo controla.",
      done: c.inputMetrics > 0,
    },
    {
      key: "funnel",
      label: "Revisa el embudo",
      hint: "Ajusta las etapas propuestas y vincula una métrica a cada una.",
      done: c.stages > 0,
    },
    {
      key: "problem",
      label: "Registra el primer problema con evidencia",
      hint: "Nada de nice to try: los ejercicios nacen de problemas.",
      done: c.problems > 0,
    },
    {
      key: "experiment",
      label: "Crea el primer ejercicio",
      hint: "Hipótesis SI / ENTONCES / PORQUE, priorizada con ICE.",
      done: c.experiments > 0,
    },
  ];
}

export function onboardingComplete(c: OnboardingCounts): boolean {
  return onboardingSteps(c).every((s) => s.done);
}
