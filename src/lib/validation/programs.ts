import { z } from "zod";
import { PROGRAM_ROLES } from "@/domain/types";

// Los esquemas de los pasos del asistente viven en ./setup.ts.

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Escriba un correo válido."),
  name: z.string().trim().max(120).optional(),
  role: z.enum(PROGRAM_ROLES),
});

export type InviteInput = z.input<typeof inviteSchema>;

export const scoringSchema = z.object({
  calendar_bonus: z.coerce.number().min(0, "No puede ser negativo.").max(5),
  shared_penalty: z.coerce.number().min(0, "Escriba la penalidad como número positivo.").max(10),
  external_penalty: z.coerce.number().min(0, "Escriba la penalidad como número positivo.").max(10),
});

export type ScoringInput = z.input<typeof scoringSchema>;
