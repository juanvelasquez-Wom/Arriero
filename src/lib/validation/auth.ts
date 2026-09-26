import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Escriba un correo válido."),
  password: z.string().min(1, "Escriba su contraseña."),
  next: z.string().optional(),
});

export const recoverSchema = z.object({
  email: z.string().trim().email("Escriba un correo válido."),
});

export const resetPasswordSchema = z
  .object({
    name: z.string().trim().max(120).optional(),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden." });

export type LoginInput = z.infer<typeof loginSchema>;
export type RecoverInput = z.infer<typeof recoverSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
