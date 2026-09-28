/**
 * La Recua: puntos, niveles de arriero, insignias y escalafón.
 * Puro: recibe los conteos de `gamification_stats` y decide todo lo demás.
 * El humor es de la casa (a veces negro), nunca contra una persona en particular.
 */

export interface UserStats {
  user_id: string;
  name: string;
  days_used: number;
  /** Días de uso de los últimos 60 días, YYYY-MM-DD. */
  recent_days: string[];
  programs_created: number;
  programs_ready: number;
  programs_crowned: number;
  problems_created: number;
  experiments_created: number;
  experiments_decided: number;
  winners: number;
  losers: number;
  scaled: number;
  discarded: number;
  stale_ideas: number;
  learnings: number;
  weeks_loaded: number;
  comments: number;
  pilots_created: number;
  pilots_decided: number;
  pilots_cancelled: number;
  pilot_data_days: number;
  trashed: number;
  insights_created: number;
  insights_planted: number;
  insight_votes_received: number;
  insight_votes_given: number;
  /** Lluvia de ideas (migración 018). */
  ideas_created: number;
  idea_sessions_created: number;
  /** Puntajes dados a ideas ajenas. */
  ideas_scored: number;
  /** Ideas suyas que se volvieron proyecto, piloto o insight. */
  ideas_chosen: number;
  /** Ideas suyas que fueron a dar al cementerio. */
  ideas_buried: number;
}

type CountKey = Exclude<keyof UserStats, "user_id" | "name" | "recent_days">;

export interface PointRule {
  key: CountKey | "streak";
  label: string;
  points: number;
  /** Tope de veces que suma (para que nadie se haga rico comentando «ok»). */
  cap?: number;
  joke: string;
}

/** Cómo se ganan (y se pierden) los puntos. El orden es el de la tabla «Así se gana». */
export const POINT_RULES: PointRule[] = [
  { key: "days_used", label: "Día que entra a la app", points: 5, joke: "Cinco puntos por dar la cara. Así de barato." },
  { key: "streak", label: "Cada día de racha (desde el tercero)", points: 3, cap: 30, joke: "Terco como mula: eso aquí es virtud." },
  { key: "programs_created", label: "Programa creado", points: 50, joke: "Parir un programa no es cualquier cosa." },
  { key: "programs_ready", label: "Programa configurado de punta a punta", points: 30, joke: "Lo empezó y lo terminó. Raro, pero pasa." },
  { key: "programs_crowned", label: "Programa coronado (terminó con decisiones)", points: 200, joke: "Llegó a la cima con la carga completa." },
  { key: "problems_created", label: "Oportunidad de mejora con evidencia", points: 15, joke: "Encontrar el hueco es la mitad del camino." },
  { key: "experiments_created", label: "Ejercicio creado", points: 20, joke: "Una idea con hipótesis vale más que diez en el chat." },
  { key: "experiments_decided", label: "Ejercicio decidido", points: 60, joke: "Decidir es lo que separa a los arrieros de los opinadores." },
  { key: "winners", label: "Ganador (además del decidido)", points: 80, joke: "Le pegó. Disfrútelo, que eso no pasa todos los días." },
  { key: "losers", label: "Perdedor asumido con dignidad", points: 30, joke: "Matar una hipótesis también es trabajo. Alguien tiene que hacerlo." },
  { key: "scaled", label: "Escalado a BAU", points: 150, joke: "De ejercicio a costumbre. Eso es crecer." },
  { key: "learnings", label: "Aprendizaje escrito", points: 40, joke: "Lo que no se escribe, se lo lleva el viento." },
  { key: "weeks_loaded", label: "Semana de datos cargada", points: 10, joke: "Los lunes sin excusas. La mula lo vigila." },
  { key: "comments", label: "Comentario", points: 3, cap: 40, joke: "Opinar suma, pero poquito. Tiene tope." },
  { key: "pilots_created", label: "Piloto de medios creado", points: 40, joke: "Probar antes de gastar: bendito sea." },
  { key: "pilots_decided", label: "Piloto decidido", points: 150, joke: "Cerró el piloto con veredicto. Ovación de pie." },
  { key: "pilot_data_days", label: "Día con datos de piloto cargados", points: 5, joke: "El dato de hoy es el veredicto de mañana." },
  { key: "insights_created", label: "Insight anotado en el carriel", points: 10, cap: 60, joke: "Ojo de arriero: lo vio y lo anotó antes de que se le olvidara." },
  { key: "insight_votes_received", label: "Voto que le dieron a un insight suyo", points: 3, cap: 50, joke: "Que otros también lo hayan visto: eso sí es evidencia." },
  { key: "insights_planted", label: "Insight suyo sembrado en un proyecto", points: 50, joke: "Lo que vio se volvió trabajo. Así se crece." },
  { key: "insight_votes_given", label: "Voto a un insight ajeno", points: 1, cap: 30, joke: "Apoyar al compañero también suma. Poquito, pero suma." },
  { key: "idea_sessions_created", label: "Aguacero de ideas armado", points: 20, joke: "Hacedor de lluvia: pone el reto y el equipo se moja." },
  { key: "ideas_created", label: "Idea soltada en un aguacero", points: 5, cap: 60, joke: "Cinco puntos por gota. Con tope, que esto no es el diluvio universal." },
  { key: "ideas_scored", label: "Idea ajena puntuada", points: 1, cap: 40, joke: "Juzgar ideas ajenas, por fin con puntos. Poquitos." },
  { key: "ideas_chosen", label: "Idea suya elegida (proyecto, piloto o insight)", points: 60, joke: "Llovió, escampó y su idea quedó viva. Eso es suerte o talento." },
  { key: "ideas_buried", label: "Idea suya enterrada", points: 1, joke: "Un punto de consolación. Por lo menos murió en su ley." },
  { key: "discarded", label: "Ejercicio descartado a tiempo", points: 5, joke: "Por lo menos lo reconoció. Algo es algo." },
  { key: "pilots_cancelled", label: "Piloto cancelado", points: 5, joke: "Descanse en paz. Cinco puntos por el entierro." },
  { key: "stale_ideas", label: "Idea quieta hace más de 30 días", points: -10, joke: "Se murió de olvido. Menos diez, y un minuto de silencio." },
];

/** Racha: días seguidos de uso que terminan hoy o ayer (si hoy aún no entra, no se pierde). */
export function currentStreak(days: readonly string[], todayIso: string): number {
  const set = new Set(days);
  const back = (iso: string, n: number) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const start = set.has(todayIso) ? todayIso : set.has(back(todayIso, 1)) ? back(todayIso, 1) : null;
  if (!start) return 0;
  let n = 0;
  while (set.has(back(start, n))) n += 1;
  return n;
}

export interface ScoreLine {
  key: PointRule["key"];
  label: string;
  count: number;
  points: number;
}

/** Puntos totales (nunca negativos) y el desglose por regla. */
export function computeScore(stats: UserStats, todayIso: string): { points: number; lines: ScoreLine[]; streak: number } {
  const streak = currentStreak(stats.recent_days, todayIso);
  const lines = POINT_RULES.map((r) => {
    const raw = r.key === "streak" ? Math.max(0, streak - 2) : stats[r.key];
    const count = r.cap != null ? Math.min(raw, r.cap) : raw;
    return { key: r.key, label: r.label, count, points: count * r.points };
  }).filter((l) => l.count > 0);
  const points = Math.max(0, lines.reduce((s, l) => s + l.points, 0));
  return { points, lines, streak };
}

export interface Level {
  rank: number;
  title: string;
  min: number;
  blurb: string;
}

/** El escalafón de la arriería, del que llega en chanclas a la leyenda de la trocha. */
export const LEVELS: Level[] = [
  { rank: 1, title: "Turista en chanclas", min: 0, blurb: "Vino a mirar. La mula todavía no se aprende su nombre." },
  { rank: 2, title: "Sangrero", min: 60, blurb: "El muchachito que va adelante abriendo trocha. Pura voluntad." },
  { rank: 3, title: "Arriero de a pie", min: 180, blurb: "Ya camina solo, aunque todavía se le enreda la enjalma." },
  { rank: 4, title: "Arriero de recua", min: 400, blurb: "Tiene sus mulas y sus ejercicios. Se le respeta en la fonda." },
  { rank: 5, title: "Caporal", min: 750, blurb: "Manda la recua. Cuando habla, hasta las mulas paran oreja." },
  { rank: 6, title: "Patrón de la trocha", min: 1300, blurb: "Dueño del camino. En la fonda ya le fían." },
  { rank: 7, title: "Leyenda de la montaña", min: 2200, blurb: "De usted hablan los arrieros en las noches de fogón." },
  { rank: 8, title: "Mula Mayor honoraria", min: 3500, blurb: "El máximo honor: Doña Canela lo considera de la familia." },
];

export function levelFor(points: number): { level: Level; next: Level | null; progress: number; missing: number } {
  const idx = LEVELS.findLastIndex((l) => points >= l.min);
  const level = LEVELS[Math.max(idx, 0)];
  const next = LEVELS[idx + 1] ?? null;
  if (!next) return { level, next: null, progress: 1, missing: 0 };
  return { level, next, progress: (points - level.min) / (next.min - level.min), missing: next.min - points };
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  /** Insignias de humor negro: van en «El muro de la vergüenza». */
  dark?: boolean;
  earned: (s: UserStats, streak: number) => boolean;
}

export const BADGES: Badge[] = [
  { id: "fundador", title: "Fundador de pueblo", description: "Creó un programa. Como los antioqueños, fundando donde caiga.", earned: (s) => s.programs_created >= 1 },
  { id: "terco", title: "Terco como mula", description: "5 días seguidos entrando. La constancia es de mula, y a mucho honor.", earned: (_s, k) => k >= 5 },
  { id: "madrugador", title: "Sin falta los lunes", description: "4 semanas de datos cargadas. El Excel lo extraña.", earned: (s) => s.weeks_loaded >= 4 },
  { id: "midas", title: "Mano de Midas", description: "3 ejercicios ganadores. ¿Qué toma usted? Comparta.", earned: (s) => s.winners >= 3 },
  { id: "escalador", title: "Escalador del Nevado", description: "Llevó un ejercicio a BAU. De prueba a costumbre.", earned: (s) => s.scaled >= 1 },
  { id: "cronista", title: "Cronista de la trocha", description: "5 aprendizajes escritos. Carrasquilla estaría orgulloso.", earned: (s) => s.learnings >= 5 },
  { id: "juez", title: "Juez de la fonda", description: "5 ejercicios decididos. Aquí no se queda nada en veremos.", earned: (s) => s.experiments_decided >= 5 },
  { id: "piloto", title: "Piloto de la Aeropostal", description: "Cerró un piloto de medios con veredicto.", earned: (s) => s.pilots_decided >= 1 },
  { id: "coronado", title: "Coronó la montaña", description: "Terminó un programa con decisiones. Pa' enmarcar.", earned: (s) => s.programs_crowned >= 1 },
  { id: "chismoso", title: "Chismoso oficial", description: "20 comentarios. Si no está en el chat, está aquí.", earned: (s) => s.comments >= 20 },
  { id: "ojo", title: "Ojo de águila", description: "10 insights anotados. Usted ve lo que otros ni miran.", earned: (s) => s.insights_created >= 10 },
  { id: "profeta", title: "El profeta de la vereda", description: "3 insights suyos sembrados. Lo dijo y se cumplió.", earned: (s) => s.insights_planted >= 3 },
  { id: "influencer", title: "Influencer de fonda", description: "20 votos recibidos en sus insights. Tiene seguidores.", earned: (s) => s.insight_votes_received >= 20 },
  { id: "nube", title: "Nube cargada", description: "20 ideas soltadas en los aguaceros. Usted no piensa: llueve.", earned: (s) => s.ideas_created >= 20 },
  { id: "hacedor", title: "Hacedor de lluvia", description: "Armó 3 aguaceros. Ni el chamán de la vereda.", earned: (s) => s.idea_sessions_created >= 3 },
  { id: "cosecha", title: "Buena cosecha", description: "3 ideas suyas elegidas. Lo que usted riega, crece.", earned: (s) => s.ideas_chosen >= 3 },
  {
    id: "poeta",
    title: "Poeta maldito",
    description: "5 ideas suyas en el cementerio. Incomprendido en vida, como todos los grandes.",
    dark: true,
    earned: (s) => s.ideas_buried >= 5,
  },
  { id: "matarife", title: "Matarife de hipótesis", description: "3 perdedores asumidos. Mató más hipótesis que el invierno en el páramo.", dark: true, earned: (s) => s.losers >= 3 },
  { id: "sepulturero", title: "El sepulturero", description: "Mandó 5 cosas a la papelera. Entierra sin llorar.", dark: true, earned: (s) => s.trashed >= 5 },
  { id: "cementerio", title: "Dueño del cementerio de ideas", description: "5 ideas quietas hace más de un mes. Aquí yacen. Que en paz descansen.", dark: true, earned: (s) => s.stale_ideas >= 5 },
  {
    id: "acumulador",
    title: "El acumulador",
    description: "10 insights y ninguno sembrado. Guarda insights como la abuela guarda bolsas del mercado.",
    dark: true,
    earned: (s) => s.insights_created >= 10 && s.insights_planted === 0,
  },
  { id: "kamikaze", title: "Piloto kamikaze", description: "Canceló un piloto. Valiente, o desesperado. Nunca sabremos.", dark: true, earned: (s) => s.pilots_cancelled >= 1 },
];

export function badgesFor(stats: UserStats, streak: number): Badge[] {
  return BADGES.filter((b) => b.earned(stats, streak));
}

export interface RankedUser {
  userId: string;
  name: string;
  points: number;
  position: number;
  level: Level;
  streak: number;
  badges: Badge[];
  lines: ScoreLine[];
  /** Sin entrar hace más de 30 días (o nunca). */
  ghost: boolean;
  stats: UserStats;
}

/** Escalafón: de más a menos puntos; empates comparten puesto. Quien no tiene nada no aparece. */
export function rankUsers(rows: readonly UserStats[], todayIso: string): RankedUser[] {
  const month = (() => {
    const d = new Date(`${todayIso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().slice(0, 10);
  })();
  const scored = rows
    .map((s) => {
      const { points, lines, streak } = computeScore(s, todayIso);
      return {
        userId: s.user_id,
        name: s.name,
        points,
        position: 0,
        level: levelFor(points).level,
        streak,
        badges: badgesFor(s, streak),
        lines,
        ghost: !s.recent_days.some((d) => d >= month),
        stats: s,
      };
    })
    .filter((u) => u.points > 0 || u.lines.length > 0)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "es"));
  scored.forEach((u, i) => {
    u.position = i > 0 && scored[i - 1].points === u.points ? scored[i - 1].position : i + 1;
  });
  return scored;
}

/** Apodo según el puesto: el primero manda, el último es el farolito rojo. */
export function positionTitle(position: number, total: number): string | null {
  if (position === 1) return "El que manda la parada";
  if (position === 2) return "Segundo, pero con dignidad";
  if (position === 3) return "Bronce y aguardiente";
  if (total >= 4 && position === total) return "El farolito rojo";
  return null;
}

/** Lo que dice la mula de cada fantasma (quien no entra hace un mes). Estable por persona. */
const GHOST_LINES = [
  "Se busca. Última vez visto abriendo un Excel.",
  "¿Lo secuestró una reunión de dos horas?",
  "Dicen que sigue en el paseo de olla.",
  "Desaparecido en la trocha. Si lo ve, dígale que lo extrañamos (un poquito).",
  "Se fue por panela y no volvió.",
];
export function ghostLine(userId: string): string {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GHOST_LINES[h % GHOST_LINES.length];
}

/** Frase para la persona según su nivel y lo que le falta. */
export function nudge(points: number): string {
  const { next, missing } = levelFor(points);
  if (!next) return "Ya no hay más escalafón. Ahora le toca enseñarle a la recua.";
  if (missing <= 20) return `¡Le faltan ${missing} puntos para ${next.title}! Eso es una carga de panela.`;
  return `Le faltan ${missing} puntos para ${next.title}. Hágale, que la montaña no se sube sola.`;
}
