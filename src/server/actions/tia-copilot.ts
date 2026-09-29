"use server";

// La Tía copiloto: una conversación que arma proyectos y pilotos y recibe avances.
// El estado viaja con el navegador (no hay historial en la base: menos tokens y
// menos datos guardados); el servidor lo revisa en cada turno.
import { z } from "zod";
import { TIA_ENABLED } from "@/domain/tia";
import { emptyCopilotState, sanitizeState, type ChipAction } from "@/domain/tia-copilot";
import { copilotTurn as runTurn, openCopilot as runOpen, type CopilotReply } from "@/server/tia/copilot";

const path = z
  .string()
  .max(300)
  .refine((p) => p.startsWith("/") && !p.startsWith("//"), "Ruta inválida.");

const chipSchema = z.object({ t: z.enum(["set", "skip", "mode", "update", "commit", "edit", "reset", "advice", "summary", "brainstorm", "addIdea"]) }).passthrough();

const disabled: CopilotReply = { state: emptyCopilotState(), out: [{ text: "La Tía está apagada por ahora.", tone: "warn" }], spend: [] };

export async function openTiaCopilot(state: unknown, currentPath: string): Promise<CopilotReply> {
  if (!TIA_ENABLED) return disabled;
  const p = path.safeParse(currentPath);
  return runOpen(state, p.success ? p.data : "/");
}

export async function sendTiaCopilot(input: { state: unknown; message?: string; chip?: unknown; path: string }): Promise<CopilotReply> {
  if (!TIA_ENABLED) return disabled;
  const p = path.safeParse(input.path);
  const chip = input.chip == null ? undefined : chipSchema.safeParse(input.chip);
  if (chip && !chip.success) return { ...disabled, state: sanitizeState(input.state), out: [{ text: "Ese botón ya no sirve. Escríbame qué quiere hacer.", tone: "warn" }] };
  return runTurn({
    state: input.state,
    message: typeof input.message === "string" ? input.message.slice(0, 2000) : undefined,
    chip: chip?.data as ChipAction | undefined,
    path: p.success ? p.data : "/",
  });
}
