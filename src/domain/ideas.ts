/**
 * Lluvia de ideas («aguaceros»): fases, permisos para la UI, puntaje, podio,
 * favoritas, anonimato y las frases del cementerio.
 *
 * Cómo funciona un aguacero:
 * 1. Llueven ideas (`open`): cualquiera anota, sin filtro y sin puntajes a la vista.
 * 2. A puntuar (`voting`): impacto y facilidad de 1 a 5 y hasta 3 «¡Esta!». A ciegas.
 * 3. Se decidió (`closed`): podio a la vista y cada idea va a proyecto, piloto,
 *    insight o al cementerio.
 * La base (migración 018) es la barrera real; esto solo decide qué se muestra.
 */

export type IdeaPhase = "open" | "voting" | "closed";
export type IdeaDecision = "project" | "pilot" | "insight" | "buried";

export const IDEA_TITLE_MIN = 3;
export const IDEA_TITLE_MAX = 200;
export const SESSION_TITLE_MIN = 5;
export const SESSION_TITLE_MAX = 200;
export const MAX_FAVORITES = 3;
export const SCORE_VALUES = [1, 2, 3, 4, 5] as const;

export const IDEA_PHASES: { key: IdeaPhase; label: string; short: string; blurb: string }[] = [
  {
    key: "open",
    label: "Llueven ideas",
    short: "Lloviendo",
    blurb: "Anote todas las que se le ocurran, sin filtro. Aquí nadie juzga… todavía.",
  },
  {
    key: "voting",
    label: "A puntuar",
    short: "A puntuar",
    blurb: "Impacto y facilidad de 1 a 5, y hasta 3 «¡Esta!». A ciegas: nadie ve lo del otro hasta cerrar.",
  },
  {
    key: "closed",
    label: "Se decidió",
    short: "Decidido",
    blurb: "El podio a la vista. Cada idea va para proyecto, piloto, insight o al cementerio.",
  },
];
export const PHASE_LABEL: Record<IdeaPhase, string> = Object.fromEntries(IDEA_PHASES.map((p) => [p.key, p.label])) as Record<IdeaPhase, string>;

export const DECISION_LABEL: Record<IdeaDecision, string> = {
  project: "Para proyecto",
  pilot: "Para piloto de medios",
  insight: "Al carriel de insights",
  buried: "Al cementerio",
};

/** Saltos de fase permitidos (espejo de `set_idea_session_phase`). */
const MOVES: Record<IdeaPhase, IdeaPhase[]> = { open: ["voting"], voting: ["closed", "open"], closed: ["voting"] };

export function canMovePhase(from: IdeaPhase, to: IdeaPhase): boolean {
  return MOVES[from].includes(to);
}

export interface PhaseMove {
  to: IdeaPhase;
  label: string;
  /** La que empuja hacia adelante (botón amarillo). */
  primary: boolean;
  confirm: string;
}

/** Botones para mover la fase. `hasIdeas` y `hasLinked` replican las reglas de la RPC. */
export function phaseMoves(phase: IdeaPhase, opts: { hasIdeas: boolean; hasLinked: boolean }): PhaseMove[] {
  const out: PhaseMove[] = [];
  if (phase === "open" && opts.hasIdeas) {
    out.push({ to: "voting", label: "Escampó: a puntuar", primary: true, confirm: "Ya no se anotan más ideas. Todos puntúan a ciegas." });
  }
  if (phase === "voting") {
    out.push({ to: "closed", label: "Cerrar y ver el podio", primary: true, confirm: "Se cierran los puntajes y el podio queda a la vista de todos." });
    out.push({ to: "open", label: "Que vuelva a llover", primary: false, confirm: "Se pueden anotar más ideas. Los puntajes que ya hay se guardan." });
  }
  if (phase === "closed" && !opts.hasLinked) {
    out.push({ to: "voting", label: "Reabrir la votación", primary: false, confirm: "Los puntajes vuelven a quedar a ciegas hasta cerrar otra vez." });
  }
  return out;
}

export interface IdeaSessionRow {
  id: string;
  title: string;
  context: string | null;
  line_hint: string | null;
  deadline: string | null;
  phase: IdeaPhase;
  phase_changed_at: string;
  closed_at: string | null;
  created_at: string;
  owner_name: string;
  mine: boolean;
  idea_count: number;
  chosen_count: number;
  buried_count: number;
}

/** Idea tal como llega al navegador: sin el id del autor; si es anónima y ajena, sin su nombre. */
export interface IdeaRow {
  id: string;
  session_id: string;
  title: string;
  detail: string | null;
  anonymous: boolean;
  /** null si es anónima y no es de la persona. */
  author_name: string | null;
  mine: boolean;
  decision: IdeaDecision | null;
  decision_note: string | null;
  decided_at: string | null;
  program_id: string | null;
  pilot_id: string | null;
  insight_id: string | null;
  linked_at: string | null;
  created_at: string;
}

export interface IdeaScore {
  idea_id: string;
  /** true si es de la persona que mira. */
  mine: boolean;
  impact: number | null;
  ease: number | null;
  favorite: boolean;
}

export const SHY_AUTHOR = "Un arriero tímido";

/** Quién firma la idea en pantalla. */
export function authorLabel(i: Pick<IdeaRow, "anonymous" | "author_name" | "mine">): string {
  if (i.mine) return i.anonymous ? "Usted (en anónimo)" : "Usted";
  if (i.anonymous || !i.author_name) return SHY_AUTHOR;
  return i.author_name;
}

export interface Me {
  isOwner: boolean;
  isAdmin: boolean;
}

/** Qué puede hacer la persona con el aguacero (espejo de la RLS y las RPC). */
export function sessionActions(s: Pick<IdeaSessionRow, "phase">, me: Me) {
  const boss = me.isOwner || me.isAdmin;
  return {
    addIdea: s.phase === "open",
    score: s.phase === "voting",
    movePhase: boss,
    decide: boss && s.phase === "closed",
    edit: boss,
    remove: boss,
  };
}

/** Qué puede hacer la persona con una idea. */
export function ideaActions(i: Pick<IdeaRow, "mine" | "linked_at">, s: Pick<IdeaSessionRow, "phase">, me: Me) {
  const boss = me.isOwner || me.isAdmin;
  return {
    edit: s.phase === "open" && (i.mine || me.isAdmin),
    remove: !i.linked_at && (i.mine || boss),
    score: s.phase === "voting" && !i.mine,
    decide: boss && s.phase === "closed" && !i.linked_at,
  };
}

export interface RankedIdea {
  idea: IdeaRow;
  position: number;
  /** Personas que dieron impacto y facilidad. */
  voters: number;
  impact: number | null;
  ease: number | null;
  /** Promedio de impacto × promedio de facilidad (1 a 25). */
  score: number | null;
  favorites: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Podio: puntaje (impacto × facilidad) de mayor a menor; empata el de más
 * «¡Esta!» y después el de más votantes. Las ideas sin puntaje van al final.
 * Las borradas o enterradas no entran (el cementerio va aparte).
 */
export function rankIdeas(ideas: readonly IdeaRow[], scores: readonly IdeaScore[]): RankedIdea[] {
  const by = new Map<string, IdeaScore[]>();
  for (const s of scores) (by.get(s.idea_id) ?? by.set(s.idea_id, []).get(s.idea_id)!).push(s);
  const rows = ideas.map((idea) => {
    const list = by.get(idea.id) ?? [];
    const full = list.filter((s) => s.impact != null && s.ease != null);
    const impact = avg(full.map((s) => s.impact!));
    const ease = avg(full.map((s) => s.ease!));
    return {
      idea,
      position: 0,
      voters: full.length,
      impact: impact == null ? null : round1(impact),
      ease: ease == null ? null : round1(ease),
      score: impact == null || ease == null ? null : round1(impact * ease),
      favorites: list.filter((s) => s.favorite).length,
    };
  });
  rows.sort(
    (a, b) =>
      (b.score ?? -1) - (a.score ?? -1) ||
      b.favorites - a.favorites ||
      b.voters - a.voters ||
      a.idea.created_at.localeCompare(b.idea.created_at),
  );
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.position = prev && prev.score === r.score && prev.favorites === r.favorites && prev.voters === r.voters ? prev.position : i + 1;
  });
  return rows;
}

/** Cuántas «¡Esta!» le quedan a la persona en el aguacero. */
export function favoritesLeft(scores: readonly IdeaScore[]): number {
  return Math.max(0, MAX_FAVORITES - scores.filter((s) => s.mine && s.favorite).length);
}

/** Cuántas ideas ajenas le faltan por puntuar (impacto y facilidad). */
export function pendingToScore(ideas: readonly IdeaRow[], scores: readonly IdeaScore[]): number {
  const done = new Set(scores.filter((s) => s.mine && s.impact != null && s.ease != null).map((s) => s.idea_id));
  return ideas.filter((i) => !i.mine && !done.has(i.id)).length;
}

export type SessionView = "abiertas" | "votacion" | "cerradas" | "mios";
export const SESSION_VIEWS: SessionView[] = ["abiertas", "votacion", "cerradas", "mios"];

export function filterSessions(list: readonly IdeaSessionRow[], view: SessionView): IdeaSessionRow[] {
  const keep = (s: IdeaSessionRow) =>
    view === "mios" ? s.mine : view === "abiertas" ? s.phase === "open" : view === "votacion" ? s.phase === "voting" : s.phase === "closed";
  return list.filter(keep).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function sessionCounts(list: readonly IdeaSessionRow[]) {
  return {
    open: list.filter((s) => s.phase === "open").length,
    voting: list.filter((s) => s.phase === "voting").length,
    closed: list.filter((s) => s.phase === "closed").length,
    mine: list.filter((s) => s.mine).length,
    ideas: list.reduce((n, s) => n + s.idea_count, 0),
    chosen: list.reduce((n, s) => n + s.chosen_count, 0),
    buried: list.reduce((n, s) => n + s.buried_count, 0),
  };
}

/** ¿La fecha límite ya pasó? (YYYY-MM-DD contra hoy en Bogotá). */
export function isOverdue(deadline: string | null, todayIso: string): boolean {
  return !!deadline && deadline < todayIso;
}

const hash = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};

/** Retos de ejemplo para el formulario del aguacero. */
export const RETO_EXAMPLES = [
  "¿Cómo subimos las portabilidades en diciembre?",
  "¿Qué hacemos para que la gente recargue antes de quedarse sin saldo?",
  "¿Cómo bajamos el costo por conversación en WhatsApp?",
  "¿Qué le ofrecemos al cliente que está a punto de irse?",
  "¿Cómo vendemos más equipos sin regalar el margen?",
];

/** Ejemplos para el campo de la idea: rotan para inspirar sin estorbar. */
export const IDEA_EXAMPLES = [
  "Regalar el primer mes a quien se pase con la línea de un familiar.",
  "Mensaje por WhatsApp el día antes de que se acabe el paquete.",
  "Botón de «Llámeme» en la landing a la hora del almuerzo.",
  "Precio especial para la segunda línea de la casa.",
  "Un video de 15 segundos de un cliente real, sin guion.",
];

const RAIN_LINES = [
  "¡Plop! Otra gota.",
  "Anotada. Siga, que está lloviendo.",
  "¡Eso! El aguacero se está poniendo bueno.",
  "Una más. La mula ya sacó el paraguas.",
  "Guardada. Aquí ninguna idea es boba (hasta la votación).",
];
/** Lo que dice la mula al anotar una idea. Estable según el texto. */
export function rainLine(title: string): string {
  return RAIN_LINES[hash(title) % RAIN_LINES.length];
}

/** Frases del cementerio de ideas. Humor negro contra la idea, nunca contra la persona. */
export const RIP_LINES = [
  "Aquí yace una idea que quería cambiar el mundo. El mundo no se enteró.",
  "Murió joven, sin presupuesto y sin grupo control.",
  "Q. E. P. D. La mató el Excel de costos.",
  "Se fue sin conocer el comité. Tal vez fue lo mejor.",
  "Descansa junto a «hagamos un TikTok» y «pongamos un chatbot».",
  "Falleció de puntaje bajo. La velaron tres personas y una mula.",
  "No murió: la están guardando para el otro año. (Sí murió).",
  "Por lo menos murió en su ley.",
];
export function ripLine(ideaId: string): string {
  return RIP_LINES[hash(ideaId) % RIP_LINES.length];
}

/** Lo que dice la mula al decidir. */
export function decisionLine(decision: IdeaDecision | null): string {
  switch (decision) {
    case "project":
      return "¡Eso! Esa idea va para proyecto. Ahora sí, a trabajar.";
    case "pilot":
      return "¡Hágale pues! Esa idea va para piloto de medios.";
    case "insight":
      return "Guardada en el carriel de insights. Allá no se la come el olvido.";
    case "buried":
      return "Al cementerio. Un minuto de silencio… listo, sigamos.";
    default:
      return "¡Resucitó! La idea vuelve a estar viva y sin decidir.";
  }
}

/** Borrador del problema del piloto desde una idea (se pasa al asistente de Pilotos). */
export function pilotPrefillFromIdea(i: { title: string; detail: string | null; sessionTitle: string; author: string }) {
  const who = i.author === SHY_AUTHOR ? "un arriero tímido" : i.author;
  const evidence = [i.detail?.trim(), `Salió del aguacero «${i.sessionTitle}». Idea de ${who}.`].filter(Boolean).join("\n\n");
  return { problem: i.title.slice(0, 500), problem_evidence: evidence.slice(0, 1500) };
}
