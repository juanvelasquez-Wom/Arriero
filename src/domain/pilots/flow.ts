// Flujo del piloto para la UI: permisos, transiciones y qué falta para enviar a
// revisión. Es un espejo de las RPC de Postgres (20260927000012_pilotos.sql):
// la base es la barrera real; aquí solo se decide qué botones mostrar y qué decir.
import type { PilotRole, PilotStatus, PilotTestType } from "./types";

export interface PilotActor {
  userId: string;
  /** Rol efectivo en el módulo (el admin global cuenta como aprobador); null = sin acceso. */
  role: PilotRole | null;
}

export const canReadPilots = (a: PilotActor) => a.role !== null;
export const canWritePilots = (a: PilotActor) => a.role === "approver" || a.role === "creator";
export const isPilotApprover = (a: PilotActor) => a.role === "approver";

export function effectivePilotRole(isAdmin: boolean, role: PilotRole | null): PilotRole | null {
  return isAdmin ? "approver" : role;
}

/** ¿Se puede editar el diseño? Solo en Borrador y con rol de escritura. */
export const canEditDesign = (a: PilotActor, status: PilotStatus) => canWritePilots(a) && status === "draft";

/** Datos: se cargan hasta que el piloto se cierra. */
export const canLoadData = (a: PilotActor, status: PilotStatus) =>
  canWritePilots(a) && status !== "decided" && status !== "cancelled";

export const canEditChecklist = (a: PilotActor, status: PilotStatus) =>
  canWritePilots(a) && (status === "draft" || status === "in_review" || status === "approved");

export const canLogIncident = (a: PilotActor, status: PilotStatus) =>
  canWritePilots(a) && (status === "approved" || status === "in_test" || status === "in_reading");

export type PilotAction = "submit" | "return" | "approve" | "start" | "to_reading" | "decide" | "cancel" | "delete";

export interface PilotRef {
  status: PilotStatus;
  created_by: string | null;
}

/** Acciones del flujo disponibles para esta persona en este estado. */
export function availableActions(a: PilotActor, p: PilotRef): PilotAction[] {
  const out: PilotAction[] = [];
  const own = p.created_by === a.userId;
  const approver = isPilotApprover(a);
  const writer = canWritePilots(a);
  if (p.status === "draft" && writer) out.push("submit");
  if (p.status === "in_review" && approver) out.push("approve", "return");
  if (p.status === "approved" && writer) out.push("start");
  if (p.status === "in_test" && writer) out.push("to_reading");
  if (p.status === "in_reading" && approver) out.push("decide");
  if (p.status !== "decided" && p.status !== "cancelled" && (approver || (writer && p.status === "draft" && own))) out.push("cancel");
  if (approver || (writer && p.status === "draft" && own)) out.push("delete");
  return out;
}

/** Orden del camino feliz, para la barra de avance. */
export const PILOT_PATH: PilotStatus[] = ["draft", "in_review", "approved", "in_test", "in_reading", "decided"];

export function pathIndex(status: PilotStatus): number {
  return status === "cancelled" ? -1 : PILOT_PATH.indexOf(status);
}

/** Lo que la persona debería hacer ahora, en una frase. */
export function nextStepHint(a: PilotActor, status: PilotStatus): string {
  const approver = isPilotApprover(a);
  switch (status) {
    case "draft":
      return canWritePilots(a) ? "Complete el diseño y envíelo a revisión." : "El equipo está armando el diseño.";
    case "in_review":
      return approver ? "Revise el diseño: apruébelo o devuélvalo con comentarios." : "Esperando la revisión de un aprobador.";
    case "approved":
      return canWritePilots(a) ? "Verifique la medición y lance el piloto." : "Aprobado: falta verificar la medición y lanzarlo.";
    case "in_test":
      return canWritePilots(a) ? "Cargue los datos por periodo y registre los incidentes." : "El piloto está corriendo.";
    case "in_reading":
      return approver ? "Lea el resultado y firme la decisión con su aprendizaje." : "Esperando la decisión del aprobador.";
    case "decided":
      return "Decidido. El aprendizaje ya está en la biblioteca.";
    case "cancelled":
      return "Cancelado.";
  }
}

// -----------------------------------------------------------------------------
// Qué falta para enviar a revisión (mismo orden y texto que public.pilot_missing)
// -----------------------------------------------------------------------------

export interface ReadinessInput {
  problem: string | null;
  hypothesis_change: string | null;
  hypothesis_scope: string | null;
  hypothesis_metric: string | null;
  hypothesis_expected_pct: number | null;
  hypothesis_reason: string | null;
  variable: { recommended_test_type: PilotTestType; alternative_test_type: PilotTestType | null } | null;
  test_type: PilotTestType | null;
  design_justification: string | null;
  primary_metric_id: string | null;
  guardrails: number;
  has_power: boolean;
  has_rules: boolean;
  planned_start: string | null;
  planned_end: string | null;
  media: number;
  arms: { is_control: boolean; cities: string[] }[];
}

export type PilotStepKey = "problema" | "prueba" | "metricas" | "reglas" | "medicion";

export interface MissingItem {
  text: string;
  step: PilotStepKey;
}

const blank = (s: string | null | undefined) => !s || !s.trim();

/** ¿El tipo elegido se aparta de la recomendación de la variable? */
export function needsDesignJustification(input: Pick<ReadinessInput, "variable" | "test_type">): boolean {
  const { variable, test_type } = input;
  if (!variable || !test_type) return false;
  return test_type !== variable.recommended_test_type && test_type !== variable.alternative_test_type;
}

export function missingForReview(p: ReadinessInput): MissingItem[] {
  const out: MissingItem[] = [];
  if (blank(p.problem)) out.push({ text: "el problema", step: "problema" });
  if (blank(p.hypothesis_change) || blank(p.hypothesis_scope) || blank(p.hypothesis_metric) || p.hypothesis_expected_pct == null || blank(p.hypothesis_reason)) {
    out.push({ text: "la hipótesis completa", step: "problema" });
  }
  if (!p.variable) out.push({ text: "qué se prueba (variable)", step: "prueba" });
  if (!p.test_type) out.push({ text: "el tipo de prueba", step: "prueba" });
  else if (needsDesignJustification(p) && (p.design_justification ?? "").trim().length < 10) {
    out.push({ text: "la justificación de por qué no usa el tipo de prueba recomendado", step: "prueba" });
  }
  if (!p.primary_metric_id) out.push({ text: "la métrica principal", step: "metricas" });
  if (p.guardrails < 1) out.push({ text: "al menos un guardrail", step: "metricas" });
  if (!p.has_power) out.push({ text: "el cálculo de potencia", step: "metricas" });
  if (!p.has_rules) out.push({ text: "las reglas de decisión", step: "reglas" });
  if (!p.planned_start || !p.planned_end) out.push({ text: "las fechas planeadas", step: "prueba" });
  if (p.media < 1) out.push({ text: "al menos un medio", step: "prueba" });
  const controls = p.arms.filter((a) => a.is_control).length;
  if (controls !== 1 || p.arms.length < 2) out.push({ text: "los grupos (un control y al menos una variante)", step: "prueba" });
  else if (p.test_type === "geo" && p.arms.some((a) => a.cities.length === 0)) out.push({ text: "las ciudades de cada grupo", step: "prueba" });
  else if (p.test_type === "holdout" && p.arms.length !== 2) out.push({ text: "dos grupos: expuesto y holdout", step: "prueba" });
  return out;
}

// -----------------------------------------------------------------------------
// Pasos del asistente (5 pantallas para los 10 pasos de la metodología)
// -----------------------------------------------------------------------------

export const PILOT_STEPS: { key: PilotStepKey; title: string; covers: string }[] = [
  { key: "problema", title: "Problema e hipótesis", covers: "Qué pasa, con qué evidencia y qué esperamos mover" },
  { key: "prueba", title: "Qué se prueba y cómo", covers: "Variable, tipo de prueba, medios, grupos y fechas" },
  { key: "metricas", title: "Métricas y potencia", covers: "Métrica principal, guardrails y cuánto alcanza a ver la prueba" },
  { key: "reglas", title: "Reglas de decisión", covers: "Cuándo escalar, ajustar o apagar, antes de lanzar" },
  { key: "medicion", title: "Medición y envío", covers: "Eventos que tienen que disparar y enviar a revisión" },
];

export function parsePilotStep(raw: string | string[] | undefined): PilotStepKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return PILOT_STEPS.some((s) => s.key === v) ? (v as PilotStepKey) : "problema";
}

export function nextPilotStep(step: PilotStepKey): PilotStepKey | null {
  const i = PILOT_STEPS.findIndex((s) => s.key === step);
  return PILOT_STEPS[i + 1]?.key ?? null;
}

export function previousPilotStep(step: PilotStepKey): PilotStepKey | null {
  const i = PILOT_STEPS.findIndex((s) => s.key === step);
  return i > 0 ? PILOT_STEPS[i - 1].key : null;
}

/** Hipótesis en una frase, con los huecos marcados. */
export function hypothesisSentence(h: {
  change: string | null;
  scope: string | null;
  metric: string | null;
  expectedPct: number | null;
  reason: string | null;
}): string {
  const pct = h.expectedPct == null ? "[N %]" : `${String(h.expectedPct).replace(".", ",")} %`;
  return `Si hacemos ${h.change?.trim() || "[cambio]"} en ${h.scope?.trim() || "[ámbito]"}, esperamos mover ${
    h.metric?.trim() || "[métrica]"
  } en ${pct} porque ${h.reason?.trim() || "[razón]"}.`;
}
