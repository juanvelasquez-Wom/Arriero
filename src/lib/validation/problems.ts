import { z } from "zod";
import { CONTROL_LEVELS, IMPACT_LEVELS, PROBLEM_STATUSES } from "@/domain/types";

export const problemSchema = z.object({
  stage_id: z.string().uuid("Elige la etapa del embudo."),
  channel: z.string().trim().max(80).optional(),
  title: z.string().trim().min(5, "Describe el problema en al menos 5 caracteres.").max(240),
  evidence: z
    .string()
    .trim()
    .min(10, "La evidencia es obligatoria: un problema sin datos es una idea suelta.")
    .max(4000),
  root_cause: z.string().trim().max(2000).optional(),
  impact: z.enum(IMPACT_LEVELS),
  control: z.enum(CONTROL_LEVELS),
  status: z.enum(PROBLEM_STATUSES),
});

export type ProblemInput = z.input<typeof problemSchema>;

export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const ATTACHMENT_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/gif": "GIF",
  "image/webp": "WEBP",
  "text/csv": "CSV",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
};
export const ATTACHMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.csv,.xlsx";

/** Algunos navegadores no informan el tipo del CSV; se deduce por extensión. */
export function resolveMime(file: { name: string; type: string }): string {
  if (file.type && ATTACHMENT_TYPES[file.type]) return file.type;
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "csv") return "text/csv";
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return file.type;
}

export function validateAttachment(file: { name: string; type: string; size: number }): string | null {
  const mime = resolveMime(file);
  if (!ATTACHMENT_TYPES[mime]) return `“${file.name}”: solo se aceptan PDF, imágenes, CSV y XLSX.`;
  if (file.size > ATTACHMENT_MAX_BYTES) return `“${file.name}” supera el máximo de 20 MB.`;
  if (file.size === 0) return `“${file.name}” está vacío.`;
  return null;
}

export const attachmentSchema = z.object({
  entity_type: z.enum(["problem", "experiment"]),
  entity_id: z.string().uuid(),
  storage_path: z.string().min(10).max(600),
  name: z.string().min(1).max(255),
  mime_type: z.string().refine((m) => !!ATTACHMENT_TYPES[m], "Tipo de archivo no permitido."),
  size_bytes: z.number().int().positive().max(ATTACHMENT_MAX_BYTES, "Máximo 20 MB."),
});
