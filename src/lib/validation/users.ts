import { z } from "zod";
import { PROGRAM_ROLES } from "@/domain/types";

export const createUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Escribe un correo válido."),
    name: z.string().trim().min(2, "Escribe el nombre.").max(120),
    isAdmin: z.boolean(),
    mode: z.enum(["email", "link"]),
    programId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
    role: z.enum(PROGRAM_ROLES).optional(),
  })
  .refine((v) => !v.programId || !!v.role, { path: ["role"], message: "Elige el rol en el programa." });

export type CreateUserInput = z.input<typeof createUserSchema>;
