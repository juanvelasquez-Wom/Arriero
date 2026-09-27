import { z } from "zod";
import { CUSTOM_LINE_KEY, QUICK_MAX_LINES } from "@/domain/quick-start";
import { CALENDAR_EVENT_TYPES, METRIC_BRANCHES, METRIC_DIRECTIONS } from "@/domain/types";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elija una fecha.");
const uuid = z.string().uuid();
const optionalNumber = z.number().finite().nullable().optional();

export const programStepSchema = z
  .object({
    name: z.string().trim().min(3, "Escriba un nombre de al menos 3 caracteres.").max(120),
    description: z.string().trim().max(1000).optional(),
    start_date: date,
    end_date: date,
  })
  .refine((p) => p.end_date > p.start_date, { path: ["end_date"], message: "El fin debe ser posterior al inicio." });
export type ProgramStepInput = z.input<typeof programStepSchema>;

export const calendarStepSchema = z.object({
  events: z
    .array(
      z
        .object({
          id: uuid.optional(),
          type: z.enum(CALENDAR_EVENT_TYPES),
          name: z.string().trim().min(2, "Póngale nombre al evento.").max(120),
          start_date: date,
          end_date: date,
        })
        .refine((e) => e.end_date >= e.start_date, { path: ["end_date"], message: "El fin debe ser posterior al inicio." }),
    )
    .max(40),
  removedIds: z.array(uuid).default([]),
});
export type CalendarStepInput = z.input<typeof calendarStepSchema>;

export const horizonsStepSchema = z.object({
  horizons: z
    .array(z.object({ id: uuid.optional(), name: z.string().trim().min(1).max(40), start_date: date, end_date: date }))
    .min(1, "Agregue al menos un horizonte.")
    .max(6),
});
export type HorizonsStepInput = z.input<typeof horizonsStepSchema>;

export const linesStepSchema = z.object({
  create: z.array(z.string().trim().min(2, "Escriba el nombre de la línea.").max(80)).max(12),
});

const metricDraft = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2, "Escriba el nombre de la métrica.").max(160),
  unit: z.string().trim().max(40).optional().nullable(),
  direction: z.enum(METRIC_DIRECTIONS),
  definition: z.string().trim().max(2000).optional().nullable(),
  baseline: optionalNumber,
});

export const northStarStepSchema = z.object({
  northStar: metricDraft,
  efficiency: metricDraft.nullable(),
  /** horizonId → meta */
  northTargets: z.record(z.string(), z.number().finite().nullable()),
  efficiencyTargets: z.record(z.string(), z.number().finite().nullable()),
});
export type NorthStarStepInput = z.input<typeof northStarStepSchema>;

export const treeStepSchema = z.object({
  metrics: z.array(metricDraft.extend({ branch: z.enum(METRIC_BRANCHES) })).max(40),
  removedIds: z.array(uuid).default([]),
});
export type TreeStepInput = z.input<typeof treeStepSchema>;

export const funnelStepSchema = z.object({
  stages: z
    .array(
      z.object({
        id: uuid,
        name: z.string().trim().min(2, "Póngale nombre a la etapa.").max(80),
        description: z.string().trim().max(600).optional().nullable(),
        /** Nombre de la métrica del árbol que la mide: se resuelve a id al guardar, porque puede ser nueva. */
        metricName: z.string().trim().max(160).nullable().optional(),
      }),
    )
    .max(12),
});
export type FunnelStepInput = z.input<typeof funnelStepSchema>;

/** Calendario y horizontes: se guardan juntos en un solo paso. */
export const scheduleStepSchema = z.object({
  calendar: calendarStepSchema,
  /** null: quien guarda no define horizontes (solo owner/admin), se dejan como están. */
  horizons: horizonsStepSchema.nullable(),
});
export type ScheduleStepInput = z.input<typeof scheduleStepSchema>;

/** "Configurar {línea}": métrica norte y eficiencia, árbol y embudo en una sola pantalla. */
export const lineStepSchema = z.object({
  north: northStarStepSchema,
  tree: treeStepSchema.refine((t) => t.metrics.length > 0, {
    path: ["metrics"],
    message: "Elija al menos una métrica de entrada: son las que los ejercicios pueden mover.",
  }),
  funnel: funnelStepSchema,
});
export type LineStepInput = z.input<typeof lineStepSchema>;

/** Arranque rápido: un solo formulario que arma programa, calendario, horizontes y una o más líneas. */
export const quickStartSchema = z.object({
  /** Vacío: se usa el nombre sugerido. */
  name: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v.length === 0 || v.length >= 3, "Escriba un nombre de al menos 3 caracteres (o déjelo vacío y usamos la sugerencia)."),
  lines: z
    .array(
      z
        .object({ templateKey: z.string().trim().min(1), lineName: z.string().trim().max(80).optional().nullable() })
        .refine((l) => l.templateKey !== CUSTOM_LINE_KEY || (l.lineName ?? "").trim().length >= 2, {
          path: ["lineName"],
          message: "Escriba el nombre de su línea de negocio.",
        }),
    )
    .min(1, "Elija al menos una línea de negocio.")
    .max(QUICK_MAX_LINES),
  startDate: date,
  months: z.union([z.literal(3), z.literal(6), z.literal(12)], { message: "Elija una duración de 3, 6 o 12 meses." }),
  useTelcoCalendar: z.boolean(),
});
export type QuickStartFormInput = z.input<typeof quickStartSchema>;
