import { z } from "zod";
import { IDEA_TITLE_MAX, IDEA_TITLE_MIN, SESSION_TITLE_MAX, SESSION_TITLE_MIN } from "@/domain/ideas";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** El aguacero: el reto es lo único obligatorio. */
export const ideaSessionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(SESSION_TITLE_MIN, "Escriba el reto como una pregunta (mínimo 5 letras).")
    .max(SESSION_TITLE_MAX, `Un reto, no una tesis: máximo ${SESSION_TITLE_MAX} caracteres.`),
  context: optionalText(2000),
  line_hint: optionalText(80),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.")
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});
export type IdeaSessionInput = z.input<typeof ideaSessionSchema>;

/** Una idea: una frase, en cinco segundos. */
export const ideaSchema = z.object({
  title: z
    .string()
    .trim()
    .min(IDEA_TITLE_MIN, "Cuéntela en una frase (mínimo 3 letras).")
    .max(IDEA_TITLE_MAX, `Una idea, no un plan de negocios: máximo ${IDEA_TITLE_MAX} caracteres.`),
  detail: optionalText(2000),
  anonymous: z.boolean().default(false),
});
export type IdeaInput = z.input<typeof ideaSchema>;

const oneToFive = z.number().int().min(1, "El puntaje va de 1 a 5.").max(5, "El puntaje va de 1 a 5.");

export const ideaScoreSchema = z
  .object({ impact: oneToFive.optional(), ease: oneToFive.optional(), favorite: z.boolean().optional() })
  .refine((v) => v.impact != null || v.ease != null || v.favorite != null, "Elija un puntaje.");
export type IdeaScoreInput = z.input<typeof ideaScoreSchema>;

export const ideaDecisionSchema = z.object({
  decision: z.enum(["project", "pilot", "insight", "buried"]).nullable(),
  note: optionalText(500),
});
export type IdeaDecisionInput = z.input<typeof ideaDecisionSchema>;
