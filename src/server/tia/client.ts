import "server-only";

// Cliente mínimo de la API de Claude (Messages API) para La Tía, con fetch: sin
// dependencias nuevas. La llave vive solo en ANTHROPIC_API_KEY (servidor).

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
/** Modelo para opinar e interpretar (TIA_MODEL). */
export const DEFAULT_TIA_MODEL = "claude-sonnet-5-5";
/** Modelo barato para entender mensajes y respuestas cortas (TIA_MODEL_FAST). */
export const DEFAULT_TIA_FAST_MODEL = "claude-haiku-4-5-20251001";

export interface TiaMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TiaRequest {
  system: string;
  messages: TiaMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Modelo de esta llamada (por defecto, tiaModel()). */
  model?: string;
  /** Marca el sistema como cacheable: si se repite igual, Claude lo cobra al 10 %. */
  cacheSystem?: boolean;
  /**
   * Esfuerzo en los modelos Claude 5: "low" no piensa por dentro antes de responder
   * (por defecto gasta cientos de tokens de salida pensando). Se ignora en los demás.
   */
  effort?: "low" | "medium" | "high";
}

export interface TiaUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface TiaReply {
  text: string;
  usage: TiaUsage;
  /** "end_turn" o "max_tokens" (se cortó). */
  stopReason?: string;
}

export class TiaError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "rate_limited" | "overloaded" | "bad_request" | "network" | "unknown",
  ) {
    super(message);
  }
}

export function tiaConfigured(): boolean {
  return process.env.NEXT_PUBLIC_TIA_ENABLED === "true" && !!process.env.ANTHROPIC_API_KEY;
}

export function tiaModel(): string {
  return process.env.TIA_MODEL || DEFAULT_TIA_MODEL;
}

export function tiaFastModel(): string {
  return process.env.TIA_MODEL_FAST || DEFAULT_TIA_FAST_MODEL;
}

function headers() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new TiaError("La Tía todavía no está conectada: falta la llave de Claude en el servidor.", "not_configured");
  return {
    "content-type": "application/json",
    "x-api-key": key,
    "anthropic-version": API_VERSION,
  };
}

/** Los modelos Claude 5 ya no aceptan `temperature` (la API responde 400). */
export function supportsTemperature(model: string): boolean {
  return !/^claude-[a-z]+-5\b/.test(model);
}

function body(req: TiaRequest, stream: boolean) {
  const model = req.model ?? tiaModel();
  return JSON.stringify({
    model,
    max_tokens: req.maxTokens ?? 1200,
    ...(supportsTemperature(model) ? { temperature: req.temperature ?? 0.4 } : req.effort ? { output_config: { effort: req.effort } } : {}),
    system: req.cacheSystem ? [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }] : req.system,
    messages: req.messages,
    stream,
  });
}

function errorFor(status: number): TiaError {
  if (status === 429) return new TiaError("La Tía está atendiendo mucha gente. Intente de nuevo en un minuto.", "rate_limited");
  if (status === 529 || status === 503) return new TiaError("La Tía está ocupada en este momento. Intente de nuevo en un ratico.", "overloaded");
  if (status === 400) return new TiaError("La Tía no entendió la pregunta. Pruebe decirla de otra forma.", "bad_request");
  if (status === 401 || status === 403) return new TiaError("La llave de Claude no es válida. Avísele a un admin.", "not_configured");
  return new TiaError("La Tía no pudo responder. Intente de nuevo.", "unknown");
}

/** Pregunta y espera la respuesta completa. */
export async function askTia(req: TiaRequest): Promise<TiaReply> {
  let res: Response;
  try {
    res = await fetch(API_URL, { method: "POST", headers: headers(), body: body(req, false), signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    if (e instanceof TiaError) throw e;
    throw new TiaError("No hubo conexión con La Tía. Revise su internet e intente de nuevo.", "network");
  }
  if (!res.ok) {
    // El cuerpo de error de la API trae el motivo (nunca la llave ni el prompt).
    const detail = await res.text().catch(() => "");
    console.error("[tia] Claude respondió", res.status, detail.slice(0, 300));
    throw errorFor(res.status);
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    model?: string;
    stop_reason?: string;
  };
  const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  return {
    text,
    stopReason: data.stop_reason,
    usage: {
      model: data.model ?? req.model ?? tiaModel(),
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      cacheReadTokens: data.usage?.cache_read_input_tokens ?? 0,
      cacheWriteTokens: data.usage?.cache_creation_input_tokens ?? 0,
    },
  };
}

/**
 * Pregunta con streaming: entrega el texto a medida que llega y, al final, el
 * consumo. Pensado para el chat "Pregúntele a la Tía".
 */
export async function* streamTia(req: TiaRequest): AsyncGenerator<{ type: "text"; text: string } | { type: "done"; usage: TiaUsage }> {
  let res: Response;
  try {
    res = await fetch(API_URL, { method: "POST", headers: headers(), body: body(req, true), signal: AbortSignal.timeout(120_000) });
  } catch (e) {
    if (e instanceof TiaError) throw e;
    throw new TiaError("No hubo conexión con La Tía. Revise su internet e intente de nuevo.", "network");
  }
  if (!res.ok || !res.body) throw errorFor(res.status);

  const usage: TiaUsage = { model: tiaModel(), inputTokens: 0, outputTokens: 0 };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      let event: {
        type?: string;
        delta?: { type?: string; text?: string };
        message?: { model?: string; usage?: { input_tokens?: number; output_tokens?: number } };
        usage?: { output_tokens?: number };
        error?: { type?: string };
      };
      try {
        event = JSON.parse(dataLine.slice(5).trim());
      } catch {
        continue;
      }
      if (event.type === "message_start") {
        usage.model = event.message?.model ?? usage.model;
        usage.inputTokens = event.message?.usage?.input_tokens ?? 0;
        usage.outputTokens = event.message?.usage?.output_tokens ?? 0;
      } else if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
        yield { type: "text", text: event.delta.text };
      } else if (event.type === "message_delta" && event.usage?.output_tokens != null) {
        usage.outputTokens = event.usage.output_tokens;
      } else if (event.type === "error") {
        throw event.error?.type === "overloaded_error" ? errorFor(529) : errorFor(500);
      }
    }
  }
  yield { type: "done", usage };
}
