import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseScoringConfig } from "@/domain/scoring";
import { TIA_LINES, tiaSystem, unverifiedNote, unverifiedNumbers } from "@/domain/tia";
import {
  buildChatMessages,
  CHAT_HISTORY_BUDGET,
  CHAT_HISTORY_FETCH,
  CHAT_MAX_TOKENS,
  CHAT_MESSAGE_MAX,
  CHAT_STORED_MAX,
  CHAT_STREAM_ERROR,
  CHAT_TASK,
  type ChatTurn,
} from "@/domain/tia-chat";
import { createClient } from "@/lib/supabase/server";
import { getActionActor, type ProgramContext, type ProgramSummary } from "@/server/auth";
import { streamTia, TiaError, type TiaUsage } from "@/server/tia/client";
import { programContextForTia } from "@/server/tia/context";
import { ensureTiaAvailable, recordTiaUsage } from "@/server/tia/run";

// "Pregúntele a la Tía": POST { programId, message } → texto plano en streaming.
// Errores antes de empezar: JSON { error } con su status. Errores a mitad del
// streaming: CHAT_STREAM_ERROR + mensaje, y se cierra.
export const maxDuration = 120;

const bodySchema = z.object({
  programId: z.string().uuid(),
  message: z.string().trim().min(1, "Escriba su pregunta.").max(CHAT_MESSAGE_MAX, `Máximo ${CHAT_MESSAGE_MAX} caracteres.`),
});

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

function statusFor(e: TiaError): number {
  switch (e.kind) {
    case "not_configured":
    case "overloaded":
      return 503;
    case "rate_limited":
      return 429;
    case "bad_request":
      return 400;
    default:
      return 502;
  }
}

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("La pregunta no llegó bien. Intente de nuevo.", 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Pregunta inválida.", 400);
  const { programId, message } = parsed.data;
  const askedAt = new Date().toISOString();

  // Sesión y pertenencia al programa, sin redirecciones (esto es una API).
  const access = await getActionActor(programId);
  if (!access) return jsonError("Su sesión venció o no tiene acceso a este programa.", 403);
  const supabase = await createClient();
  const { data: program } = await supabase
    .from("programs")
    .select("id, name, description, is_demo, start_date, end_date, setup_step, setup_completed_at, scoring_config")
    .eq("id", programId)
    .maybeSingle();
  if (!program) return jsonError("No encontramos ese programa o no tiene acceso.", 404);
  const ctx: ProgramContext = {
    user: access.user,
    program: { ...program, scoring_config: parseScoringConfig(program.scoring_config) } as ProgramSummary,
    role: access.actor.role,
    actor: access.actor,
  };

  const available = await ensureTiaAvailable();
  if (!available.ok) return jsonError(available.error, available.error === TIA_LINES.quotaExceeded ? 429 : 503);

  // Historial propio (RLS). Si la tabla aún no existe, se conversa sin memoria.
  let history: ChatTurn[] = [];
  let canStore = true;
  const { data: rows, error: historyError } = await supabase
    .from("tia_messages")
    .select("role, content")
    .eq("program_id", programId)
    .eq("user_id", access.user.id)
    .order("created_at", { ascending: false })
    .limit(CHAT_HISTORY_FETCH);
  if (historyError) {
    canStore = historyError.code !== "PGRST205";
    if (canStore) console.error("[tia-chat] no se pudo leer el historial", historyError.code);
  } else {
    history = ((rows ?? []) as ChatTurn[]).reverse();
  }

  let system: string;
  let context: unknown;
  try {
    context = await programContextForTia(ctx);
    system = tiaSystem(CHAT_TASK, context);
  } catch (e) {
    console.error("[tia-chat] no se pudo armar el contexto", e instanceof Error ? e.message : e);
    return jsonError("La Tía no pudo leer los datos del programa. Intente de nuevo en un momentico.", 500);
  }

  const events = streamTia({ system, messages: buildChatMessages(history, message, CHAT_HISTORY_BUDGET), maxTokens: CHAT_MAX_TOKENS });

  // Se espera el primer evento para poder responder con un status de error real.
  let first: Awaited<ReturnType<typeof events.next>>;
  try {
    first = await events.next();
  } catch (e) {
    if (e instanceof TiaError) return jsonError(e.message, statusFor(e));
    console.error("[tia-chat] error inesperado", e instanceof Error ? e.message : e);
    return jsonError("La Tía no pudo responder. Intente de nuevo en un momentico.", 502);
  }

  const encoder = new TextEncoder();
  let answer = "";
  let usage: TiaUsage | null = null;
  let resolveFinished!: () => void;
  const finished = new Promise<void>((r) => (resolveFinished = r));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let step = first;
        while (!step.done) {
          const ev = step.value;
          if (ev.type === "text") {
            answer += ev.text;
            controller.enqueue(encoder.encode(ev.text.replaceAll(CHAT_STREAM_ERROR, "")));
          } else {
            usage = ev.usage;
          }
          step = await events.next();
        }
        if (!answer.trim()) controller.enqueue(encoder.encode(`${CHAT_STREAM_ERROR}La Tía se quedó callada. Intente de nuevo.`));
        else {
          // Cifras citadas como hechos que no están en los datos: se avisa al final.
          const note = unverifiedNote(unverifiedNumbers(answer, context));
          if (note) {
            answer += `\n\n${note}`;
            controller.enqueue(encoder.encode(`\n\n${note}`));
          }
        }
      } catch (e) {
        const msg = e instanceof TiaError ? e.message : "La Tía no pudo terminar. Intente de nuevo.";
        if (!(e instanceof TiaError)) console.error("[tia-chat] error en el streaming", e instanceof Error ? e.message : e);
        try {
          controller.enqueue(encoder.encode(`${CHAT_STREAM_ERROR}${msg}`));
        } catch {
          // La persona cerró la conexión.
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Ya estaba cerrado o cancelado.
        }
        resolveFinished();
      }
    },
    cancel() {
      // La persona cerró el chat o canceló: no se guarda nada a medias.
      void events.return(undefined).catch(() => {});
      resolveFinished();
    },
  });

  // Guardar la conversación y el consumo cuando termine la respuesta.
  after(async () => {
    await finished;
    const done = usage as TiaUsage | null;
    if (!done) return;
    await recordTiaUsage(programId, "chat", done);
    const reply = answer.trim().slice(0, CHAT_STORED_MAX);
    if (!canStore || !reply) return;
    const db = await createClient();
    const { error } = await db.from("tia_messages").insert([
      { program_id: programId, role: "user", content: message, created_at: askedAt },
      { program_id: programId, role: "assistant", content: reply, created_at: new Date().toISOString() },
    ]);
    if (error && error.code !== "PGRST205") console.error("[tia-chat] no se pudo guardar la conversación", error.code);
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-accel-buffering": "no",
    },
  });
}
