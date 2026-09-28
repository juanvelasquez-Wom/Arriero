// Búsqueda de aprendizajes parecidos en la biblioteca unificada (ejercicios y
// pilotos). Palabras normalizadas (sin tildes ni mayúsculas, con raíz corta) y
// sinónimos del mundo telco, para que "CTWA" encuentre "WhatsApp" y "postpago"
// encuentre "pospago". Funciones puras.
import { jaccard, normalizeText, tokenize, type SimilarMatch } from "./similarity";

/**
 * Grupos de sinónimos: el primero de cada grupo es la forma canónica. Se escriben
 * ya normalizados (minúsculas, sin tildes). Admiten frases de varias palabras.
 */
export const TELCO_SYNONYMS: readonly (readonly string[])[] = [
  ["whatsapp", "ctwa", "wa", "wpp", "wasap", "guasap", "click to whatsapp", "clic a whatsapp", "click a whatsapp"],
  ["pospago", "postpago", "pos pago", "post pago"],
  ["portabilidad", "porta", "portas", "portar", "portacion", "portaciones"],
  ["recarga", "recargas", "paquete", "paquetes", "paquetico", "paqueticos"],
  ["landing", "landings", "landing page", "pagina de aterrizaje"],
  ["conversion", "cvr", "tasa de conversion"],
  ["cpa", "costo por adquisicion", "costo por venta"],
  ["cpl", "costo por lead", "costo por conversacion", "cpconv"],
  ["equipo", "equipos", "celular", "celulares", "smartphone", "smartphones", "terminal", "terminales"],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Las variantes más largas primero, para que "click to whatsapp" gane sobre "whatsapp".
const REPLACEMENTS: { re: RegExp; to: string }[] = TELCO_SYNONYMS.flatMap((group) =>
  group.slice(1).map((variant) => ({ variant, to: group[0] })),
)
  .sort((a, b) => b.variant.length - a.variant.length)
  .map(({ variant, to }) => ({ re: new RegExp(`(^| )${escapeRe(variant)}(?= |$)`, "g"), to }));

/** Texto normalizado con cada sinónimo telco cambiado por su forma canónica. */
export function canonicalize(text: string): string {
  let t = normalizeText(text);
  for (const { re, to } of REPLACEMENTS) t = t.replace(re, `$1${to}`);
  return t;
}

/** Palabras con significado del texto, ya con sinónimos unificados y en raíz. */
export function learningTokens(text: string): Set<string> {
  return tokenize(canonicalize(text));
}

/** Lo mínimo de un aprendizaje para buscarlo (la fila de `all_learnings` sirve tal cual). */
export interface SearchableLearning {
  source: "experiment" | "pilot";
  id: string;
  text: string;
  item_title?: string | null;
  lever?: string | null;
  channel?: string | null;
  line_name?: string | null;
}

const learningText = (l: SearchableLearning) => [l.text, l.item_title, l.lever, l.channel, l.line_name].filter(Boolean).join(" ");

/**
 * Aprendizajes (de ejercicios y de pilotos) parecidos a una consulta, del más al
 * menos parecido. Exige palabras en común (2, o 1 si la consulta es muy corta) y un
 * Jaccard mínimo, para no mostrar parecidos de relleno.
 */
export function similarLearnings<T extends SearchableLearning>(
  query: string,
  learnings: T[],
  options: { limit?: number; minScore?: number; minShared?: number } = {},
): SimilarMatch<T>[] {
  const q = learningTokens(query);
  if (!q.size) return [];
  const { limit = 5, minScore = 0.08, minShared = q.size <= 2 ? 1 : 2 } = options;
  const matches: SimilarMatch<T>[] = [];
  for (const item of learnings) {
    const c = learningTokens(learningText(item));
    const shared = [...q].filter((t) => c.has(t));
    const score = jaccard(q, c);
    if (shared.length >= minShared && score >= minScore) matches.push({ item, score, shared });
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

// -----------------------------------------------------------------------------
// Taxonomía común (palanca y canal) para filtrar la biblioteca unificada
// -----------------------------------------------------------------------------

/** Canales de un aprendizaje: la vista junta varios medios con coma ("Meta, Google"). */
export function channelNames(channel: string | null | undefined): string[] {
  return (channel ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Opciones únicas (ordenadas) de palanca y canal presentes en una lista. */
export function taxonomyOptions(items: { lever?: string | null; channel?: string | null }[]): { levers: string[]; channels: string[] } {
  const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "es-CO"));
  return {
    levers: sort(new Set(items.map((i) => i.lever?.trim()).filter((x): x is string => !!x))),
    channels: sort(new Set(items.flatMap((i) => channelNames(i.channel)))),
  };
}

/** ¿El aprendizaje es de esa palanca y ese canal? (null = sin filtro; sin tildes ni mayúsculas). */
export function matchesTaxonomy(
  item: { lever?: string | null; channel?: string | null },
  f: { palanca?: string | null; canal?: string | null },
): boolean {
  const same = (a: string, b: string) => normalizeText(a) === normalizeText(b);
  return (!f.palanca || (!!item.lever && same(item.lever, f.palanca))) && (!f.canal || channelNames(item.channel).some((c) => same(c, f.canal!)));
}

/** ¿Un interruptor de la URL está prendido? ("1", "si", "true"). */
export function isOn(value: string | string[] | undefined): boolean {
  const v = (Array.isArray(value) ? value[0] : value)?.trim().toLowerCase();
  return v === "1" || v === "si" || v === "sí" || v === "true";
}

/** Enlace al origen de un aprendizaje: el ejercicio en su programa o el piloto. */
export function learningHref(l: { source: "experiment" | "pilot"; item_id: string; program_id: string | null }): string {
  return l.source === "pilot" || !l.program_id ? `/pilotos/${l.item_id}` : `/programas/${l.program_id}/ejercicios/${l.item_id}`;
}
