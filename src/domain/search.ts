// Búsqueda global (Ctrl/⌘+K): normalización sin tildes ni mayúsculas,
// prefiltro para la base y ranking de resultados. Funciones puras.

export type SearchKind = "problem" | "experiment" | "learning" | "metric" | "program";

export const SEARCH_KIND_ORDER: SearchKind[] = ["experiment", "problem", "learning", "metric", "program"];

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  experiment: "Ejercicios",
  problem: "Problemas",
  learning: "Aprendizajes",
  metric: "Métricas",
  program: "Programas",
};

/** Mínimo de caracteres (ya normalizados) para buscar. */
export const MIN_QUERY_LENGTH = 2;

/** Minúsculas, sin tildes ni diéresis (ñ → n), espacios colapsados. */
export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Palabras de la consulta, normalizadas y solo con letras y números. */
export function tokenize(query: string): string[] {
  return normalizeText(query)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function isSearchable(query: string): boolean {
  return tokenize(query).join("").length >= MIN_QUERY_LENGTH;
}

// Letras que pueden llevar tilde o virgulilla en español: en el patrón de la
// base se vuelven comodín de un carácter para no depender de `unaccent`.
const ACCENTABLE = /[aeioun]/g;

/**
 * Patrón `ILIKE` para prefiltrar en Postgres: la palabra más larga de la
 * consulta, con las letras acentuables como `_`. Deja pasar algo de más
 * (el ranking filtra después), nunca de menos. Solo contiene letras, dígitos,
 * `_` y `%`, así que es seguro dentro de un filtro `or` de PostgREST.
 */
export function likePattern(query: string): string | null {
  const tokens = tokenize(query);
  if (!isSearchable(query)) return null;
  const longest = tokens.reduce((a, b) => (b.length > a.length ? b : a), "");
  return `%${longest.replace(ACCENTABLE, "_")}%`;
}

export interface SearchField {
  text: string | null | undefined;
  /** 1 = campo principal (título/nombre); menos para campos de apoyo. */
  weight: number;
}

function tokenScore(field: string, token: string): number {
  if (!field) return 0;
  if (field === token) return 100;
  if (field.startsWith(token)) return 70;
  const at = field.indexOf(token);
  if (at < 0) return 0;
  // Inicio de palabra vale más que en medio de una palabra.
  return /[^a-z0-9]/.test(field[at - 1] ?? " ") ? 45 : 20;
}

/**
 * Puntaje de coincidencia: todas las palabras deben aparecer en algún campo
 * (si no, 0). Cada palabra suma su mejor coincidencia ponderada; la frase
 * completa en el campo principal da un bono.
 */
export function scoreMatch(query: string, fields: SearchField[]): number {
  const tokens = tokenize(query);
  if (!tokens.length) return 0;
  const normalized = fields.map((f) => ({ text: normalizeText(f.text), weight: f.weight }));
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const f of normalized) best = Math.max(best, tokenScore(f.text, token) * f.weight);
    if (best === 0) return 0;
    total += best;
  }
  const phrase = tokens.join(" ");
  if (tokens.length > 1 && normalized.some((f) => f.weight >= 1 && f.text.includes(phrase))) total += 30;
  return Math.round(total);
}

export interface SearchCandidate {
  kind: SearchKind;
  id: string;
  programId: string;
  programName: string;
  title: string;
  /** Texto de apoyo (evidencia, hipótesis, línea…) que también se busca. */
  detail?: string | null;
  href: string;
}

export interface SearchHit extends SearchCandidate {
  score: number;
  /** Fragmento del detalle alrededor de la coincidencia (si la hubo ahí). */
  snippet: string | null;
}

/** Fragmento corto del texto alrededor de la primera palabra encontrada. */
export function snippetAround(text: string | null | undefined, query: string, radius = 48): string | null {
  if (!text) return null;
  const tokens = tokenize(query);
  // En NFC, quitar tildes conserva la longitud: los índices del texto
  // normalizado sirven para recortar el original. Si no, se corta al inicio.
  const source = text.normalize("NFC").replace(/\s+/g, " ").trim();
  const haystack = normalizeText(source);
  if (haystack.length !== source.length) return source.slice(0, radius * 2) + (source.length > radius * 2 ? "…" : "");
  const at = tokens.map((t) => haystack.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (at === undefined) return null;
  const start = Math.max(0, at - radius);
  const end = Math.min(source.length, at + radius);
  return `${start > 0 ? "…" : ""}${source.slice(start, end).trim()}${end < source.length ? "…" : ""}`;
}

/**
 * Filtra y ordena candidatos. `currentProgramId` sube un poco lo del
 * programa abierto. Empates: por título.
 */
export function rankResults(
  candidates: SearchCandidate[],
  query: string,
  opts: { currentProgramId?: string | null; limitPerKind?: number } = {},
): SearchHit[] {
  const limit = opts.limitPerKind ?? 6;
  const hits: SearchHit[] = [];
  for (const c of candidates) {
    const titleScore = scoreMatch(query, [{ text: c.title, weight: 1 }]);
    const score = scoreMatch(query, [
      { text: c.title, weight: 1 },
      { text: c.detail, weight: 0.5 },
      { text: c.programName, weight: 0.3 },
    ]);
    if (score === 0) continue;
    const boost = opts.currentProgramId && c.programId === opts.currentProgramId ? 15 : 0;
    hits.push({ ...c, score: score + boost, snippet: titleScore > 0 ? null : snippetAround(c.detail, query) });
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "es"));
  const perKind = new Map<SearchKind, number>();
  return hits.filter((h) => {
    const n = perKind.get(h.kind) ?? 0;
    perKind.set(h.kind, n + 1);
    return n < limit;
  });
}

export interface SearchGroup {
  kind: SearchKind;
  label: string;
  hits: SearchHit[];
}

/** Agrupa por tipo en el orden de `SEARCH_KIND_ORDER`, sin grupos vacíos. */
export function groupResults(hits: SearchHit[]): SearchGroup[] {
  return SEARCH_KIND_ORDER.map((kind) => ({ kind, label: SEARCH_KIND_LABEL[kind], hits: hits.filter((h) => h.kind === kind) })).filter(
    (g) => g.hits.length > 0,
  );
}

// ---------------------------------------------------------------------------
// Atajos de teclado

export type ShortcutAction = "open-search" | "open-help" | "new-experiment" | "go-backlog" | "go-kanban";

export interface ShortcutKey {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export interface ShortcutState {
  /** Se pulsó «g» y se espera la segunda tecla. */
  pendingG: boolean;
}

/**
 * Resuelve una tecla. `inProgram` habilita los atajos que necesitan un
 * programa abierto. `typing` = el foco está en un campo de texto: ahí solo
 * funciona Ctrl/⌘+K.
 */
export function resolveShortcut(
  state: ShortcutState,
  event: ShortcutKey,
  ctx: { inProgram: boolean; typing: boolean },
): { action: ShortcutAction | null; state: ShortcutState } {
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === "k") return { action: "open-search", state: { pendingG: false } };
  if (ctx.typing || event.ctrlKey || event.metaKey || event.altKey) return { action: null, state: { pendingG: false } };
  if (state.pendingG) {
    const action: ShortcutAction | null = ctx.inProgram ? (key === "b" ? "go-backlog" : key === "k" ? "go-kanban" : null) : null;
    return { action, state: { pendingG: false } };
  }
  if (event.key === "?") return { action: "open-help", state: { pendingG: false } };
  if (key === "g" && ctx.inProgram) return { action: null, state: { pendingG: true } };
  if (key === "n" && ctx.inProgram) return { action: "new-experiment", state: { pendingG: false } };
  return { action: null, state: { pendingG: false } };
}

export const SHORTCUTS_HELP: { keys: string[]; label: string; inProgram?: boolean }[] = [
  { keys: ["Ctrl", "K"], label: "Buscar en sus programas" },
  { keys: ["?"], label: "Ver estos atajos" },
  { keys: ["N"], label: "Nuevo ejercicio", inProgram: true },
  { keys: ["G", "B"], label: "Ir al backlog de ejercicios", inProgram: true },
  { keys: ["G", "K"], label: "Ir al Kanban", inProgram: true },
];
