import "server-only";
// Extracción de datos de plataformas con la API de Claude y servidores MCP
// remotos. APAGADO hasta PILOTS_MCP_ENABLED=true. Solo lectura: lista blanca de
// herramientas, temperatura 0, JSON con esquema fijo validado con zod (hasta 2
// reintentos) y snapshot de cada extracción con la respuesta cruda.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMcpRequest,
  EXTRACTION_METRICS,
  extractionPrompt,
  extractionSystem,
  MAX_EXTRACTION_RETRIES,
  MCP_BETA_HEADER,
  readMcpReply,
  retryPrompt,
  validateExtraction,
  type Extraction,
  type IntegrationProvider,
} from "@/domain/pilots/integrations";

const API_URL = "https://api.anthropic.com/v1/messages";

/** URL del servidor MCP remoto de cada plataforma (configurable por variable de entorno). */
const SERVER_URL: Record<IntegrationProvider, string | undefined> = {
  meta: process.env.META_MCP_URL || "https://mcp.facebook.com/ads",
  google_ads: process.env.GOOGLE_ADS_MCP_URL,
  ga4: process.env.GA4_MCP_URL,
  tiktok: process.env.TIKTOK_MCP_URL,
  gtm: process.env.GTM_MCP_URL,
};

export function mcpEnabled(): boolean {
  return process.env.PILOTS_MCP_ENABLED === "true" && !!process.env.ANTHROPIC_API_KEY;
}

export function mcpModel(): string {
  return process.env.PILOTS_MCP_MODEL || process.env.TIA_MODEL || "claude-sonnet-5";
}

export function providerReady(provider: IntegrationProvider): boolean {
  return mcpEnabled() && !!SERVER_URL[provider];
}

interface CallResult {
  text: string;
  raw: unknown;
  toolResults: unknown[];
  writeAttempts: string[];
  inputTokens: number;
  outputTokens: number;
}

async function callClaude(body: object): Promise<CallResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Falta ANTHROPIC_API_KEY en el servidor.");
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": MCP_BETA_HEADER,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`La API de Claude respondió ${res.status}.`);
  const json = (await res.json()) as { content?: { type: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  const parts = readMcpReply(json.content as Parameters<typeof readMcpReply>[0]);
  return {
    text: parts.text,
    raw: { tool_calls: parts.toolCalls, tool_results: parts.toolResults },
    toolResults: parts.toolResults,
    writeAttempts: parts.writeAttempts,
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
  };
}

export interface ExtractionRequest {
  pilotId: string;
  connectionId: string;
  provider: IntegrationProvider;
  account: string;
  campaigns: string[];
  dateFrom: string;
  dateTo: string;
  metrics?: string[];
  userId?: string | null;
}

export interface ExtractionOutcome {
  snapshotId: string | null;
  status: "ok" | "invalid" | "error";
  data: Extraction | null;
  error: string | null;
}

/**
 * Hace una extracción y guarda su snapshot. `admin` es el cliente con secret key:
 * lee el token desde Vault (función solo para service_role) y escribe el snapshot.
 * No escribe datos del piloto: eso lo decide quien llama, con el snapshot como origen.
 */
export async function extractWithMcp(admin: SupabaseClient, req: ExtractionRequest): Promise<ExtractionOutcome> {
  const url = SERVER_URL[req.provider];
  const metrics = req.metrics ?? Object.keys(EXTRACTION_METRICS);
  const query = { provider: req.provider, account: req.account, campaigns: req.campaigns, date_from: req.dateFrom, date_to: req.dateTo, metrics };
  const save = async (row: Record<string, unknown>) => {
    const { data } = await admin
      .from("pilot_snapshots")
      .insert({
        pilot_id: req.pilotId,
        connection_id: req.connectionId,
        source: req.provider,
        account_ref: req.account,
        date_from: req.dateFrom,
        date_to: req.dateTo,
        query,
        model: mcpModel(),
        created_by: req.userId ?? null,
        ...row,
      })
      .select("id")
      .single();
    return (data?.id as string | undefined) ?? null;
  };

  if (!providerReady(req.provider) || !url) {
    return { snapshotId: null, status: "error", data: null, error: "La integración está apagada o sin configurar: el piloto sigue en modo manual." };
  }
  const { data: token, error: tokenError } = await admin.rpc("get_integration_token", { p_connection: req.connectionId });
  if (tokenError || !token) {
    const error = "La conexión no tiene token válido. Vuelva a conectarla; mientras tanto, cargue los datos a mano.";
    await admin.from("pilot_integration_connections").update({ status: "error", last_error: error }).eq("id", req.connectionId);
    return { snapshotId: await save({ status: "error", error }), status: "error", data: null, error };
  }

  const base = buildMcpRequest({
    model: mcpModel(),
    server: { provider: req.provider, url, token: token as string },
    system: extractionSystem(),
    prompt: extractionPrompt({ account: req.account, campaigns: req.campaigns, dateFrom: req.dateFrom, dateTo: req.dateTo, metrics }),
  });

  let messages = [...base.messages] as { role: "user" | "assistant"; content: string }[];
  let inputTokens = 0;
  let outputTokens = 0;
  const raws: unknown[] = [];
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_EXTRACTION_RETRIES + 1; attempt++) {
    try {
      const r = await callClaude({ ...base, messages });
      inputTokens += r.inputTokens;
      outputTokens += r.outputTokens;
      raws.push(r.raw);
      if (r.writeAttempts.length) {
        lastError = `Se bloqueó un intento de usar herramientas de escritura (${r.writeAttempts.join(", ")}).`;
        break;
      }
      const v = validateExtraction(r.text);
      if (v.ok) {
        const snapshotId = await save({ status: "ok", attempts: attempt, raw_tool_result: raws, validated: v.data, input_tokens: inputTokens, output_tokens: outputTokens });
        await admin.from("pilot_integration_connections").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("id", req.connectionId);
        return { snapshotId, status: "ok", data: v.data, error: null };
      }
      lastError = v.error;
      messages = [...messages, { role: "assistant", content: r.text || "(vacío)" }, { role: "user", content: retryPrompt(v.error) }];
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Error desconocido";
      break;
    }
  }
  const status = raws.length ? "invalid" : "error";
  const snapshotId = await save({ status, attempts: raws.length || 1, raw_tool_result: raws, error: lastError, input_tokens: inputTokens, output_tokens: outputTokens });
  await admin.from("pilot_integration_connections").update({ last_error: lastError }).eq("id", req.connectionId);
  return { snapshotId, status, data: null, error: lastError };
}
