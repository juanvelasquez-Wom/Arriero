// Etiquetas visibles en español para los enums del dominio.
import type {
  CalendarEventType,
  ControlLevel,
  Decision,
  ExperimentStatus,
  ImpactLevel,
  MetricBranch,
  MetricDirection,
  MetricType,
  OwnerType,
  ProblemStatus,
  ProgramRole,
  TestType,
  Verdict,
} from "./types";

export const ROLE_LABEL: Record<ProgramRole, string> = {
  owner: "Owner",
  collaborator: "Colaborador",
  agency: "Agencia",
  viewer: "Lector",
};

export const ROLE_DESCRIPTION: Record<ProgramRole, string> = {
  owner: "Dueño del programa: decide, invita, borra y restaura.",
  collaborator: "Equipo interno: edita la estructura, crea oportunidades de mejora y ejercicios, califica ICE.",
  agency: "Ejecuta los ejercicios que tiene asignados.",
  viewer: "Solo lectura de todo el programa y los tableros.",
};

export const METRIC_TYPE_LABEL: Record<MetricType, string> = {
  north_star: "Métrica norte",
  efficiency: "Eficiencia",
  input: "Entrada",
};

export const METRIC_BRANCH_LABEL: Record<MetricBranch, string> = {
  demand_volume: "Volumen de demanda",
  conversion: "Conversión",
  efficiency: "Eficiencia",
  recovery_recurrence: "Recuperación y recurrencia",
};

export const DIRECTION_LABEL: Record<MetricDirection, string> = {
  up: "Sube",
  down: "Baja",
};

export const IMPACT_LABEL: Record<ImpactLevel, string> = {
  high: "Alto",
  medium: "Medio",
  low: "Bajo",
};

export const CONTROL_LABEL: Record<ControlLevel, string> = {
  ours: "Nuestro",
  shared: "Compartido",
  external: "Externo",
};

export const PROBLEM_STATUS_LABEL: Record<ProblemStatus, string> = {
  to_validate: "Por validar",
  validated: "Validada",
  discarded: "Descartada",
};

export const STATUS_LABEL: Record<ExperimentStatus, string> = {
  idea: "Idea",
  prioritized: "Priorizado",
  in_design: "En diseño",
  in_test: "En prueba",
  in_reading: "En lectura",
  decided: "Decidido",
  scaled: "Escalado a BAU",
  discarded: "Descartado",
};

export const OWNER_TYPE_LABEL: Record<OwnerType, string> = {
  internal: "Interno",
  agency: "Agencia",
  mixed: "Mixto",
};

export const TEST_TYPE_LABEL: Record<TestType, string> = {
  ab: "A/B",
  geo: "Por geografía",
  before_after: "Antes / después",
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  winner: "Ganador",
  loser: "Perdedor",
  inconclusive: "No concluyente",
};

export const DECISION_LABEL: Record<Decision, string> = {
  scale: "Escalar",
  adjust: "Ajustar",
  kill: "Apagar",
};

export const CALENDAR_EVENT_LABEL: Record<CalendarEventType, string> = {
  peak: "Pico comercial",
  freeze: "Congelamiento",
  decision: "Punto de decisión",
};

/** Alcance de una métrica del árbol (`metrics.scope`). */
export const METRIC_SCOPE_LABEL: Record<"business" | "platform", string> = {
  business: "De negocio",
  platform: "De plataforma",
};

/** Aviso fijo para las métricas de plataforma. */
export const PLATFORM_SCOPE_WARNING = "Esta métrica mide eficiencia en plataforma, no venta incremental.";

export function labelOf<T extends string>(map: Record<T, string>, value: T | null | undefined, fallback = "—") {
  return value ? map[value] : fallback;
}
