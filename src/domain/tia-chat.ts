// "Pregúntele a la Tía": reglas puras del chat (historial, presupuesto, textos).
// La llamada a Claude vive en src/app/api/tia/chat; aquí solo lo que se puede probar.

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Largo máximo de una pregunta (también lo valida el servidor). */
export const CHAT_MESSAGE_MAX = 2000;
/** Cuántos mensajes previos se leen de la base antes de recortar. */
export const CHAT_HISTORY_FETCH = 30;
/** Presupuesto aproximado (tokens) para el historial que se le manda a Claude. */
export const CHAT_HISTORY_BUDGET = 3000;
/** Tope de respuesta del chat (tokens). */
export const CHAT_MAX_TOKENS = 900;
/** Largo máximo que se guarda de una respuesta (la columna acepta hasta 20.000). */
export const CHAT_STORED_MAX = 20000;

/**
 * Marca que separa un error ocurrido en medio del streaming: el servidor escribe
 * `\u0001` seguido del mensaje en español y cierra. Nunca aparece en texto normal.
 */
export const CHAT_STREAM_ERROR = "\u0001";

export const CHAT_TITLE = "Pregúntele a la Tía";
export const CHAT_INTRO = "Pregúnteme lo que quiera de este programa, que yo le cuento con los datos en la mano.";

export const CHAT_SUGGESTIONS = [
  "¿Qué métrica va peor y por qué?",
  "¿Qué deberíamos probar esta semana?",
  "¿Qué ya probamos en WhatsApp?",
  "Resúmame el programa para mi jefe",
] as const;

/** Tarea del chat para `tiaSystem`. */
export const CHAT_TASK = `Responda las preguntas de la persona sobre ESTE programa, usando solo los datos del bloque <datos>.
- Cite de dónde sale cada dato ("según la carga de la semana del 14 de sept…", "en la oportunidad de mejora «…»", "en el ejercicio «…»"). Si el dato no está, dígalo y diga qué habría que cargar y dónde.
- Cierre con un siguiente paso concreto con el vocabulario de la app (oportunidad de mejora, ejercicio, métrica norte, árbol, embudo, ICE, veredicto, aprendizaje) y, cuando aplique, la pantalla donde se hace: Resumen, Carga semanal, Oportunidades de mejora, Backlog de ejercicios, Aprendizajes, Gantt, Kanban, Resultados, Portafolio o Configuración.
- Sea corta: máximo 180 palabras, salvo que la persona pida más detalle. Use viñetas cortas cuando ayuden y **negritas** solo para lo clave. Nada de tablas ni HTML.
- Si la pregunta no tiene que ver con el programa o con growth, responda con cariño que usted está para ayudar con este programa y proponga una pregunta útil.
- Los mensajes anteriores de la conversación son contexto; los datos mandan si hay contradicción.`;

/** Estimación gruesa de tokens (≈ 4 caracteres por token en español). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Une turnos seguidos del mismo rol y descarta los vacíos. */
export function normalizeTurns(turns: ChatTurn[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  for (const t of turns) {
    const content = t.content.trim();
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.content = `${last.content}\n\n${content}`;
    else out.push({ role: t.role, content });
  }
  return out;
}

/**
 * Deja los turnos más recientes que caben en el presupuesto, en orden
 * cronológico, empezando siempre por un turno de la persona (lo exige la API).
 */
export function trimHistory(history: ChatTurn[], budgetTokens = CHAT_HISTORY_BUDGET): ChatTurn[] {
  const turns = normalizeTurns(history);
  const kept: ChatTurn[] = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const cost = estimateTokens(turns[i].content);
    if (used + cost > budgetTokens) break;
    used += cost;
    kept.unshift(turns[i]);
  }
  while (kept.length && kept[0].role !== "user") kept.shift();
  return kept;
}

/**
 * Mensajes para Claude: historial recortado + la pregunta nueva al final.
 * Si el historial termina en un turno de la persona (p. ej. una respuesta que
 * falló), se une con la pregunta nueva para no romper la alternancia.
 */
export function buildChatMessages(history: ChatTurn[], question: string, budgetTokens = CHAT_HISTORY_BUDGET): ChatTurn[] {
  const q = question.trim();
  const trimmed = trimHistory(history, Math.max(0, budgetTokens));
  return normalizeTurns([...trimmed, { role: "user", content: q }]);
}

/** Separa el texto recibido del posible error al final del stream. */
export function splitStreamError(raw: string): { text: string; error: string | null } {
  const idx = raw.indexOf(CHAT_STREAM_ERROR);
  if (idx < 0) return { text: raw, error: null };
  return { text: raw.slice(0, idx).trimEnd(), error: raw.slice(idx + 1).trim() || "La Tía no pudo terminar. Intente de nuevo." };
}

/** Texto de la cuota que queda hoy (null = no se sabe). */
export function quotaLabel(left: number | null): string | null {
  if (left == null) return null;
  if (left === 0) return "Hoy ya no le quedan preguntas.";
  if (left === 1) return "Le queda 1 pregunta hoy.";
  return `Le quedan ${left} preguntas hoy.`;
}
