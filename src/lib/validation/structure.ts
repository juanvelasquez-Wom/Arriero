import { z } from "zod";
import { isMonday } from "@/domain/dates";
import { parseDecimal } from "@/domain/metric-tree";
import { METRIC_BRANCHES, METRIC_DIRECTIONS, METRIC_TYPES } from "@/domain/types";

const uuid = z.string().uuid("Elija una opción.");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** Número opcional escrito a mano ("1.234,5" o "1234.5"); vacío = null. */
const optionalDecimal = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v, ctx) => {
    const n = parseDecimal(v);
    if (n != null && Number.isNaN(n)) {
      ctx.addIssue({ code: "custom", message: "Escriba un número (p. ej. 1234,5)." });
      return z.NEVER;
    }
    return n;
  });

const requiredDecimal = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const n = parseDecimal(v);
  if (n == null || Number.isNaN(n)) {
    ctx.addIssue({ code: "custom", message: n == null ? "Escriba el valor." : "Escriba un número (p. ej. 1234,5)." });
    return z.NEVER;
  }
  return n;
});

const optionalUuid = z
  .union([uuid, z.literal(""), z.literal("none"), z.null()])
  .optional()
  .transform((v) => (v && v !== "none" ? v : null));

const isoMonday = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Semana inválida.")
  .refine(isMonday, "La semana debe empezar en lunes.");

// -----------------------------------------------------------------------------
// Métricas
// -----------------------------------------------------------------------------

export const metricSchema = z
  .object({
    line_id: uuid,
    type: z.enum(METRIC_TYPES),
    branch: z
      .union([z.enum(METRIC_BRANCHES), z.literal(""), z.literal("none"), z.null()])
      .optional()
      .transform((v) => (v && v !== "none" ? v : null)),
    parent_id: optionalUuid,
    name: z.string().trim().min(2, "Escriba el nombre de la métrica.").max(160, "Máximo 160 caracteres."),
    definition: optionalText(2000),
    channel: optionalText(120),
    unit: optionalText(40),
    direction: z.enum(METRIC_DIRECTIONS),
    source: optionalText(300),
    baseline: optionalDecimal,
    owner_id: optionalUuid,
  })
  .superRefine((m, ctx) => {
    if (m.type === "input" && !m.branch) {
      ctx.addIssue({ code: "custom", path: ["branch"], message: "Elija la rama del árbol." });
    }
    if (m.type === "north_star" && m.parent_id) {
      ctx.addIssue({ code: "custom", path: ["parent_id"], message: "La métrica norte es la raíz: no tiene padre." });
    }
  })
  .transform((m) => ({
    ...m,
    // Solo las métricas de entrada pertenecen a una rama; la norte no tiene padre.
    branch: m.type === "input" ? m.branch : null,
    parent_id: m.type === "north_star" ? null : m.parent_id,
  }));

export type MetricInput = z.input<typeof metricSchema>;
export type MetricValues = z.output<typeof metricSchema>;

export const moveSchema = z.object({
  id: uuid,
  direction: z.enum(["up", "down"]),
});

export type MoveInput = z.input<typeof moveSchema>;

export const targetsSchema = z.object({
  metric_id: uuid,
  targets: z
    .array(z.object({ horizon_id: uuid, target: optionalDecimal }))
    .max(12),
});

export type TargetsInput = z.input<typeof targetsSchema>;

// -----------------------------------------------------------------------------
// Etapas del embudo
// -----------------------------------------------------------------------------

export const stageSchema = z.object({
  line_id: uuid,
  name: z.string().trim().min(2, "Escriba el nombre de la etapa.").max(80, "Máximo 80 caracteres."),
  description: optionalText(1000),
  metric_id: optionalUuid,
});

export type StageInput = z.input<typeof stageSchema>;
export type StageValues = z.output<typeof stageSchema>;

// -----------------------------------------------------------------------------
// Carga semanal
// -----------------------------------------------------------------------------

export const weeklyValuesSchema = z.object({
  week_start: isoMonday,
  rows: z
    .array(
      z.object({
        metric_id: uuid,
        value: requiredDecimal,
        note: optionalText(500),
      }),
    )
    .min(1, "No hay cambios para guardar.")
    .max(500, "Demasiadas filas en un solo guardado."),
});

export type WeeklyValuesInput = z.input<typeof weeklyValuesSchema>;
