import { z } from "zod";
import { CONTROL_LEVELS, DECISIONS, EXPERIMENT_STATUSES, OWNER_TYPES, TEST_TYPES, VERDICTS } from "@/domain/types";

const uuid = z.string().uuid("Elige una opción.");
const optionalText = z
  .string()
  .trim()
  .max(4000)
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
const score = z.coerce.number().int().min(1, "De 1 a 10.").max(10, "De 1 a 10.").nullable().optional();

/** Paso 1 · Problema y métrica del árbol (obligatorios: regla 1). */
export const experimentOriginSchema = z.object({
  problem_id: uuid,
  metric_id: uuid,
  title: z.string().trim().min(3, "Escribe un título de al menos 3 caracteres.").max(200),
  derived_from_learning_id: uuid.optional().nullable(),
});

/** Paso 2 · Hipótesis SI / ENTONCES / PORQUE. */
export const experimentHypothesisSchema = z.object({
  hypothesis_if: optionalText,
  hypothesis_then: optionalText,
  hypothesis_because: optionalText,
});

/** Paso 3 · Priorización. */
export const experimentPrioritySchema = z.object({
  impact: score,
  confidence: score,
  ease: score,
  fits_calendar: z.boolean(),
  control: z.enum(CONTROL_LEVELS),
});

/** Paso 4 · Diseño de la prueba. */
export const experimentDesignSchema = z.object({
  test_type: z.enum(TEST_TYPES).nullable().optional(),
  primary_metric: optionalText,
  control_metrics: z.array(z.string().trim().min(1)).max(10).default([]),
  min_duration_days: z.coerce.number().int().min(1, "Mínimo 1 día.").max(365).nullable().optional(),
  decision_rule: optionalText,
});

/** Paso 5 · Responsable y fechas. */
export const experimentScheduleSchema = z
  .object({
    owner_id: uuid.nullable().optional(),
    owner_type: z.enum(OWNER_TYPES).nullable().optional(),
    planned_start: isoDate,
    planned_end: isoDate,
    actual_start: isoDate,
    actual_end: isoDate,
  })
  .refine((v) => !v.planned_start || !v.planned_end || v.planned_end >= v.planned_start, {
    path: ["planned_end"],
    message: "El fin planeado debe ser posterior al inicio.",
  })
  .refine((v) => !v.actual_start || !v.actual_end || v.actual_end >= v.actual_start, {
    path: ["actual_end"],
    message: "El fin real debe ser posterior al inicio real.",
  });

export const variantSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Ponle un nombre.").max(120),
  is_control: z.boolean(),
  description: optionalText,
});

export const variantsSchema = z
  .array(variantSchema)
  .max(12)
  .refine((vs) => vs.filter((v) => v.is_control).length <= 1, { message: "Solo puede haber un control." });

/** Borrador completo del asistente: todo es opcional excepto el origen. */
export const experimentDraftSchema = experimentOriginSchema
  .merge(experimentHypothesisSchema)
  .merge(experimentPrioritySchema.partial())
  .merge(experimentDesignSchema.partial())
  .extend({
    owner_id: uuid.nullable().optional(),
    owner_type: z.enum(OWNER_TYPES).nullable().optional(),
    planned_start: isoDate,
    planned_end: isoDate,
    variants: variantsSchema.optional(),
  });

export type ExperimentDraftInput = z.input<typeof experimentDraftSchema>;

export const resultsSchema = z.array(
  z.object({
    id: uuid,
    sample: z.coerce.number().min(0, "No puede ser negativo.").nullable().optional(),
    conversions: z.coerce.number().min(0, "No puede ser negativo.").nullable().optional(),
    metric_value: z.coerce.number().nullable().optional(),
    notes: optionalText,
  }),
);

export const transitionSchema = z.object({
  experimentId: uuid,
  programId: uuid,
  to: z.enum(EXPERIMENT_STATUSES),
  justification: z.string().trim().max(2000).optional(),
  force: z.boolean().optional(),
});

export const decideSchema = z.object({
  experimentId: uuid,
  programId: uuid,
  verdict: z.enum(VERDICTS, { message: "Elige el veredicto." }),
  decision: z.enum(DECISIONS, { message: "Elige la decisión." }),
  rationale: z.string().trim().max(4000).optional(),
  learning: z.string().trim().min(10, "El aprendizaje es obligatorio (al menos 10 caracteres).").max(4000),
  appliesTo: z.array(uuid).default([]),
  suggestedHypothesis: z.string().trim().max(1000).optional(),
});

export type DecideInput = z.input<typeof decideSchema>;
