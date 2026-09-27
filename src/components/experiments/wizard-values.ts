// Tipos y valores iniciales del asistente de ejercicios. Vive fuera del
// componente cliente para que las páginas del servidor puedan usarlos.
import type {
  CalendarEvent,
  ControlLevel,
  ExperimentStatus,
  MetricDirection,
  MetricType,
  OwnerType,
  ProgramRole,
  ScoringConfig,
  TestType,
  Verdict,
} from "@/domain/types";

export interface WizardVariant {
  id?: string;
  name: string;
  is_control: boolean;
  description: string;
}

export interface WizardValues {
  problem_id: string;
  metric_id: string;
  title: string;
  derived_from_learning_id: string | null;
  hypothesis_if: string;
  hypothesis_then: string;
  hypothesis_because: string;
  impact: number | null;
  confidence: number | null;
  ease: number | null;
  fits_calendar: boolean;
  /** true cuando la persona cambió a mano el filtro de calendario (si no, se calcula con las fechas). */
  fits_calendar_override: boolean;
  control: ControlLevel;
  test_type: TestType | null;
  primary_metric: string;
  control_metrics: string[];
  min_duration_days: number | null;
  decision_rule: string;
  owner_id: string | null;
  owner_type: OwnerType | null;
  planned_start: string;
  planned_end: string;
  variants: WizardVariant[];
}

export interface WizardData {
  programId: string;
  lines: { id: string; name: string }[];
  problems: { id: string; line_id: string; title: string; stage_name: string; status: string; control: ControlLevel }[];
  metrics: { id: string; line_id: string; name: string; type: MetricType; parent_id: string | null; direction: MetricDirection }[];
  members: { user_id: string; name: string; role: ProgramRole }[];
  calendar: CalendarEvent[];
  scoring: ScoringConfig;
  canScore: boolean;
  isAgency: boolean;
  /** Ejercicios y aprendizajes del programa, para el aviso "Esto se parece a…". */
  similar: {
    experiments: SimilarExperimentCandidate[];
    learnings: SimilarLearningCandidate[];
  };
}

export interface SimilarExperimentCandidate {
  id: string;
  title: string;
  /** Título + hipótesis, para comparar. */
  text: string;
  line_name: string;
  status: ExperimentStatus;
  verdict: Verdict | null;
  /** Fecha de la decisión o de creación. */
  date: string | null;
}

export interface SimilarLearningCandidate {
  id: string;
  text: string;
  experiment_id: string;
  experiment_title: string;
  line_name: string;
  verdict: Verdict | null;
}

export function emptyWizardValues(): WizardValues {
  return {
    problem_id: "",
    metric_id: "",
    title: "",
    derived_from_learning_id: null,
    hypothesis_if: "",
    hypothesis_then: "",
    hypothesis_because: "",
    impact: null,
    confidence: null,
    ease: null,
    fits_calendar: false,
    fits_calendar_override: false,
    control: "ours",
    test_type: null,
    primary_metric: "",
    control_metrics: [],
    min_duration_days: null,
    decision_rule: "",
    owner_id: null,
    owner_type: null,
    planned_start: "",
    planned_end: "",
    variants: [
      { name: "Control", is_control: true, description: "" },
      { name: "Variante A", is_control: false, description: "" },
    ],
  };
}
