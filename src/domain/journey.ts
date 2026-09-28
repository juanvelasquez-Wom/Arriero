// "El camino del arriero": las 7 etapas del concepto de marca (Ver → Crecer)
// traducidas a lo que hay en el programa. Solo presenta conteos; no decide nada.
import type { ExperimentStatus } from "./types";

export type JourneyKey = "ver" | "entender" | "decidir" | "experimentar" | "ejecutar" | "aprender" | "crecer";

export interface JourneyStage {
  key: JourneyKey;
  label: string;
  /** Qué se cuenta, en palabras simples. */
  what: string;
  count: number;
  /** Ruta relativa al programa. */
  path: string;
  /** Resalta en amarillo lo que exige atención (lo que está en prueba). */
  attention: boolean;
}

const BY_STATUS: Record<Exclude<JourneyKey, "ver" | "entender">, ExperimentStatus[]> = {
  decidir: ["idea", "prioritized"],
  experimentar: ["in_design"],
  ejecutar: ["in_test", "in_reading"],
  aprender: ["decided"],
  crecer: ["scaled"],
};

export function journeyStages(input: {
  metrics: number;
  problems: number;
  experiments: { status: ExperimentStatus }[];
}): JourneyStage[] {
  const n = (statuses: ExperimentStatus[]) => input.experiments.filter((e) => statuses.includes(e.status)).length;
  const ejecutar = n(BY_STATUS.ejecutar);
  return [
    { key: "ver", label: "Ver", what: "métricas en el mapa", count: input.metrics, path: "/carga", attention: false },
    { key: "entender", label: "Entender", what: "oportunidades de mejora", count: input.problems, path: "/problemas", attention: false },
    { key: "decidir", label: "Decidir", what: "ideas y priorizados", count: n(BY_STATUS.decidir), path: "/ejercicios", attention: false },
    { key: "experimentar", label: "Experimentar", what: "en diseño", count: n(BY_STATUS.experimentar), path: "/tableros/kanban", attention: false },
    { key: "ejecutar", label: "Ejecutar", what: "en prueba o lectura", count: ejecutar, path: "/tableros/gantt", attention: ejecutar > 0 },
    { key: "aprender", label: "Aprender", what: "decididos", count: n(BY_STATUS.aprender), path: "/aprendizajes", attention: false },
    { key: "crecer", label: "Crecer", what: "escalados a BAU", count: n(BY_STATUS.crecer), path: "/tableros/resultados", attention: false },
  ];
}
