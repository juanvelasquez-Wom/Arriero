import { z } from "zod";
import { CALENDAR_EVENT_TYPES, PROGRAM_ROLES } from "@/domain/types";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige una fecha.");

export const horizonSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, "Ponle nombre (p. ej. H1).").max(40),
    start_date: date,
    end_date: date,
  })
  .refine((h) => h.end_date >= h.start_date, { path: ["end_date"], message: "El fin debe ser posterior al inicio." });

export const programBasicsSchema = z
  .object({
    name: z.string().trim().min(3, "Escribe un nombre de al menos 3 caracteres.").max(120),
    description: z.string().trim().max(1000).optional(),
    start_date: date,
    end_date: date,
    horizons: z.array(horizonSchema).min(1, "Agrega al menos un horizonte.").max(6),
  })
  .refine((p) => p.end_date >= p.start_date, { path: ["end_date"], message: "El fin debe ser posterior al inicio." })
  .refine((p) => p.horizons.every((h) => h.start_date >= p.start_date && h.end_date <= p.end_date), {
    path: ["horizons"],
    message: "Los horizontes deben quedar dentro de las fechas del programa.",
  });

export type ProgramBasicsInput = z.input<typeof programBasicsSchema>;

export const lineSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre de la línea.").max(80),
});

export const calendarEventSchema = z
  .object({
    type: z.enum(CALENDAR_EVENT_TYPES),
    name: z.string().trim().min(2, "Ponle nombre al evento.").max(120),
    start_date: date,
    end_date: date,
  })
  .refine((e) => e.end_date >= e.start_date, { path: ["end_date"], message: "El fin debe ser posterior al inicio." });

export type CalendarEventInput = z.input<typeof calendarEventSchema>;

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Escribe un correo válido."),
  name: z.string().trim().max(120).optional(),
  role: z.enum(PROGRAM_ROLES),
});

export type InviteInput = z.input<typeof inviteSchema>;

export const scoringSchema = z.object({
  calendar_bonus: z.coerce.number().min(0, "No puede ser negativo.").max(5),
  shared_penalty: z.coerce.number().min(0, "Escribe la penalidad como número positivo.").max(10),
  external_penalty: z.coerce.number().min(0, "Escribe la penalidad como número positivo.").max(10),
});

export type ScoringInput = z.input<typeof scoringSchema>;
