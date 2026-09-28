import { z } from "zod";
import {
  CHECKLIST_PLATFORMS,
  CHECKLIST_STATUSES,
  GRANULARITIES,
  PILOT_METRIC_CALCS,
  PILOT_METRIC_SCOPES,
  PILOT_ROLES,
  PILOT_TEST_TYPES,
  PILOT_UNITS,
  VARIABLE_CATEGORIES,
} from "@/domain/pilots/types";
import { DECISIONS, IMPACT_LEVELS, METRIC_DIRECTIONS, VERDICTS } from "@/domain/types";

const uuid = z.string().uuid("Elija una opción.");
const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null))
  .transform((v) => v || null);
const optionalText = (max = 4000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.")
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null))
  .transform((v) => v || null);
const requiredDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");
const optionalNumber = (min?: number, max?: number) => {
  let n = z.number({ error: "Escriba un número." });
  if (min != null) n = n.min(min, `Mínimo ${min}.`);
  if (max != null) n = n.max(max, `Máximo ${max}.`);
  return n.optional().nullable().transform((v) => (v == null || Number.isNaN(v) ? null : v));
};
const cities = z
  .array(z.string().trim().min(1).max(80))
  .max(60)
  .default([])
  .transform((list) => [...new Map(list.map((c) => [c.toLocaleLowerCase("es-CO"), c])).values()]);

/** Paso 1 · Problema e hipótesis. */
export const pilotProblemSchema = z.object({
  title: z.string().trim().min(5, "Póngale un nombre de al menos 5 caracteres.").max(160),
  problem: z.string().trim().min(10, "Cuente el problema en al menos 10 caracteres: un piloto nace de un problema.").max(4000),
  problem_evidence: optionalText(),
  hypothesis_change: optionalText(500),
  hypothesis_scope: optionalText(500),
  hypothesis_metric: optionalText(200),
  hypothesis_expected_pct: optionalNumber(-100, 1000),
  hypothesis_reason: optionalText(1000),
});
export type PilotProblemInput = z.input<typeof pilotProblemSchema>;

export const pilotArmSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(1, "Póngale nombre al grupo.").max(80),
  is_control: z.boolean(),
  split_pct: optionalNumber(0, 100),
  cities,
  description: optionalText(500),
});

export const pilotMediaSchema = z.object({
  id: optionalUuid,
  media_id: uuid,
  account: optionalText(160),
  campaign: optionalText(160),
  audience: optionalText(160),
  destination: optionalText(160),
  cities,
});

/** Paso 2 · Qué se prueba y cómo. */
export const pilotDesignSchema = z
  .object({
    variable_id: optionalUuid,
    test_type: z.enum(PILOT_TEST_TYPES).optional().nullable(),
    design_justification: optionalText(2000),
    design_config: z
      .object({
        holdout_pct: optionalNumber(1, 90),
        pre_start: isoDate,
        granularity: z.enum(GRANULARITIES).default("day"),
        notes: optionalText(2000),
      })
      .default({ holdout_pct: null, pre_start: null, granularity: "day", notes: null }),
    planned_start: isoDate,
    planned_end: isoDate,
    planned_budget_cop: optionalNumber(0),
    arms: z.array(pilotArmSchema).max(12, "Máximo 12 grupos."),
    media: z.array(pilotMediaSchema).max(10, "Máximo 10 medios."),
    /** `updated_at` del piloto cuando se abrió el formulario (bloqueo optimista). */
    expected_updated_at: z.string().max(64).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.planned_start && v.planned_end && v.planned_end < v.planned_start) {
      ctx.addIssue({ code: "custom", path: ["planned_end"], message: "El fin no puede ser antes del inicio." });
    }
    if (v.arms.filter((a) => a.is_control).length > 1) {
      ctx.addIssue({ code: "custom", path: ["arms"], message: "Solo un grupo puede ser el control." });
    }
    const names = v.arms.map((a) => a.name.toLocaleLowerCase("es-CO"));
    if (new Set(names).size !== names.length) ctx.addIssue({ code: "custom", path: ["arms"], message: "Los grupos no pueden repetir nombre." });
    const splits = v.arms.map((a) => a.split_pct).filter((s): s is number => s != null);
    if (splits.length === v.arms.length && v.arms.length > 0 && Math.abs(splits.reduce((a, b) => a + b, 0) - 100) > 0.5) {
      ctx.addIssue({ code: "custom", path: ["arms"], message: "El reparto de los grupos debe sumar 100 %." });
    }
    if (v.design_config.pre_start && v.planned_start && v.design_config.pre_start >= v.planned_start) {
      ctx.addIssue({ code: "custom", path: ["design_config", "pre_start"], message: "El periodo previo empieza antes del inicio." });
    }
  });
export type PilotDesignInput = z.input<typeof pilotDesignSchema>;

export const powerInputsSchema = z.object({
  baseline: z.number({ error: "Escriba la línea base." }).positive("La línea base debe ser mayor que cero."),
  daily_cv: optionalNumber(0.01, 5),
  daily_volume_per_arm: optionalNumber(1),
  planned_days: z.number({ error: "Escriba los días." }).int().min(1, "Mínimo 1 día.").max(365, "Máximo 365 días."),
  target_mde_pct: optionalNumber(0.1, 500),
  daily_spend_cop: optionalNumber(0),
  alpha: z.number().min(0.001).max(0.2).default(0.05),
  power: z.number().min(0.5).max(0.99).default(0.8),
});

/** Paso 3 · Métricas y potencia. */
export const pilotMetricsSchema = z.object({
  primary_metric_id: optionalUuid,
  guardrails: z
    .array(z.object({ metric_id: uuid, limit_pct: z.number({ error: "Escriba el límite." }).positive("Mayor que cero.").max(1000), note: optionalText(300) }))
    .max(3, "Máximo 3 guardrails."),
  power_inputs: powerInputsSchema.nullable().optional(),
});
export type PilotMetricsInput = z.input<typeof pilotMetricsSchema>;

/** Paso 4 · Reglas de decisión. */
export const decisionRulesSchema = z
  .object({
    scale_min_probability: z.number().min(0.5, "Mínimo 50 %.").max(0.999),
    scale_min_lift_pct: z.number().min(-100).max(1000),
    kill_max_probability: z.number().min(0).max(0.5, "Máximo 50 %."),
    guardrails_block_scale: z.boolean(),
  })
  .refine((r) => r.kill_max_probability < r.scale_min_probability, {
    path: ["kill_max_probability"],
    message: "El umbral para apagar debe ser menor que el de escalar.",
  });
export type DecisionRulesInput = z.input<typeof decisionRulesSchema>;

export const checklistItemSchema = z.object({
  id: optionalUuid,
  platform: z.enum(CHECKLIST_PLATFORMS),
  event_name: z.string().trim().min(1, "Escriba el evento.").max(120),
  description: optionalText(500),
});
export const checklistSchema = z.array(checklistItemSchema).max(30);

export const checklistStatusSchema = z.object({
  status: z.enum(CHECKLIST_STATUSES),
  evidence: optionalText(1000),
});

/** Vínculos opcionales y responsable (se cambian en cualquier estado). */
export const pilotLinksSchema = z.object({
  owner_id: optionalUuid,
  program_id: optionalUuid,
  experiment_id: optionalUuid,
  tree_metric_id: optionalUuid,
});
export type PilotLinksInput = z.input<typeof pilotLinksSchema>;

export const measurementSchema = z.object({
  arm_id: uuid,
  metric_id: uuid,
  unit_label: z.string().trim().max(80).default(""),
  period_start: requiredDate,
  value: z.number({ error: "Escriba un número." }).min(0, "No se aceptan valores negativos."),
});
export const measurementsSchema = z.object({
  granularity: z.enum(GRANULARITIES),
  source: z.enum(["manual", "csv"]),
  values: z.array(measurementSchema).min(1, "No hay datos para guardar.").max(5000, "Máximo 5.000 valores por carga."),
});
export type MeasurementsInput = z.input<typeof measurementsSchema>;

export const incidentSchema = z.object({
  occurred_on: requiredDate,
  description: z.string().trim().min(5, "Cuente qué pasó (mínimo 5 caracteres).").max(2000),
  expected_impact: z.enum(IMPACT_LEVELS),
});

export const decidePilotSchema = z.object({
  verdict: z.enum(VERDICTS),
  decision: z.enum(DECISIONS),
  justification: z.string().trim().min(10, "Justifique la decisión (mínimo 10 caracteres).").max(4000),
  learning: z.string().trim().min(10, "Escriba qué aprendimos (mínimo 10 caracteres).").max(4000),
});
export type DecidePilotInput = z.input<typeof decidePilotSchema>;

export const reasonSchema = z.string().trim().min(5, "Cuente el motivo (mínimo 5 caracteres).").max(2000);

// Catálogos
export const mediaSchema = z.object({
  name: z.string().trim().min(1, "Escriba el nombre del medio.").max(80),
  kind: optionalText(80),
  provider: optionalText(80),
});
export type MediaInput = z.input<typeof mediaSchema>;

export const pilotMetricDefSchema = z
  .object({
    name: z.string().trim().min(1, "Escriba el nombre.").max(80),
    description: optionalText(300),
    unit: z.enum(PILOT_UNITS),
    direction: z.enum(METRIC_DIRECTIONS),
    scope: z.enum(PILOT_METRIC_SCOPES),
    calc: z.enum(PILOT_METRIC_CALCS),
    numerator_id: optionalUuid,
    denominator_id: optionalUuid,
    is_spend: z.boolean().default(false),
    media_id: optionalUuid,
  })
  .superRefine((v, ctx) => {
    if (v.calc !== "sum" && (!v.numerator_id || !v.denominator_id)) {
      ctx.addIssue({ code: "custom", path: ["numerator_id"], message: "Elija las dos métricas con que se calcula." });
    }
    if (v.calc !== "sum" && v.numerator_id && v.numerator_id === v.denominator_id) {
      ctx.addIssue({ code: "custom", path: ["denominator_id"], message: "Elija dos métricas distintas." });
    }
  });
export type PilotMetricDefInput = z.input<typeof pilotMetricDefSchema>;

export const variableSchema = z.object({
  category: z.enum(VARIABLE_CATEGORIES),
  name: z.string().trim().min(1, "Escriba la variable.").max(120),
  description: optionalText(500),
  recommended_test_type: z.enum(PILOT_TEST_TYPES),
  alternative_test_type: z.enum(PILOT_TEST_TYPES).optional().nullable(),
});
export type VariableInput = z.input<typeof variableSchema>;

export const pilotRoleSchema = z.object({
  user_id: uuid,
  role: z.enum(PILOT_ROLES).nullable(),
});

// -----------------------------------------------------------------------------
// Integraciones (Meta primero)
// -----------------------------------------------------------------------------

/** Token de acceso: se escribe en un campo de contraseña y va directo a Vault. */
const accessToken = z
  .string()
  .trim()
  .min(20, "El token parece incompleto: cópielo entero desde Meta.")
  .max(2000, "El token es demasiado largo.")
  .refine((v) => !/\s/.test(v), "El token no lleva espacios.");

export const integrationConnectionSchema = z.object({
  account_label: z.string().trim().min(1, "Póngale un nombre a la cuenta.").max(120),
  account_ref: z
    .string()
    .trim()
    .regex(/^act_\d{3,30}$/, "El id de la cuenta publicitaria empieza por act_ y sigue con números (ej. act_1234567890)."),
  token: z.union([accessToken, z.literal("")]).optional(),
  expires_at: isoDate,
});
export type IntegrationConnectionInput = z.input<typeof integrationConnectionSchema>;

export const integrationTokenSchema = z.object({
  token: accessToken,
  expires_at: isoDate,
});
export type IntegrationTokenInput = z.input<typeof integrationTokenSchema>;

/** Mapeo de entidades de la plataforma a grupos del piloto (null = no se usa). */
export const entityMapSchema = z.record(z.string().min(1).max(300), uuid.nullable()).refine((m) => Object.keys(m).length <= 500, "Demasiadas entidades.");

export const businessConversionsSchema = z
  .array(
    z.object({
      day: requiredDate,
      channel: z.string().trim().min(1).max(80),
      campaign_name: z.string().trim().max(200),
      sales: z.number().finite().nonnegative(),
      revenue_cop: z.number().finite().nonnegative().nullable(),
      match_key: z
        .string()
        .trim()
        .max(200)
        .refine((v) => !(/^[\d\s+\-().]+$/.test(v) && v.replace(/\D/g, "").length >= 7), "La clave parece un teléfono en claro: use un hash."),
    }),
  )
  .min(1, "No hay filas para guardar.")
  .max(5000, "Máximo 5.000 filas por carga.");
