import { z } from "zod";
import { MAX_TAGS, TITLE_MAX, TITLE_MIN } from "@/domain/insights";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .optional()
    .transform((v) => (v ? v : null));

/** Lo mínimo para anotar un insight es la frase; lo demás es opcional para no frenar la captura. */
export const insightSchema = z.object({
  title: z
    .string()
    .trim()
    .min(TITLE_MIN, "Cuéntelo en una frase (mínimo 5 letras).")
    .max(TITLE_MAX, `Una frase, no un testamento: máximo ${TITLE_MAX} caracteres.`),
  detail: optionalText(4000),
  source: z.enum(["data", "customer", "competition", "team", "market", "hunch"]).default("data"),
  source_ref: optionalText(500),
  line_hint: optionalText(80),
  stage: z
    .enum(["acquisition", "activation", "conversion", "retention"])
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  channel: optionalText(80),
  tags: z.array(z.string().trim().min(1).max(30)).max(MAX_TAGS, `Máximo ${MAX_TAGS} etiquetas.`).default([]),
});

export type InsightInput = z.input<typeof insightSchema>;
