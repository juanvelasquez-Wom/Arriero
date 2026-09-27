"use server";

import { z } from "zod";
import { fail, failFrom, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { CHAT_HISTORY_FETCH, type ChatTurn } from "@/domain/tia-chat";
import { getActionActor } from "@/server/auth";

const uuid = z.string().uuid();

function isMissingTable(error: { code?: string }) {
  return error.code === "PGRST205" || error.code === "42P01";
}

export interface TiaChatHistory {
  messages: (ChatTurn & { id: string; createdAt: string })[];
  /** false si la tabla del historial todavía no existe (la conversación no se guarda). */
  stored: boolean;
}

/** Últimos mensajes propios del chat en este programa (RLS: cada quien ve solo los suyos). */
export async function loadTiaChat(programId: string): Promise<ActionResult<TiaChatHistory>> {
  if (!uuid.safeParse(programId).success) return fail("Programa inválido.");
  const access = await getActionActor(programId);
  if (!access) return fail("Su sesión venció o no tiene acceso a este programa.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tia_messages")
    .select("id, role, content, created_at")
    .eq("program_id", programId)
    .eq("user_id", access.user.id)
    .order("created_at", { ascending: false })
    .limit(CHAT_HISTORY_FETCH);
  if (error) return isMissingTable(error) ? ok({ messages: [], stored: false }) : failFrom(error);
  const messages = (data ?? [])
    .map((m) => ({ id: m.id as string, role: m.role as ChatTurn["role"], content: m.content as string, createdAt: m.created_at as string }))
    .reverse();
  return ok({ messages, stored: true });
}

/** Borra la conversación propia con La Tía en este programa. */
export async function clearTiaChat(programId: string): Promise<ActionResult> {
  if (!uuid.safeParse(programId).success) return fail("Programa inválido.");
  const access = await getActionActor(programId);
  if (!access) return fail("Su sesión venció o no tiene acceso a este programa.");
  const supabase = await createClient();
  const { error } = await supabase.from("tia_messages").delete().eq("program_id", programId).eq("user_id", access.user.id);
  if (error) return isMissingTable(error) ? ok(undefined) : failFrom(error);
  return ok(undefined, "Conversación borrada.");
}
