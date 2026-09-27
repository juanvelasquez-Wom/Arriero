// "Esto se parece a…": similitud simple entre el borrador de un ejercicio y lo que
// ya se probó o aprendió. Sin librerías: palabras normalizadas (sin tildes ni
// mayúsculas), sin palabras vacías del español, con una raíz corta, y Jaccard.
import { STATUS_LABEL } from "./labels";
import type { ExperimentStatus, Verdict } from "./types";

const STOPWORDS = new Set(
  (
    "a al algo algun alguna algunas alguno algunos ante antes aqui asi aun bien cada casi como con contra cual cuales cuando " +
    "de del desde donde dos el ella ellas ellos en entonces entre era es esa esas ese eso esos esta estan estas este esto estos " +
    "fue ha hace hacia han hasta hay la las le les lo los mas me mi mientras muy mucho mucha muchos muchas nada ni no nos nuestra " +
    "nuestro nuestros nuestras o otra otras otro otros para pero poco por porque que quien se sea segun ser si sin sobre solo " +
    "somos son su sus tambien tan tanto te tiene tienen todo todos toda todas tras tu un una unas uno unos usted ustedes y ya " +
    "vamos va van hacer hacemos cambiamos sube baja mejora mas menos"
  ).split(" "),
);

/** Minúsculas, sin tildes y solo letras y números. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

/** Raíz liviana: quita plurales y deja los primeros 6 caracteres. */
export function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith("es")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("s")) w = w.slice(0, -1);
  return w.slice(0, 6);
}

/** Palabras con significado (3+ letras, sin palabras vacías), ya en raíz. */
export function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of normalizeText(text).split(" ")) {
    if (w.length < 3 || STOPWORDS.has(w)) continue;
    out.add(stem(w));
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

/** Con menos de 4 palabras con significado no vale la pena comparar. */
export const MIN_DRAFT_TOKENS = 4;

export function hasEnoughText(text: string): boolean {
  return tokenize(text).size >= MIN_DRAFT_TOKENS;
}

export interface SimilarMatch<T> {
  item: T;
  score: number;
  shared: string[];
}

/**
 * Los `limit` candidatos más parecidos al borrador. Exige al menos dos palabras en
 * común y un Jaccard mínimo, para no mostrar parecidos de relleno.
 */
export function findSimilar<T>(
  draft: string,
  candidates: T[],
  textOf: (item: T) => string,
  options: { limit?: number; minScore?: number; minShared?: number } = {},
): SimilarMatch<T>[] {
  const { limit = 3, minScore = 0.15, minShared = 2 } = options;
  const d = tokenize(draft);
  if (d.size < MIN_DRAFT_TOKENS) return [];
  const matches: SimilarMatch<T>[] = [];
  for (const item of candidates) {
    const c = tokenize(textOf(item));
    const shared = [...d].filter((t) => c.has(t));
    const score = jaccard(d, c);
    if (shared.length >= minShared && score >= minScore) matches.push({ item, score, shared });
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

const VERDICT_PAST: Record<Verdict, string> = { winner: "ganó", loser: "perdió", inconclusive: "no fue concluyente" };

function monthName(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "America/Bogota" }).format(new Date(iso));
}

/**
 * "Recargas ya probó algo parecido en septiembre de 2026 (perdió). ¿Qué es diferente esta vez?"
 * Si todavía no hay veredicto, dice en qué estado va.
 */
export function similarExperimentMessage(input: {
  lineName: string;
  date: string | null;
  status: ExperimentStatus;
  verdict: Verdict | null;
}): string {
  const when = input.date ? ` en ${monthName(input.date)}` : "";
  const outcome = input.verdict ? VERDICT_PAST[input.verdict] : `va en ${STATUS_LABEL[input.status]}`;
  const who = input.lineName || "El equipo";
  const verb = input.verdict ? "ya probó" : "ya tiene";
  return `${who} ${verb} algo parecido${when} (${outcome}). ¿Qué es diferente esta vez?`;
}

/** Recorta un texto largo para mostrarlo como fragmento. */
export function snippet(text: string, max = 140): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}
