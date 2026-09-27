// Eventos sugeridos para la lista de chequeo de medición, según los medios del
// piloto. Es un punto de partida: el equipo confirma cuáles aplican.
import type { ChecklistPlatform } from "./types";

export interface ChecklistSuggestion {
  platform: ChecklistPlatform;
  event_name: string;
  description: string;
}

const META = /\b(meta|facebook|instagram|whatsapp|messenger|ctwa)\b/i;
const GOOGLE = /\b(google|ga4|youtube|search|display|pmax|performance max|dv360|discovery|demand gen)\b/i;

const META_EVENTS: ChecklistSuggestion[] = [
  { platform: "pixel", event_name: "Lead", description: "El píxel dispara Lead al enviar el formulario o iniciar el contacto." },
  { platform: "capi", event_name: "Lead", description: "La API de conversiones manda el mismo Lead (deduplicado con el píxel)." },
  { platform: "pixel", event_name: "Purchase", description: "El píxel dispara Purchase con el valor de la venta." },
  { platform: "capi", event_name: "Purchase", description: "La API de conversiones manda la venta desde el servidor o el CRM." },
  {
    platform: "other",
    event_name: "Conversación iniciada",
    description: "Meta cuenta las conversaciones de WhatsApp o Messenger; revise que aparezcan en el Administrador de anuncios.",
  },
];

const GOOGLE_EVENTS: ChecklistSuggestion[] = [
  { platform: "ga4", event_name: "generate_lead", description: "GA4 registra el lead y está marcado como evento clave." },
  { platform: "ga4", event_name: "purchase", description: "GA4 registra la compra con valor y moneda (COP)." },
];

const GTM_CHECK: ChecklistSuggestion = {
  platform: "gtm",
  event_name: "Etiquetas del piloto publicadas",
  description: "En la vista previa de GTM, las etiquetas del piloto disparan en las páginas y los pasos correctos.",
};

const key = (s: Pick<ChecklistSuggestion, "platform" | "event_name">) =>
  `${s.platform}:${s.event_name.trim().toLocaleLowerCase("es-CO").normalize("NFD").replace(/\p{M}/gu, "")}`;

/**
 * Sugerencias para los medios dados (nombre y proveedor), sin repetir lo que ya
 * está en la lista. Siempre incluye la revisión de GTM.
 */
export function suggestChecklist(
  media: { name: string; provider?: string | null }[],
  existing: Pick<ChecklistSuggestion, "platform" | "event_name">[] = [],
): ChecklistSuggestion[] {
  const text = media.map((m) => `${m.name} ${m.provider ?? ""}`);
  const out: ChecklistSuggestion[] = [];
  if (text.some((t) => META.test(t))) out.push(...META_EVENTS);
  if (text.some((t) => GOOGLE.test(t))) out.push(...GOOGLE_EVENTS);
  out.push(GTM_CHECK);
  const seen = new Set(existing.map(key));
  return out.filter((s) => {
    const k = key(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
