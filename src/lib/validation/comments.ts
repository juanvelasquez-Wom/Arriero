import { z } from "zod";

/** Comentario en la conversación de un ejercicio (1–4000 caracteres, igual que la base). */
export const commentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Escriba algo antes de enviar.")
    .max(4000, "El comentario es muy largo: máximo 4.000 caracteres."),
});

export type CommentInput = z.infer<typeof commentSchema>;
