// Integraciones de Pilotos por MCP (Claude API + servidores MCP remotos).
// Aquí va lo que se puede probar sin red: proveedores, listas blancas de
// herramientas de SOLO LECTURA, armado de la petición, lectura de la respuesta
// y validación del JSON que devuelve Claude. Ver docs/pilotos/integraciones.md.
import { z } from "zod";

export const INTEGRATION_PROVIDERS = ["meta", "google_ads", "ga4", "tiktok", "gtm"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const PROVIDER_LABEL: Record<IntegrationProvider, string> = {
  meta: "Meta Ads",
  google_ads: "Google Ads",
  ga4: "Google Analytics 4",
  tiktok: "TikTok Ads",
  gtm: "Google Tag Manager",
};

/** Encabezado beta del conector MCP de la Messages API (verificado el 27 sep 2026). */
export const MCP_BETA_HEADER = "mcp-client-2025-11-20";

/**
 * Herramientas permitidas por proveedor: SOLO lectura. Todo lo demás queda
 * apagado (default_config.enabled = false). Nunca se agregan herramientas que
 * crean, editan, pausan, publican o borran.
 */
export const READ_ONLY_TOOLS: Record<IntegrationProvider, string[]> = {
  meta: [
    "ads_get_ad_accounts",
    "ads_get_ad_entities",
    "ads_insights_performance_trend",
    "ads_insights_anomaly_signal",
    "ads_get_dataset_stats",
    "ads_get_dataset_quality",
  ],
  google_ads: ["list_accessible_customers", "search", "get_resource_metadata"],
  ga4: ["get_account_summaries", "get_property_details", "run_report", "run_funnel_report", "get_custom_dimensions_and_metrics"],
  // Sin servidor remoto verificado todavía: queda desacoplado hasta que exista.
  tiktok: [],
  gtm: ["list_accounts", "list_containers", "list_workspaces", "list_tags", "list_triggers", "list_variables", "get_tag", "get_trigger"],
};

const WRITE_WORDS = /(^|_)(create|update|delete|remove|pause|activate|publish|upload|boost|edit|set|mutate|write)(_|$)/i;

/** ¿La herramienta parece de escritura? (defensa extra además de la lista blanca). */
export function isWriteTool(name: string): boolean {
  return WRITE_WORDS.test(name);
}

/** Lista blanca efectiva: descarta cualquier nombre que parezca de escritura. */
export function allowedTools(provider: IntegrationProvider): string[] {
  return READ_ONLY_TOOLS[provider].filter((t) => !isWriteTool(t));
}

export interface McpServerConfig {
  provider: IntegrationProvider;
  url: string;
  token: string;
}

/** Cuerpo de la petición a la Messages API con un servidor MCP y su lista blanca. */
export function buildMcpRequest(input: { model: string; server: McpServerConfig; system: string; prompt: string; maxTokens?: number }) {
  const name = input.server.provider;
  const tools = allowedTools(name);
  if (!tools.length) throw new Error(`No hay herramientas de lectura habilitadas para ${PROVIDER_LABEL[name]}.`);
  return {
    model: input.model,
    max_tokens: input.maxTokens ?? 4000,
    temperature: 0,
    system: input.system,
    messages: [{ role: "user" as const, content: input.prompt }],
    mcp_servers: [{ type: "url" as const, url: input.server.url, name, authorization_token: input.server.token }],
    tools: [
      {
        type: "mcp_toolset" as const,
        mcp_server_name: name,
        default_config: { enabled: false },
        configs: Object.fromEntries(tools.map((t) => [t, { enabled: true }])),
      },
    ],
  };
}

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  id?: string;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
}

export interface McpReplyParts {
  text: string;
  toolCalls: { id: string | null; name: string | null; input: unknown }[];
  toolResults: { tool_use_id: string | null; is_error: boolean; content: unknown }[];
  /** Herramientas de escritura que Claude intentó usar (no debería pasar nunca). */
  writeAttempts: string[];
}

/** Separa texto final, llamadas a herramientas y resultados crudos (para el snapshot). */
export function readMcpReply(content: ContentBlock[] | null | undefined): McpReplyParts {
  const out: McpReplyParts = { text: "", toolCalls: [], toolResults: [], writeAttempts: [] };
  for (const b of content ?? []) {
    if (b.type === "text" && b.text) out.text += b.text;
    else if (b.type === "mcp_tool_use") {
      out.toolCalls.push({ id: b.id ?? null, name: b.name ?? null, input: b.input ?? null });
      if (b.name && isWriteTool(b.name)) out.writeAttempts.push(b.name);
    } else if (b.type === "mcp_tool_result") {
      out.toolResults.push({ tool_use_id: b.tool_use_id ?? null, is_error: !!b.is_error, content: b.content ?? null });
    }
  }
  return out;
}

/** Quita cercas de código y texto alrededor del primer objeto JSON. */
export function cleanJsonText(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  return start >= 0 && end > start ? candidate.slice(start, end + 1) : null;
}

/** Esquema fijo de una extracción de métricas diarias o semanales. */
export const extractionSchema = z.object({
  account: z.string().min(1),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rows: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        /** Campaña, conjunto o anuncio tal como lo nombra la plataforma. */
        entity: z.string().min(1),
        /** Clave de métrica pedida (ver EXTRACTION_METRICS). */
        metric: z.string().min(1),
        value: z.number().finite().nonnegative(),
      }),
    )
    .max(20000),
  notes: z.string().max(2000).optional(),
});
export type Extraction = z.infer<typeof extractionSchema>;

/** Métricas que se piden a las plataformas y su métrica del catálogo de Arriero. */
export const EXTRACTION_METRICS: Record<string, string> = {
  spend: "Inversión",
  impressions: "Impresiones",
  clicks: "Clics",
  conversations_started: "Conversaciones iniciadas",
  landing_page_views: "Visitas a la landing",
};

export type ValidationResult = { ok: true; data: Extraction } | { ok: false; error: string };

/** Limpia y valida la respuesta de Claude contra el esquema fijo. */
export function validateExtraction(text: string): ValidationResult {
  const json = cleanJsonText(text);
  if (!json) return { ok: false, error: "La respuesta no trae un objeto JSON." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "El JSON de la respuesta no se pudo leer." };
  }
  const r = extractionSchema.safeParse(parsed);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 500) };
  return { ok: true, data: r.data };
}

/** Sistema de la extracción: solo JSON, sin inventar, solo herramientas de lectura. */
export function extractionSystem(): string {
  return `Usted extrae datos de reporte de una plataforma de publicidad para la app Arriero.
Reglas:
- Use SOLO herramientas de lectura. Nunca cree, edite, pause ni borre nada.
- No invente cifras: si un dato no está, no lo incluya.
- Responda ÚNICAMENTE con un objeto JSON, sin texto antes ni después, con esta forma:
{"account": string, "date_from": "AAAA-MM-DD", "date_to": "AAAA-MM-DD", "rows": [{"date": "AAAA-MM-DD", "entity": string, "metric": string, "value": number}], "notes": string opcional}
- "metric" debe ser una de: ${Object.keys(EXTRACTION_METRICS).join(", ")}. "value" en números (la inversión en la moneda de la cuenta, sin símbolos).`;
}

export function extractionPrompt(input: { account: string; campaigns: string[]; dateFrom: string; dateTo: string; metrics: string[] }): string {
  return `Cuenta: ${input.account}
Campañas: ${input.campaigns.length ? input.campaigns.join(" | ") : "todas"}
Rango: ${input.dateFrom} a ${input.dateTo}, por día.
Métricas: ${input.metrics.join(", ")}.`;
}

/** Mensaje para reintentar cuando el JSON no pasó la validación. */
export function retryPrompt(error: string): string {
  return `La respuesta anterior no cumplió el esquema (${error}). Responda de nuevo SOLO con el objeto JSON válido.`;
}

export const MAX_EXTRACTION_RETRIES = 2;
