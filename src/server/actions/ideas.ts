"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { decisionLine, rainLine, type IdeaPhase } from "@/domain/ideas";
import { fail, failFrom, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import {
  ideaDecisionSchema,
  ideaSchema,
  ideaScoreSchema,
  ideaSessionSchema,
  type IdeaDecisionInput,
  type IdeaInput,
  type IdeaScoreInput,
  type IdeaSessionInput,
} from "@/lib/validation/ideas";
import { getSessionUser } from "@/server/auth";

const uuid = z.string().uuid();
const NO_SESSION = "Su sesión se venció. Vuelva a entrar y seguimos con el aguacero.";

function refresh() {
  revalidatePath("/ideas", "layout");
}

export async function createIdeaSession(input: IdeaSessionInput): Promise<ActionResult<{ id: string }>> {
  if (!(await getSessionUser())) return fail(NO_SESSION);
  const parsed = ideaSessionSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("idea_sessions").insert(parsed.data).select("id").single();
  if (error) return failFrom(error);
  refresh();
  return ok({ id: data.id as string }, "¡Se nubló! El aguacero está armado: que llueva.");
}

export async function updateIdeaSession(id: string, input: IdeaSessionInput): Promise<ActionResult> {
  if (!(await getSessionUser())) return fail(NO_SESSION);
  if (!uuid.safeParse(id).success) return fail("Aguacero inválido.");
  const parsed = ideaSessionSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("idea_sessions").update(parsed.data).eq("id", id).select("id");
  if (error) return failFrom(error);
  if (!data?.length) return fail("Solo quien armó el aguacero (o un admin) lo edita.");
  refresh();
  return ok(undefined, "Listo, quedó corregido.");
}

const PHASE_MSG: Record<IdeaPhase, string> = {
  open: "¡Volvió a llover! Ya se pueden anotar más ideas.",
  voting: "Escampó. A puntuar se dijo, y a ciegas.",
  closed: "Votación cerrada. El podio ya está a la vista.",
};

export async function setIdeaSessionPhase(id: string, phase: IdeaPhase): Promise<ActionResult> {
  if (!(await getSessionUser())) return fail(NO_SESSION);
  if (!uuid.safeParse(id).success) return fail("Aguacero inválido.");
  if (!["open", "voting", "closed"].includes(phase)) return fail("Fase inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_idea_session_phase", { p_session: id, p_phase: phase });
  if (error) return failFrom(error);
  refresh();
  return ok(undefined, PHASE_MSG[phase]);
}

export async function deleteIdeaSession(id: string): Promise<ActionResult> {
  if (!(await getSessionUser())) return fail(NO_SESSION);
  if (!uuid.safeParse(id).success) return fail("Aguacero inválido.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_idea_session", { p_session: id });
  if (error) return failFrom(error);
  refresh();
  return ok(undefined, "Aguacero borrado. Se lo llevó la quebrada.");
}

export async function addIdea(sessionId: string, input: IdeaInput): Promise<ActionResult<{ id: string }>> {
  if (!(await getSessionUser())) return fail(NO_SESSION);
  if (!uuid.safeParse(sessionId).success) return fail("Aguacero inválido.");
  const parsed = ideaSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ideas")
    .insert({ ...parsed.data, session_id: sessionId })
    .select("id")
    .single();
  if (error) {
    // La RLS no deja anotar si el aguacero ya no está abierto.
    if (error.code === "42501") return fail("Este aguacero ya escampó: ya no se anotan ideas. Pídale a quien lo armó que vuelva a abrirlo.");
    return failFrom(error);
  }
  refresh();
  return ok({ id: data.id as string }, rainLine(parsed.data.title));
}

export async function updateIdea(id: string, input: IdeaInput): Promise<ActionResult> {
  if (!(await getSessionUser())) return fail(NO_SESSION);
  if (!uuid.safeParse(id).success) return fail("Idea inválida.");
  const parsed = ideaSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("ideas").update(parsed.data).eq("id", id).select("id");
  if (error) return failFrom(error);
  if (!data?.length) return fail("Solo quien anotó la idea (o un admin) la corrige.");
  refresh();
  return ok(undefined, "Corregida. Quedó más bonita.");
}

export async function deleteIdea(id: string): Promise<ActionResult> {
  if (!(await getSessionUser())) return fail(NO_SESSION);
  if (!uuid.safeParse(id).success) return fail("Idea inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_idea", { p_idea: id });
  if (error) return failFrom(error);
  refresh();
  return ok(undefined, "Idea borrada. Ni el cementerio la alcanzó.");
}

/** Cada toque guarda solo lo que cambió (impacto, facilidad o «¡Esta!»). */
export async function scoreIdea(id: string, input: IdeaScoreInput): Promise<ActionResult> {
  if (!(await getSessionUser())) return fail(NO_SESSION);
  if (!uuid.safeParse(id).success) return fail("Idea inválida.");
  const parsed = ideaScoreSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("score_idea", {
    p_idea: id,
    p_impact: parsed.data.impact ?? null,
    p_ease: parsed.data.ease ?? null,
    p_favorite: parsed.data.favorite ?? null,
  });
  if (error) return failFrom(error);
  refresh();
  return ok(undefined);
}

/** Proyecto, piloto, insight (se crea en el carriel de una vez) o cementerio. `null` la revive. */
export async function decideIdea(id: string, input: IdeaDecisionInput): Promise<ActionResult<{ insightId: string | null }>> {
  if (!(await getSessionUser())) return fail(NO_SESSION);
  if (!uuid.safeParse(id).success) return fail("Idea inválida.");
  const parsed = ideaDecisionSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_idea", { p_idea: id, p_decision: parsed.data.decision, p_note: parsed.data.note });
  if (error) return failFrom(error);
  refresh();
  if (parsed.data.decision === "insight") revalidatePath("/insights");
  return ok({ insightId: (data as string | null) ?? null }, decisionLine(parsed.data.decision));
}

const linkSchema = z
  .object({ programId: uuid.optional(), pilotId: uuid.optional() })
  .refine((v) => [v.programId, v.pilotId].filter(Boolean).length === 1, "Elija un solo destino.");

/** Deja la idea vinculada al programa o al piloto que nació de ella. */
export async function linkIdea(id: string, target: { programId?: string; pilotId?: string }): Promise<ActionResult> {
  if (!(await getSessionUser())) return fail(NO_SESSION);
  if (!uuid.safeParse(id).success) return fail("Idea inválida.");
  const parsed = linkSchema.safeParse(target);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("link_idea", {
    p_idea: id,
    p_program: parsed.data.programId ?? null,
    p_pilot: parsed.data.pilotId ?? null,
  });
  if (error) return failFrom(error);
  refresh();
  return ok(undefined, "¡Llovió y cosechamos! La idea ya es trabajo.");
}
