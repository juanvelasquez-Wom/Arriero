/**
 * Repositorio de insights («El carriel de insights»): fuentes, estados, orden,
 * búsqueda, parecidos y cómo un insight se vuelve problema, programa o piloto.
 *
 * Buenas prácticas que sigue (atomic research):
 * - Una idea por insight, en una frase («me di cuenta de que…»).
 * - Siempre con su fuente: de dónde sale cambia cuánto se le cree.
 * - Evidencia opcional pero invitada, para no frenar la captura.
 * - Votos de otras personas («yo también lo he visto») en vez de una calificación a ojo.
 * - Se reutiliza: cada insight guarda lo que sembró y se puede buscar después.
 */
import { findSimilar, normalizeText } from "./similarity";

export type InsightSource = "data" | "customer" | "competition" | "team" | "market" | "hunch";
export type InsightStatus = "new" | "validated" | "planted" | "archived";
export type InsightStage = "acquisition" | "activation" | "conversion" | "retention";

export const INSIGHT_SOURCES: { key: InsightSource; label: string; hint: string }[] = [
  { key: "data", label: "Un dato", hint: "Lo vio en un tablero, un reporte o un Excel." },
  { key: "customer", label: "Un cliente", hint: "Lo dijo o lo hizo un cliente: chat, llamada, tienda." },
  { key: "competition", label: "La competencia", hint: "Lo está haciendo otro operador (y le está funcionando)." },
  { key: "team", label: "El equipo", hint: "Salió de ventas, servicio, la agencia o el comité." },
  { key: "market", label: "El mercado", hint: "Redes, noticias, tendencias o estudios." },
  { key: "hunch", label: "Una corazonada", hint: "Sin dato todavía. Vale, pero hay que probarla." },
];
export const SOURCE_LABEL: Record<InsightSource, string> = Object.fromEntries(INSIGHT_SOURCES.map((s) => [s.key, s.label])) as Record<
  InsightSource,
  string
>;

export const INSIGHT_STATUS_LABEL: Record<InsightStatus, string> = {
  new: "Recién cosechado",
  validated: "Validado",
  planted: "Sembrado",
  archived: "Archivado",
};

export const INSIGHT_STAGE_LABEL: Record<InsightStage, string> = {
  acquisition: "Adquisición",
  activation: "Activación",
  conversion: "Conversión",
  retention: "Recuperación y recurrencia",
};

export const TITLE_MIN = 5;
export const TITLE_MAX = 200;
export const MAX_TAGS = 8;

/** Ejemplos para el campo de captura: rotan para inspirar sin estorbar. */
export const INSIGHT_EXAMPLES = [
  "La gente pregunta el precio antes de saludar en WhatsApp.",
  "Los que recargan de noche compran paquetes más grandes.",
  "Portabilidad se cae cuando piden la foto de la cédula.",
  "La competencia regala el primer mes y los clientes lo mencionan en el chat.",
  "En quincena el costo por conversación baja casi a la mitad.",
];

/** Lo que dice la mula al guardar. Estable según el título. */
const SAVED_LINES = [
  "¡Anotado! La mula lo guardó en el carriel.",
  "Guardado. Eso no se lo lleva el viento.",
  "¡Eso! Un insight más y la competencia llorando.",
  "Quedó en el carriel. Ahora a ver quién lo siembra.",
];
export function savedLine(title: string): string {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SAVED_LINES[h % SAVED_LINES.length];
}

/** Etiquetas desde texto libre: separadas por coma o #, sin repetir, máximo 8. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,#\n]/)) {
    const t = raw.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 30);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

export interface InsightRow {
  id: string;
  title: string;
  detail: string | null;
  source: InsightSource;
  source_ref: string | null;
  line_hint: string | null;
  stage: InsightStage | null;
  channel: string | null;
  tags: string[];
  status: InsightStatus;
  program_id: string | null;
  problem_id: string | null;
  pilot_id: string | null;
  created_by: string;
  author_name: string;
  created_at: string;
  votes: number;
  voted_by_me: boolean;
}

/** «Qué tan caliente está»: votos de otras personas y frescura (se enfría en ~2 meses). */
export function heat(i: Pick<InsightRow, "votes" | "created_at" | "status">, now = Date.now()): number {
  const days = Math.max(0, (now - new Date(i.created_at).getTime()) / 86_400_000);
  const freshness = Math.max(0, 1 - days / 60);
  const status = i.status === "validated" ? 1.5 : i.status === "archived" ? -5 : 0;
  return i.votes * 3 + freshness * 4 + status;
}

export type InsightView = "todos" | "sin-sembrar" | "calientes" | "sembrados" | "mios" | "archivados";

export interface InsightFilters {
  view: InsightView;
  q?: string;
  source?: InsightSource | null;
  line?: string | null;
}

export function filterInsights(list: readonly InsightRow[], f: InsightFilters, meId: string, now = Date.now()): InsightRow[] {
  const q = f.q ? normalizeText(f.q) : "";
  const byView = (i: InsightRow) => {
    switch (f.view) {
      case "sin-sembrar":
        return i.status === "new" || i.status === "validated";
      case "calientes":
        return i.status !== "archived" && i.status !== "planted";
      case "sembrados":
        return i.status === "planted";
      case "mios":
        return i.created_by === meId;
      case "archivados":
        return i.status === "archived";
      default:
        return i.status !== "archived";
    }
  };
  const out = list.filter(
    (i) =>
      byView(i) &&
      (!f.source || i.source === f.source) &&
      (!f.line || normalizeText(i.line_hint ?? "") === normalizeText(f.line)) &&
      (!q || normalizeText([i.title, i.detail, i.channel, i.line_hint, i.tags.join(" "), i.author_name].filter(Boolean).join(" ")).includes(q)),
  );
  if (f.view === "calientes") return out.sort((a, b) => heat(b, now) - heat(a, now)).slice(0, 30);
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Los números de arriba del carriel. */
export function insightCounts(list: readonly InsightRow[], meId: string, now = Date.now()) {
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
  return {
    total: list.filter((i) => i.status !== "archived").length,
    fresh: list.filter((i) => i.created_at >= weekAgo).length,
    planted: list.filter((i) => i.status === "planted").length,
    mine: list.filter((i) => i.created_by === meId).length,
  };
}

/** Líneas mencionadas (para el filtro), de la más usada a la menos. */
export function lineHints(list: readonly InsightRow[]): string[] {
  const count = new Map<string, number>();
  for (const i of list) if (i.line_hint?.trim()) count.set(i.line_hint.trim(), (count.get(i.line_hint.trim()) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).map(([k]) => k);
}

/** Insights parecidos (para no repetir y para juntar evidencia). */
export function similarInsights(target: Pick<InsightRow, "id" | "title" | "detail">, list: readonly InsightRow[], limit = 3) {
  return findSimilar(
    `${target.title} ${target.detail ?? ""}`,
    list.filter((i) => i.id !== target.id),
    (i) => `${i.title} ${i.detail ?? ""}`,
    { limit },
  );
}

/** Borrador de problema desde un insight (se pasa por la URL de «Nuevo problema»). */
export function problemPrefillFromInsight(i: Pick<InsightRow, "title" | "detail" | "source" | "source_ref" | "author_name">) {
  const evidence = [
    i.detail?.trim(),
    `Fuente: ${SOURCE_LABEL[i.source].toLowerCase()}${i.source_ref ? ` (${i.source_ref})` : ""}. Insight de ${i.author_name}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { titulo: i.title.slice(0, 160), evidencia: evidence.slice(0, 1500) };
}

/** Qué se le puede ofrecer a la persona con un insight. */
export function insightActions(i: Pick<InsightRow, "status" | "created_by">, me: { id: string; isAdmin: boolean; canPilot: boolean }) {
  const owner = i.created_by === me.id || me.isAdmin;
  const active = i.status !== "archived";
  return {
    toProblem: active,
    toProgram: active && me.isAdmin,
    toPilot: active && me.canPilot,
    validate: owner && i.status === "new",
    archive: owner && i.status !== "archived" && i.status !== "planted",
    reopen: owner && i.status === "archived",
    edit: owner,
    remove: owner,
  };
}
