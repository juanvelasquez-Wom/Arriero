// Textos de la auditoría de un piloto: qué tabla, qué campo y cómo se lee cada
// valor ("campo: antes → después"), sin nombres técnicos.
import { DECISION_LABEL, IMPACT_LABEL, VERDICT_LABEL } from "../labels";
import { CHECKLIST_PLATFORM_LABEL, CHECKLIST_STATUS_LABEL, MEASUREMENT_SOURCE_LABEL, PILOT_STATUS_LABEL, PILOT_TEST_TYPE_LABEL } from "./labels";

export const AUDIT_TABLE_LABEL: Record<string, string> = {
  pilots: "Diseño",
  pilot_arms: "Grupos",
  pilot_media: "Medios",
  pilot_guardrails: "Guardrails",
  pilot_checklist_items: "Lista de chequeo",
  pilot_measurements: "Datos",
  pilot_incidents: "Incidentes",
  pilot_learnings: "Aprendizaje",
  pilot_reviews: "Revisión",
};

export const AUDIT_OP_LABEL: Record<string, string> = {
  insert: "Agregó",
  update: "Cambió",
  delete: "Quitó",
};

export const AUDIT_FIELD_LABEL: Record<string, string> = {
  title: "Nombre",
  problem: "Problema",
  problem_evidence: "Evidencia",
  hypothesis_change: "Hipótesis · cambio",
  hypothesis_scope: "Hipótesis · dónde",
  hypothesis_metric: "Hipótesis · métrica",
  hypothesis_expected_pct: "Hipótesis · efecto esperado (%)",
  hypothesis_reason: "Hipótesis · porque",
  variable_id: "Qué se prueba",
  test_type: "Tipo de prueba",
  design_justification: "Justificación del tipo de prueba",
  design_config: "Configuración de la prueba",
  primary_metric_id: "Métrica principal",
  power_inputs: "Datos de la calculadora de potencia",
  power_result: "Resultado de potencia",
  decision_rules: "Reglas de decisión",
  planned_start: "Inicio planeado",
  planned_end: "Fin planeado",
  actual_start: "Inicio real",
  actual_end: "Fin real",
  planned_budget_cop: "Presupuesto (COP)",
  owner_id: "Responsable",
  status: "Estado",
  status_changed_at: "Cambio de estado",
  submitted_at: "Enviado a revisión",
  design_locked_at: "Bloqueo del diseño",
  approved_by: "Aprobado por",
  approved_at: "Aprobado el",
  verdict: "Veredicto",
  decision: "Decisión",
  decision_justification: "Justificación de la decisión",
  decided_by: "Decidido por",
  decided_at: "Decidido el",
  cancel_reason: "Motivo de cancelación",
  program_id: "Programa vinculado",
  experiment_id: "Ejercicio vinculado",
  tree_metric_id: "Métrica del árbol vinculada",
  is_example: "Ejemplo",
  deleted_at: "Borrado",
  deleted_by: "Borrado por",
  // Grupos
  name: "Nombre",
  is_control: "Es el control",
  split_pct: "Reparto (%)",
  cities: "Ciudades",
  description: "Descripción",
  sort_order: "Orden",
  // Medios
  media_id: "Medio",
  account: "Cuenta",
  campaign: "Campaña",
  audience: "Audiencia",
  destination: "Destino",
  // Guardrails
  metric_id: "Métrica",
  limit_pct: "Límite (%)",
  note: "Nota",
  // Lista de chequeo
  platform: "Plataforma",
  event_name: "Evento",
  evidence: "Evidencia",
  checked_by: "Verificado por",
  checked_at: "Verificado el",
  // Datos
  arm_id: "Grupo",
  unit_label: "Ciudad",
  period_start: "Periodo",
  granularity: "Granularidad",
  value: "Valor",
  source: "Origen",
  snapshot_id: "Extracción",
  original_value: "Valor original",
  adjusted_at: "Ajustado a mano el",
  adjusted_by: "Ajustado por",
  // Incidentes
  occurred_on: "Fecha",
  expected_impact: "Impacto esperado",
  // Aprendizaje
  text: "Texto",
};

/** Campos que no aportan nada al leer la bitácora. */
const HIDDEN = new Set(["id", "pilot_id", "created_at", "updated_at", "created_by", "updated_by", "status_changed_at", "sort_order"]);

export function auditFieldLabel(field: string): string {
  return AUDIT_FIELD_LABEL[field] ?? field.replace(/_/g, " ");
}

export interface AuditValueContext {
  /** id → nombre (personas, métricas, medios, grupos, variables). */
  names?: Record<string, string>;
  /** Tabla de la fila: el mismo campo se lee distinto según la tabla (p. ej. `status`). */
  table?: string;
}

const ENUMS: Record<string, Record<string, string>> = {
  status: PILOT_STATUS_LABEL,
  test_type: PILOT_TEST_TYPE_LABEL,
  verdict: VERDICT_LABEL,
  decision: DECISION_LABEL,
  expected_impact: IMPACT_LABEL,
  platform: CHECKLIST_PLATFORM_LABEL,
  source: MEASUREMENT_SOURCE_LABEL,
  granularity: { day: "Día", week: "Semana" },
};

const numberFmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 4 });

/** Un valor de la auditoría en texto corto. */
export function formatAuditValue(field: string, value: unknown, ctx: AuditValueContext = {}): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (field === "status" && ctx.table === "pilot_checklist_items" && typeof value === "string" && value in CHECKLIST_STATUS_LABEL) {
    return CHECKLIST_STATUS_LABEL[value as keyof typeof CHECKLIST_STATUS_LABEL];
  }
  if (typeof value === "string" && ENUMS[field]?.[value]) return ENUMS[field][value];
  if (typeof value === "string" && ctx.names?.[value]) return ctx.names[value];
  if (typeof value === "number") return numberFmt.format(value);
  if (Array.isArray(value)) return value.length ? value.map((v) => formatAuditValue(field, v, ctx)).join(", ") : "—";
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v != null && v !== "");
    if (!entries.length) return "—";
    const text = entries.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ");
    return text.length > 160 ? `${text.slice(0, 157)}…` : text;
  }
  const s = String(value);
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}

export interface AuditChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

/**
 * Cambios de una fila de auditoría. En un update vienen solo los campos que
 * cambiaron; en insert y delete, la fila completa (se muestra un lado).
 */
export function auditChanges(
  row: { op: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null },
  ctx: AuditValueContext = {},
): AuditChange[] {
  const oldData = row.old_data ?? {};
  const newData = row.new_data ?? {};
  const fields = [...new Set([...Object.keys(newData), ...Object.keys(oldData)])].filter((f) => !HIDDEN.has(f));
  return fields
    .map((field) => ({
      field,
      label: auditFieldLabel(field),
      before: row.op === "insert" ? "—" : formatAuditValue(field, oldData[field], ctx),
      after: row.op === "delete" ? "—" : formatAuditValue(field, newData[field], ctx),
    }))
    .filter((c) => row.op !== "insert" || c.after !== "—")
    .filter((c) => row.op !== "delete" || c.before !== "—");
}
