// La Tía: oportunidades, explicación de números, comité y chismecito semanal.
// Aquí viven las instrucciones (tareas) y todo lo que se puede probar sin
// Claude: armar los datos, leer el JSON que responde y validar lo que vuelve.
import { addDays, daysBetween, parseIsoDate, rangesOverlap } from "./dates";
import { evaluateTarget, TARGET_STATUS_LABEL, type TargetHorizon } from "./targets";
import { clip, extractJson } from "./tia";
import type { CalendarEventType, ExperimentStatus, ImpactLevel, IsoDate, MetricDirection } from "./types";

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Nombre comparable: minúsculas, sin tildes, sin signos y con espacios simples. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Busca por nombre: primero exacto (normalizado); si no, un único candidato que contenga o esté contenido. */
export function matchByName<T extends { name: string }>(items: T[], name: unknown): T | null {
  if (typeof name !== "string" || !name.trim()) return null;
  const n = normalizeName(name);
  if (!n) return null;
  const exact = items.filter((i) => normalizeName(i.name) === n);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const loose = items.filter((i) => {
    const m = normalizeName(i.name);
    return m.length > 2 && (m.includes(n) || n.includes(m));
  });
  return loose.length === 1 ? loose[0] : null;
}

/** Texto seguro para la interfaz y la URL: sin caracteres de control, recortado. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// ---------------------------------------------------------------------------
// 1. La Tía detectó una oportunidad
// ---------------------------------------------------------------------------

export const OPPORTUNITY_MAX = 3;

export const OPPORTUNITY_TASK = `Busque en los datos del programa hasta ${OPPORTUNITY_MAX} oportunidades concretas de crecimiento que el equipo todavía no esté atacando. Mire sobre todo:
- métricas norte que van atrás frente a la meta (campo "frente_a_la_meta" y "brecha"),
- oportunidades de mejora con evidencia que no tienen ejercicios (campo "ejercicios" en 0),
- aprendizajes de una línea que podrían aplicarse en otra.

Cada oportunidad debe salir de los datos: cite en "evidence" las cifras o textos exactos de donde sale (semana, valor, meta, título de la oportunidad de mejora o del aprendizaje). No invente cifras. Si no ve ninguna oportunidad con respaldo, devuelva una lista vacía.

Responda SOLO con JSON, sin texto antes ni después, con esta forma:
[{"title": "frase corta de la oportunidad de mejora (máx. 120 caracteres)", "why": "por qué vale la pena, en su voz, 1 o 2 frases", "evidence": "los datos que lo muestran", "line": "nombre exacto de la línea", "stage": "nombre exacto de la etapa del embudo o null", "metric": "nombre exacto de la métrica o null", "impact": "high" | "medium" | "low"}]`;

export interface OpportunityRefs {
  lines: { id: string; name: string }[];
  stages: { id: string; name: string; line_id: string }[];
  metrics: { id: string; name: string; line_id: string }[];
}

export interface TiaOpportunity {
  title: string;
  why: string;
  evidence: string;
  impact: ImpactLevel;
  lineId: string | null;
  lineName: string | null;
  stageId: string | null;
  stageName: string | null;
  metricId: string | null;
  metricName: string | null;
}

function toImpact(v: unknown): ImpactLevel {
  const n = typeof v === "string" ? normalizeName(v) : "";
  if (n === "high" || n === "alto" || n === "alta") return "high";
  if (n === "low" || n === "bajo" || n === "baja") return "low";
  return "medium";
}

/**
 * Lee las oportunidades que devolvió Claude. Devuelve null si no hay JSON
 * legible (la interfaz muestra entonces el texto). Los nombres de línea, etapa
 * y métrica se traducen a ids SOLO entre los del programa; lo que no calce se
 * descarta (nunca se confía en un id que venga en la respuesta).
 */
export function parseOpportunities(text: string, refs: OpportunityRefs): TiaOpportunity[] | null {
  const raw = extractJson<unknown>(text);
  if (raw == null) return null;
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "object"
      ? ((raw as Record<string, unknown>).oportunidades ?? (raw as Record<string, unknown>).opportunities)
      : null;
  if (!Array.isArray(list)) return null;

  const out: TiaOpportunity[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = cleanText(o.title, 120);
    if (!title) continue;
    const why = cleanText(o.why, 600) ?? "";
    const evidence = cleanText(o.evidence, 800) ?? "";

    let line = matchByName(refs.lines, o.line);
    let stage = matchByName(line ? refs.stages.filter((s) => s.line_id === line!.id) : refs.stages, o.stage);
    let metric = matchByName(line ? refs.metrics.filter((m) => m.line_id === line!.id) : refs.metrics, o.metric);
    if (!line) {
      const lineId = stage?.line_id ?? metric?.line_id;
      line = lineId ? (refs.lines.find((l) => l.id === lineId) ?? null) : null;
    }
    if (line && stage && stage.line_id !== line.id) stage = null;
    if (line && metric && metric.line_id !== line.id) metric = null;

    out.push({
      title,
      why,
      evidence,
      impact: toImpact(o.impact),
      lineId: line?.id ?? null,
      lineName: line?.name ?? null,
      stageId: stage?.id ?? null,
      stageName: stage?.name ?? null,
      metricId: metric?.id ?? null,
      metricName: metric?.name ?? null,
    });
    if (out.length >= OPPORTUNITY_MAX) break;
  }
  return out;
}

/** Topes de lo que viaja en la URL para el borrador del problema. */
export const PROBLEM_PREFILL_LIMITS = { title: 240, evidence: 1500 } as const;

/** Enlace a "Nuevo problema" con el borrador de la oportunidad. */
export function problemDraftHref(programId: string, opp: TiaOpportunity): string {
  const sp = new URLSearchParams();
  sp.set("titulo", cleanText(opp.title, PROBLEM_PREFILL_LIMITS.title) ?? "");
  const evidence = cleanText([opp.evidence, opp.why].filter(Boolean).join("\n\n"), PROBLEM_PREFILL_LIMITS.evidence);
  if (evidence) sp.set("evidencia", evidence);
  if (opp.lineId) sp.set("linea", opp.lineId);
  if (opp.stageId) sp.set("etapa", opp.stageId);
  if (opp.metricId) sp.set("metrica", opp.metricId);
  sp.set("desde", "tia");
  return `/programas/${programId}/problemas/nuevo?${sp.toString()}`;
}

export interface ProblemPrefill {
  title: string | null;
  evidence: string | null;
  lineId: string | null;
  stageId: string | null;
}

/**
 * Lee `titulo`, `evidencia`, `linea` y `etapa` de la URL de "Nuevo problema":
 * recorta los textos y solo acepta línea y etapa que existan en el programa.
 * Si la etapa es de otra línea que la pedida, se descarta la etapa.
 */
export function parseProblemPrefill(
  sp: Record<string, string | string[] | undefined>,
  refs: Pick<OpportunityRefs, "lines" | "stages">,
): ProblemPrefill {
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  };
  const title = cleanText(one("titulo"), PROBLEM_PREFILL_LIMITS.title);
  const evidence = cleanText(one("evidencia"), PROBLEM_PREFILL_LIMITS.evidence);
  const lineRaw = one("linea");
  const stageRaw = one("etapa");
  let lineId = lineRaw && refs.lines.some((l) => l.id === lineRaw) ? lineRaw : null;
  const stage = stageRaw ? (refs.stages.find((s) => s.id === stageRaw) ?? null) : null;
  let stageId: string | null = stage?.id ?? null;
  if (stage && lineId && stage.line_id !== lineId) stageId = null;
  if (stage && !lineId) lineId = stage.line_id;
  return { title, evidence, lineId, stageId };
}

// ---------------------------------------------------------------------------
// 2. La Tía le explica los números
// ---------------------------------------------------------------------------

export const EXPLAIN_WEEKS = 8;

export const EXPLAIN_TASK = `Explíquele a la persona, en máximo 150 palabras, por qué se movió la métrica que está mirando en las últimas semanas.
Use los datos de abajo: valores semanales frente al camino esperado hacia la meta ("esperado"), los ejercicios de la línea que corrieron o se cerraron en el periodo y los picos o congelamientos del calendario.
- Diga primero, en una frase, cómo va frente a la meta (con la cifra).
- Luego 2 o 3 viñetas con las posibles razones, cada una citando el dato (semana, ejercicio o evento). Si no hay nada que explique el movimiento, dígalo con honestidad y diga qué dato falta.
- Cierre con UNA sugerencia de siguiente paso, empezando con "Siguiente paso:".
No afirme causalidad: un ejercicio o un pico "pudo influir", no "causó". Texto plano con viñetas "-"; sin títulos ni tablas.`;

export interface ExplainMetricInput {
  today: IsoDate;
  programStart: IsoDate | null;
  metric: {
    name: string;
    type: string;
    unit: string | null;
    direction: MetricDirection;
    baseline: number | null;
    line_name: string;
    targets: { horizon_id: string; target: number }[];
  };
  horizons: TargetHorizon[];
  values: { week_start: IsoDate; value: number; note?: string | null }[];
  experiments: {
    title: string;
    status: ExperimentStatus;
    metric_id: string;
    metric_name: string;
    planned_start: IsoDate | null;
    planned_end: IsoDate | null;
    actual_start: IsoDate | null;
    actual_end: IsoDate | null;
    decided_at: string | null;
    verdict: string | null;
    decision: string | null;
  }[];
  metricId: string;
  calendar: { type: CalendarEventType; name: string; start_date: IsoDate; end_date: IsoDate }[];
}

const round = (n: number | null | undefined, d = 2) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

/** Datos compactos para explicar una métrica: últimas semanas vs. camino a la meta, ejercicios y calendario del periodo. */
export function metricExplainData(input: ExplainMetricInput) {
  const sorted = [...input.values].sort((a, b) => a.week_start.localeCompare(b.week_start));
  const recent = sorted.slice(-EXPLAIN_WEEKS);
  const from = recent[0]?.week_start ?? addDays(input.today, -7 * EXPLAIN_WEEKS);
  const base = {
    baseline: input.metric.baseline,
    direction: input.metric.direction,
    targets: input.metric.targets,
    horizons: input.horizons,
    programStart: input.programStart,
  };
  const weeks = recent.map((v) => {
    const asOf = addDays(v.week_start, 6) < input.today ? addDays(v.week_start, 6) : input.today;
    const e = evaluateTarget({ ...base, values: sorted.filter((x) => x.week_start <= v.week_start), today: asOf });
    return {
      semana: v.week_start,
      valor: v.value,
      esperado: round(e.expected),
      brecha: round(e.gap, 3),
      nota: clip(v.note ?? null, 120),
    };
  });
  const now = evaluateTarget({ ...base, values: sorted, today: input.today });

  const inPeriod = input.experiments.filter((e) => {
    if (e.status === "idea" || e.status === "prioritized" || e.status === "in_design") return false;
    const start = e.actual_start ?? e.planned_start;
    const running = e.status === "in_test" || e.status === "in_reading";
    const end = e.actual_end ?? (running ? input.today : (e.decided_at?.slice(0, 10) ?? e.planned_end ?? start));
    if (!start || !end) return false;
    return rangesOverlap(start, end, from, input.today);
  });

  return {
    hoy: input.today,
    metrica: {
      nombre: input.metric.name,
      linea: input.metric.line_name,
      unidad: input.metric.unit,
      debe: input.metric.direction === "down" ? "bajar" : "subir",
      linea_base: input.metric.baseline,
    },
    frente_a_la_meta: {
      estado: TARGET_STATUS_LABEL[now.status],
      horizonte: now.horizonName,
      meta: now.target,
      ultimo_valor: now.latest,
      esperado_a_la_fecha: round(now.expected),
      brecha: round(now.gap, 3),
      nota: "brecha = diferencia relativa a favor frente al camino esperado (positivo = adelante)",
    },
    semanas: weeks,
    ejercicios_de_la_linea_en_el_periodo: inPeriod.slice(0, 15).map((e) => ({
      titulo: clip(e.title, 120),
      estado: e.status,
      apunta_a_esta_metrica: e.metric_id === input.metricId,
      metrica: e.metric_name,
      inicio: e.actual_start ?? e.planned_start,
      fin: e.actual_end ?? e.planned_end,
      veredicto: e.verdict,
      decision: e.decision,
    })),
    calendario_del_periodo: input.calendar
      .filter((c) => rangesOverlap(c.start_date, c.end_date, from, addDays(input.today, 30)))
      .slice(0, 10)
      .map((c) => ({ tipo: c.type, nombre: c.name, inicio: c.start_date, fin: c.end_date })),
  };
}

// ---------------------------------------------------------------------------
// 3. La Tía le prepara el comité
// ---------------------------------------------------------------------------

export const COMMITTEE_BRIEF_MAX = 12000;

export const COMMITTEE_TASK = `Prepare la narrativa para leer en voz alta en el comité de dirección, de unas 250 palabras, con base SOLO en el resumen ejecutivo de abajo.
Orden: 1) dónde estamos (¿estamos creciendo?), 2) qué creció y qué cayó y por qué, 3) qué ganó, qué perdió y qué aprendimos, 4) cuánto vale, 5) qué decisiones necesitamos del comité, 6) próximos pasos.
- Párrafos cortos, cada uno con una etiqueta en negrita al inicio (p. ej. "**Dónde estamos.**").
- Use solo las cifras que aparecen en el resumen; si falta algo, dígalo ("todavía no hay ganadores con valor").
- Tono: de usted, cálido y profesional, con un toque paisa suave; nada de chistes en las cifras.
- No decida por el comité: presente las decisiones como preguntas u opciones.`;

/** Sistema para el comité: persona + tarea + el resumen como datos (texto). */
export function committeeContext(briefText: string): { resumen_ejecutivo: string } {
  return { resumen_ejecutivo: clip(briefText.replace(/\r\n/g, "\n"), COMMITTEE_BRIEF_MAX) ?? "" };
}

// ---------------------------------------------------------------------------
// 4. La Tía le tiene un chismecito (semanal)
// ---------------------------------------------------------------------------

export const GOSSIP_MAX_CHARS = 350;
export const GOSSIP_PREFIX = "Le tengo un chismecito:";
export const GOSSIP_TITLE = "La Tía le tiene un chismecito";

export const GOSSIP_TASK = `Con el resumen semanal de abajo, cuéntele al equipo UN solo chismecito: el hallazgo más jugoso y útil de la semana (una métrica que se disparó o se cayó frente a la meta, un ejercicio que cambió de estado, ideas que llevan mucho quietas o un congelamiento que se viene).
- Empiece exactamente con "${GOSSIP_PREFIX}".
- Máximo ${GOSSIP_MAX_CHARS} caracteres en total, una o dos frases, con la cifra o el nombre que lo respalda y una pista de qué hacer.
- Texto plano: sin comillas, sin viñetas, sin emojis.`;

/** Semana ISO de una fecha, p. ej. "2026-W39". */
export function isoWeekKey(date: IsoDate): string {
  const d = parseIsoDate(date);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const thursday = new Date(d.getTime());
  thursday.setUTCDate(d.getUTCDate() + 4 - dow);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function gossipDedupeKey(programId: string, today: IsoDate): string {
  return `gossip:${programId}:${isoWeekKey(today)}`;
}

/** Deja el chismecito listo para el aviso: una sola línea, con el saludo y ≤ 350 caracteres. */
export function cleanGossip(text: string): string | null {
  let t = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“'«]+|["”'»]+$/g, "")
    .trim();
  if (!t) return null;
  if (!normalizeName(t).startsWith(normalizeName(GOSSIP_PREFIX))) t = `${GOSSIP_PREFIX} ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
  if (t.length > GOSSIP_MAX_CHARS) {
    const cut = t.slice(0, GOSSIP_MAX_CHARS - 1);
    const space = cut.lastIndexOf(" ");
    t = `${(space > GOSSIP_MAX_CHARS * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
  }
  return t;
}

export interface GossipInput {
  today: IsoDate;
  program: { name: string; start_date: IsoDate | null };
  horizons: TargetHorizon[];
  northStars: {
    line_name: string;
    name: string;
    unit: string | null;
    direction: MetricDirection;
    baseline: number | null;
    targets: { horizon_id: string; target: number }[];
    values: { week_start: IsoDate; value: number }[];
  }[];
  experiments: { title: string; line_name: string; status: ExperimentStatus; status_changed_at: string }[];
  calendar: { type: CalendarEventType; name: string; start_date: IsoDate; end_date: IsoDate }[];
  staleDays?: number;
}

/** Resumen semanal pequeño para el chismecito (no manda textos largos ni datos personales). */
export function gossipFacts(input: GossipInput) {
  const staleDays = input.staleDays ?? 30;
  const weekAgo = addDays(input.today, -7);
  const northStars = input.northStars.map((n) => {
    const values = [...n.values].sort((a, b) => a.week_start.localeCompare(b.week_start));
    const e = evaluateTarget({
      baseline: n.baseline,
      direction: n.direction,
      targets: n.targets,
      horizons: input.horizons,
      values,
      today: input.today,
      programStart: input.program.start_date,
    });
    return {
      linea: n.line_name,
      metrica: n.name,
      unidad: n.unit,
      debe: n.direction === "down" ? "bajar" : "subir",
      ultimas_semanas: values.slice(-4).map((v) => [v.week_start, v.value]),
      frente_a_la_meta: TARGET_STATUS_LABEL[e.status],
      esperado_a_la_fecha: round(e.expected),
      meta: e.target,
      brecha: round(e.gap, 3),
    };
  });
  const changed = input.experiments
    .filter((e) => e.status_changed_at.slice(0, 10) >= weekAgo)
    .slice(0, 10)
    .map((e) => ({ titulo: clip(e.title, 100), linea: e.line_name, estado_nuevo: e.status, desde: e.status_changed_at.slice(0, 10) }));
  const stale = input.experiments.filter(
    (e) => (e.status === "idea" || e.status === "prioritized") && daysBetween(e.status_changed_at.slice(0, 10), input.today) >= staleDays,
  );
  const freezes = input.calendar
    .filter((c) => c.type === "freeze" && c.end_date >= input.today && c.start_date <= addDays(input.today, 21))
    .slice(0, 3)
    .map((c) => ({ nombre: c.name, inicio: c.start_date, fin: c.end_date }));
  return {
    hoy: input.today,
    programa: input.program.name,
    metricas_norte: northStars,
    ejercicios_que_cambiaron_de_estado_esta_semana: changed,
    ideas_quietas: { cuantas: stale.length, dias_minimos: staleDays, ejemplos: stale.slice(0, 3).map((e) => clip(e.title, 80)) },
    congelamientos_que_se_vienen: freezes,
  };
}

export type GossipFacts = ReturnType<typeof gossipFacts>;

/** ¿Hay algo que contar? Si no, no se gasta una consulta. */
export function hasGossipMaterial(f: GossipFacts): boolean {
  return (
    f.metricas_norte.some((n) => n.ultimas_semanas.length > 0) ||
    f.ejercicios_que_cambiaron_de_estado_esta_semana.length > 0 ||
    f.ideas_quietas.cuantas > 0 ||
    f.congelamientos_que_se_vienen.length > 0
  );
}
