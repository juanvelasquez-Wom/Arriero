// La Tía copiloto: lógica pura de la conversación que arma proyectos y pilotos
// y recibe avances. La conversación la lleva el código (preguntas, botones y
// resúmenes con plantillas, cero tokens); Claude solo se usa para entender un
// mensaje libre (Haiku) o para opinar sobre los datos (Sonnet).
import { addDays, weekStart } from "./dates";
import { DEFAULT_STAGES, TELCO_TEMPLATES } from "./growth-templates";
import { IMPACT_LABEL, STATUS_LABEL } from "./labels";
import { TRANSITIONS } from "./lifecycle";
import { PILOT_STATUS_LABEL, PILOT_TEST_TYPE_LABEL } from "./pilots/labels";
import { PILOT_TEST_TYPES, type PilotStatus, type PilotTestType } from "./pilots/types";
import { addMonths, CUSTOM_LINE_KEY, QUICK_DURATIONS, quickProgramEnd, suggestProgramName, type QuickDuration } from "./quick-start";
import { normalizeText } from "./search";
import { isSkip, parseDateEs, parseNumberEs, parseWeekEs, parseYesNo } from "./tia-parse";
import { IMPACT_LEVELS, type ExperimentStatus, type ImpactLevel, type IsoDate } from "./types";

// ---------------------------------------------------------------------------
// Estado

export const COPILOT_MODES = ["project", "pilot", "update"] as const;
export type CopilotMode = (typeof COPILOT_MODES)[number];

export const UPDATE_KINDS = [
  "opportunity",
  "experiment_note",
  "experiment_move",
  "metric_value",
  "pilot_incident",
  "pilot_start",
  "pilot_reading",
] as const;
export type UpdateKind = (typeof UPDATE_KINDS)[number];

/** Estados a los que La Tía puede mover un ejercicio (decidir exige el diálogo con aprendizaje). */
export const COPILOT_MOVES = ["prioritized", "in_design", "in_test", "in_reading", "discarded"] as const satisfies readonly ExperimentStatus[];
export type CopilotMove = (typeof COPILOT_MOVES)[number];

export type RefKind = "program" | "experiment" | "metric" | "pilot";

/** Algo del sistema que la persona puede nombrar en un avance. `ref` es corto (E3) para gastar menos tokens. */
export interface RefItem {
  ref: string;
  kind: RefKind;
  id: string;
  label: string;
  programId?: string | null;
  programName?: string | null;
  status?: string | null;
}

export interface ProjectDraft {
  lines?: { k: string; n?: string | null }[];
  months?: QuickDuration;
  startDate?: IsoDate;
  calendar?: boolean;
  name?: string;
  oppText?: string;
  oppStage?: string;
  oppImpact?: ImpactLevel;
}

export interface PilotDraft {
  problem?: string;
  evidence?: string;
  change?: string;
  metric?: string;
  expectedPct?: number;
  channels?: string[];
  testType?: PilotTestType;
  plannedStart?: IsoDate;
  plannedEnd?: IsoDate;
  budgetCop?: number;
  title?: string;
}

export interface UpdateTarget {
  id: string;
  kind: RefKind;
  label: string;
  programId?: string | null;
  status?: string | null;
}

export interface UpdateDraft {
  kind?: UpdateKind;
  target?: UpdateTarget;
  lineId?: string;
  stage?: string;
  title?: string;
  text?: string;
  to?: CopilotMove;
  value?: number;
  week?: IsoDate;
  date?: IsoDate;
  impact?: ImpactLevel;
}

export interface CreatedRef {
  kind: "program" | "pilot" | "experiment" | "problem";
  id: string;
  label: string;
  href: string;
  programId?: string | null;
}

export interface CopilotState {
  v: 1;
  mode: CopilotMode | null;
  project: ProjectDraft;
  pilot: PilotDraft;
  update: UpdateDraft;
  /** Campo que La Tía acaba de preguntar ("__advice" = espera una pregunta para opinar). */
  asked: string | null;
  skipped: string[];
  confirming: boolean;
  /** Lo último que La Tía creó o actualizó (para "¿qué opina?"). */
  last: CreatedRef | null;
}

export function emptyCopilotState(): CopilotState {
  return { v: 1, mode: null, project: {}, pilot: {}, update: {}, asked: null, skipped: [], confirming: false, last: null };
}

// ---------------------------------------------------------------------------
// Lo que La Tía muestra

export type ChipAction =
  | { t: "set"; field: string; value: unknown }
  | { t: "skip"; field: string }
  | { t: "mode"; mode: CopilotMode }
  | { t: "update"; kind: UpdateKind; target?: UpdateTarget }
  | { t: "commit" }
  | { t: "edit" }
  | { t: "reset" }
  | { t: "advice"; about?: "last" };

export interface Chip {
  label: string;
  action: ChipAction;
  primary?: boolean;
}

export interface SummaryRow {
  label: string;
  value: string;
}

export interface TiaOut {
  text: string;
  chips?: Chip[];
  summary?: SummaryRow[];
  links?: { label: string; href: string }[];
  tone?: "ok" | "warn";
}

/** Lo que el servidor le pasa a la lógica para armar preguntas y botones. */
export interface CopilotContext {
  today: IsoDate;
  canCreateProject: boolean;
  canCreatePilot: boolean;
  /** Nombres de medios del catálogo de Pilotos. */
  channels: string[];
  refs: RefItem[];
  /** Líneas y etapas del programa del avance (oportunidad de mejora). */
  lines: { id: string; name: string }[];
  stages: string[];
}

export const ADVICE_FIELD = "__advice";

// ---------------------------------------------------------------------------
// Campos

type FieldKind = "text" | "long" | "date" | "week" | "number" | "percent" | "months" | "yesno" | "lines" | "channels" | "enum" | "ref" | "line";

interface FieldSpec {
  key: string;
  kind: FieldKind;
  /** Obligatorio para poder crear. */
  required: boolean;
  min?: number;
  question: (s: CopilotState, c: CopilotContext) => string;
  chips?: (s: CopilotState, c: CopilotContext) => Chip[];
  /** ¿Aplica ahora? (por defecto sí) */
  when?: (s: CopilotState) => boolean;
  options?: (s: CopilotState, c: CopilotContext) => { value: string; label: string; aliases?: string[] }[];
  refKinds?: RefKind[];
}

const set = (field: string, value: unknown, label: string, primary = false): Chip => ({ label, action: { t: "set", field, value }, primary });
const skip = (field: string, label = "Después"): Chip => ({ label, action: { t: "skip", field } });

const LINE_OPTIONS = [...TELCO_TEMPLATES.map((t) => ({ k: t.key, label: t.name })), { k: CUSTOM_LINE_KEY, label: "Otra línea" }];
const LINE_ALIASES: Record<string, string[]> = {
  pospago: ["pospago", "postpago", "plan", "planes"],
  portabilidad: ["portabilidad", "porta", "portar", "portados"],
  recargas: ["recarga", "recargas", "prepago", "paquete", "paquetes"],
  equipos: ["equipo", "equipos", "celular", "celulares", "terminal", "terminales", "smartphone"],
};

const IMPACT_OPTIONS = IMPACT_LEVELS.map((v) => ({ value: v, label: IMPACT_LABEL[v], aliases: v === "high" ? ["alto", "alta", "mucho", "grave"] : v === "medium" ? ["medio", "media", "regular"] : ["bajo", "baja", "poco"] }));

const TEST_TYPE_ALIASES: Record<PilotTestType, string[]> = {
  ab_creative: ["creatividad", "creatividades", "creativo", "piezas", "anuncios"],
  ab_platform: ["plataforma", "a/b", "ab", "split"],
  holdout: ["holdout", "sin anuncios", "grupo de control", "apagado"],
  geo: ["geo", "ciudad", "ciudades", "region", "regiones", "geografia"],
  pre_post: ["antes", "despues", "pre", "post"],
};

const MOVE_ALIASES: Record<CopilotMove, string[]> = {
  prioritized: ["priorizado", "priorizar", "prioridad"],
  in_design: ["diseno", "disenando"],
  in_test: ["prueba", "probando", "arranco", "lanzamos", "lanzado", "en vivo", "salio"],
  in_reading: ["lectura", "leer", "termino", "acabo", "cerro la prueba"],
  discarded: ["descartar", "descartado", "matar", "apagar", "no va"],
};

const UPDATE_KIND_LABEL: Record<UpdateKind, string> = {
  opportunity: "Una oportunidad de mejora nueva",
  experiment_note: "Una novedad de un ejercicio",
  experiment_move: "Mover un ejercicio de estado",
  metric_value: "El número de la semana",
  pilot_incident: "Una novedad de un piloto",
  pilot_start: "Arrancó un piloto",
  pilot_reading: "Terminó un piloto",
};

const REF_KIND_FOR: Record<UpdateKind, RefKind> = {
  opportunity: "program",
  experiment_note: "experiment",
  experiment_move: "experiment",
  metric_value: "metric",
  pilot_incident: "pilot",
  pilot_start: "pilot",
  pilot_reading: "pilot",
};

const refChips = (field: string, kinds: RefKind[], c: CopilotContext, filter?: (r: RefItem) => boolean): Chip[] =>
  c.refs
    .filter((r) => kinds.includes(r.kind) && (!filter || filter(r)))
    .slice(0, 6)
    .map((r) => set(field, r.ref, r.programName && r.kind !== "program" ? `${r.label} · ${r.programName}` : r.label));

const PROJECT_FIELDS: FieldSpec[] = [
  {
    key: "lines",
    kind: "lines",
    required: true,
    question: () => "¿Para qué línea de negocio es? Pospago, portabilidad, recargas, equipos… o dígame cuál. Pueden ser varias.",
    chips: () => TELCO_TEMPLATES.map((t) => set("lines", [{ k: t.key }], t.name)),
  },
  {
    key: "months",
    kind: "months",
    required: true,
    question: () => "¿Cuánto tiempo le damos? Seis meses es lo típico para alcanzar a probar, leer y escalar.",
    chips: () => [set("months", 3, "3 meses"), set("months", 6, "6 meses", true), set("months", 12, "12 meses")],
  },
  {
    key: "startDate",
    kind: "date",
    required: true,
    question: () => "¿Desde cuándo arranca?",
    chips: (_s, c) => [set("startDate", c.today, "Hoy", true), set("startDate", nextMonday(c.today), "El próximo lunes"), set("startDate", firstOfNextMonth(c.today), "El 1 del otro mes")],
  },
  {
    key: "calendar",
    kind: "yesno",
    required: true,
    question: () => "¿Le pongo el calendario típico de telco? Black Friday, diciembre y los congelamientos, para que nadie lance nada en plena temporada.",
    chips: () => [set("calendar", true, "Sí, póngalo", true), set("calendar", false, "No, lo pongo yo")],
  },
  {
    key: "name",
    kind: "text",
    required: false,
    min: 3,
    question: () => "¿Cómo lo bautizamos? Si quiere, le pongo yo el nombre.",
    chips: () => [skip("name", "Póngaselo usted, Tía")],
  },
  {
    key: "oppText",
    kind: "long",
    required: false,
    min: 10,
    question: () =>
      "Última y nos vamos: ¿ya sabe dónde se está perdiendo valor? Cuénteme la oportunidad de mejora con su dato («el 40 % abandona en el pago, según GA de agosto») y la dejo registrada.",
    chips: () => [skip("oppText", "Después la registro")],
  },
  {
    key: "oppStage",
    kind: "enum",
    required: false,
    when: (s) => !!s.project.oppText,
    question: () => "¿En qué etapa del embudo pasa eso?",
    options: () => DEFAULT_STAGES.map((st) => ({ value: st, label: st })),
    chips: () => DEFAULT_STAGES.map((st) => set("oppStage", st, st)),
  },
  {
    key: "oppImpact",
    kind: "enum",
    required: false,
    when: (s) => !!s.project.oppText,
    question: () => "¿Y qué tanto duele?",
    options: () => IMPACT_OPTIONS,
    chips: () => IMPACT_LEVELS.map((v) => set("oppImpact", v, IMPACT_LABEL[v], v === "medium")),
  },
];

const PILOT_FIELDS: FieldSpec[] = [
  {
    key: "problem",
    kind: "long",
    required: true,
    min: 10,
    question: () => "¿Qué oportunidad de mejora quiere atacar? Cuénteme qué está pasando, como se lo contaría a un compañero.",
  },
  {
    key: "evidence",
    kind: "long",
    required: false,
    min: 5,
    question: () => "¿Con qué dato lo sabe? Un número, un reporte, lo que tenga. Sin dato, la mula no arranca… pero se puede conseguir después.",
    chips: () => [skip("evidence", "No lo tengo aún")],
  },
  {
    key: "change",
    kind: "long",
    required: false,
    min: 5,
    question: () => "¿Qué cambio quiere probar? Por ejemplo: «anuncios de clic a WhatsApp en vez de mandar a la landing».",
    chips: () => [skip("change", "Todavía no sé")],
  },
  {
    key: "metric",
    kind: "text",
    required: false,
    min: 2,
    question: () => "¿Qué métrica debería moverse si funciona?",
    chips: () => ["Ventas", "Leads", "Costo por venta", "Tasa de conversión"].map((m) => set("metric", m, m)),
  },
  {
    key: "expectedPct",
    kind: "percent",
    required: false,
    question: () => "¿Cuánto espera que mejore? Con eso calculo si el piloto alcanza a mostrar algo.",
    chips: () => [set("expectedPct", 5, "+5 %"), set("expectedPct", 10, "+10 %", true), set("expectedPct", 20, "+20 %"), skip("expectedPct", "No sé")],
  },
  {
    key: "channels",
    kind: "channels",
    required: false,
    question: () => "¿En qué medios corre?",
    chips: (_s, c) => [...c.channels.slice(0, 6).map((ch) => set("channels", [ch], ch)), skip("channels", "Todavía no sé")],
  },
  {
    key: "testType",
    kind: "enum",
    required: false,
    question: () => "¿Cómo lo medimos? Si no sabe, yo le recomiendo.",
    options: () => PILOT_TEST_TYPES.map((t) => ({ value: t, label: PILOT_TEST_TYPE_LABEL[t], aliases: TEST_TYPE_ALIASES[t] })),
    chips: (s) => [
      set("testType", recommendTestType(s.pilot).type, "Recomiéndeme, Tía", true),
      ...PILOT_TEST_TYPES.map((t) => set("testType", t, PILOT_TEST_TYPE_LABEL[t])),
    ],
  },
  {
    key: "plannedStart",
    kind: "date",
    required: false,
    question: () => "¿Cuándo quiere arrancar? (Fuera de congelamientos, si puede)",
    chips: (_s, c) => [set("plannedStart", nextMonday(c.today), "El próximo lunes", true), set("plannedStart", nextMonday(addDays(c.today, 7)), "En dos semanas"), skip("plannedStart", "Todavía no sé")],
  },
  {
    key: "plannedEnd",
    kind: "date",
    required: false,
    when: (s) => !!s.pilot.plannedStart,
    question: () => "¿Hasta cuándo corre? Menos de cuatro semanas casi nunca alcanza para leer algo serio.",
    chips: (s) => {
      const start = s.pilot.plannedStart as IsoDate;
      return [set("plannedEnd", addDays(start, 27), "4 semanas", true), set("plannedEnd", addDays(start, 41), "6 semanas"), set("plannedEnd", addDays(start, 55), "8 semanas")];
    },
  },
  {
    key: "budgetCop",
    kind: "number",
    required: false,
    question: () => "¿Cuánta plata tiene para el piloto, en pesos?",
    chips: () => [skip("budgetCop", "Todavía no sé")],
  },
  {
    key: "title",
    kind: "text",
    required: true,
    min: 5,
    question: () => "¿Cómo le ponemos al piloto?",
    chips: (s) => [set("title", suggestPilotTitle(s.pilot), `«${suggestPilotTitle(s.pilot)}»`, true)],
  },
];

const hasTarget = (s: CopilotState) => !!s.update.target;
const kindIs = (...kinds: UpdateKind[]) => (s: CopilotState) => !!s.update.kind && kinds.includes(s.update.kind) && hasTarget(s);

const UPDATE_FIELDS: FieldSpec[] = [
  {
    key: "kind",
    kind: "enum",
    required: true,
    question: () => "¿Qué me quiere contar?",
    options: () => UPDATE_KINDS.map((k) => ({ value: k, label: UPDATE_KIND_LABEL[k] })),
    chips: () => UPDATE_KINDS.map((k) => set("kind", k, UPDATE_KIND_LABEL[k])),
  },
  {
    key: "target",
    kind: "ref",
    required: true,
    when: (s) => !!s.update.kind,
    question: (s) =>
      ({
        program: "¿En qué programa?",
        experiment: "¿De qué ejercicio?",
        metric: "¿Qué métrica?",
        pilot: "¿De qué piloto?",
      })[REF_KIND_FOR[s.update.kind as UpdateKind]],
    chips: (s, c) => {
      const kind = s.update.kind as UpdateKind;
      const filter: ((r: RefItem) => boolean) | undefined =
        kind === "pilot_start"
          ? (r) => r.status === "approved"
          : kind === "pilot_reading"
            ? (r) => r.status === "in_test"
            : kind === "pilot_incident"
              ? (r) => r.status === "in_test" || r.status === "approved"
              : kind === "experiment_move"
                ? (r) => movesFrom(r.status).length > 0
                : undefined;
      return refChips("target", [REF_KIND_FOR[kind]], c, filter);
    },
  },
  // Oportunidad de mejora
  {
    key: "lineId",
    kind: "line",
    required: true,
    when: (s) => kindIs("opportunity")(s),
    question: () => "¿En qué línea?",
    chips: (_s, c) => c.lines.slice(0, 6).map((l) => set("lineId", l.id, l.name)),
  },
  {
    key: "stage",
    kind: "enum",
    required: true,
    when: (s) => kindIs("opportunity")(s) && !!s.update.lineId,
    question: () => "¿En qué etapa del embudo?",
    options: (_s, c) => (c.stages.length ? c.stages : [...DEFAULT_STAGES]).map((st) => ({ value: st, label: st })),
    chips: (_s, c) => (c.stages.length ? c.stages : [...DEFAULT_STAGES]).map((st) => set("stage", st, st)),
  },
  {
    key: "text",
    kind: "long",
    required: true,
    min: 10,
    when: kindIs("opportunity"),
    question: () => "Cuénteme qué pasa y con qué dato lo sabe. Sin evidencia es chisme, no oportunidad.",
  },
  {
    key: "impact",
    kind: "enum",
    required: true,
    when: kindIs("opportunity", "pilot_incident"),
    question: (s) => (s.update.kind === "pilot_incident" ? "¿Qué tanto puede afectar la lectura?" : "¿Qué tanto duele?"),
    options: () => IMPACT_OPTIONS,
    chips: () => IMPACT_LEVELS.map((v) => set("impact", v, IMPACT_LABEL[v], v === "medium")),
  },
  // Novedad de ejercicio o de piloto
  {
    key: "text",
    kind: "long",
    required: true,
    min: 5,
    when: kindIs("experiment_note", "pilot_incident"),
    question: (s) => (s.update.kind === "pilot_incident" ? "¿Qué pasó? (se cayó el píxel, cambió el precio, se agotó el equipo…)" : "Cuénteme la novedad y la dejo en la conversación del ejercicio."),
  },
  {
    key: "to",
    kind: "enum",
    required: true,
    when: kindIs("experiment_move"),
    question: (s) => `Está en «${STATUS_LABEL[(s.update.target?.status ?? "idea") as ExperimentStatus] ?? "?"}». ¿A dónde lo paso?`,
    options: (s) => movesFrom(s.update.target?.status).map((m) => ({ value: m, label: STATUS_LABEL[m], aliases: MOVE_ALIASES[m] })),
    chips: (s) => movesFrom(s.update.target?.status).map((m) => set("to", m, STATUS_LABEL[m])),
  },
  // Número de la semana
  {
    key: "value",
    kind: "number",
    required: true,
    when: kindIs("metric_value"),
    question: () => "¿Cuánto dio?",
  },
  {
    key: "week",
    kind: "week",
    required: true,
    when: kindIs("metric_value"),
    question: () => "¿De qué semana?",
    chips: (_s, c) => [set("week", weekStart(c.today), "Esta semana", true), set("week", weekStart(addDays(c.today, -7)), "La semana pasada")],
  },
  // Fechas de pilotos
  {
    key: "date",
    kind: "date",
    required: true,
    when: kindIs("pilot_incident", "pilot_start", "pilot_reading"),
    question: (s) => (s.update.kind === "pilot_start" ? "¿Qué día arrancó?" : s.update.kind === "pilot_reading" ? "¿Qué día terminó?" : "¿Qué día pasó?"),
    chips: (_s, c) => [set("date", c.today, "Hoy", true), set("date", addDays(c.today, -1), "Ayer")],
  },
];

const FIELDS: Record<CopilotMode, FieldSpec[]> = { project: PROJECT_FIELDS, pilot: PILOT_FIELDS, update: UPDATE_FIELDS };

export function movesFrom(status: string | null | undefined): CopilotMove[] {
  const next = TRANSITIONS[(status ?? "idea") as ExperimentStatus] ?? [];
  return COPILOT_MOVES.filter((m) => next.includes(m));
}

function draftOf(s: CopilotState, mode: CopilotMode): Record<string, unknown> {
  return (mode === "project" ? s.project : mode === "pilot" ? s.pilot : s.update) as Record<string, unknown>;
}

function isFilled(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function relevant(mode: CopilotMode, s: CopilotState): FieldSpec[] {
  return FIELDS[mode].filter((f) => !f.when || f.when(s));
}

/** Siguiente campo que falta y no se saltó. */
export function nextField(s: CopilotState): FieldSpec | null {
  if (!s.mode) return null;
  const draft = draftOf(s, s.mode);
  return relevant(s.mode, s).find((f) => !isFilled(draft[f.key]) && !s.skipped.includes(f.key)) ?? null;
}

/** ¿Ya se puede crear o guardar? (los obligatorios están). */
export function canCommit(s: CopilotState): boolean {
  if (!s.mode) return false;
  const draft = draftOf(s, s.mode);
  return relevant(s.mode, s).every((f) => !f.required || isFilled(draft[f.key]));
}

export function fieldSpec(s: CopilotState, key: string): FieldSpec | null {
  if (!s.mode) return null;
  return relevant(s.mode, s).find((f) => f.key === key) ?? FIELDS[s.mode].find((f) => f.key === key) ?? null;
}

// ---------------------------------------------------------------------------
// Entender respuestas sin Claude

export type LocalAnswer = { ok: true; value: unknown } | { ok: false; reason: "skip" } | { ok: false; reason: "short"; message: string } | null;

/** Intenta entender la respuesta a la pregunta `spec` sin llamar a Claude. Null = no se entendió. */
export function localAnswer(spec: FieldSpec, message: string, s: CopilotState, c: CopilotContext): LocalAnswer {
  const text = message.trim();
  if (!text) return null;
  if (!spec.required && isSkip(text)) return { ok: false, reason: "skip" };
  switch (spec.kind) {
    case "text":
    case "long": {
      if (text.length < (spec.min ?? 1)) return { ok: false, reason: "short", message: "Cuénteme un poquito más, que con eso no me alcanza." };
      return { ok: true, value: text.slice(0, spec.kind === "text" ? 160 : 4000) };
    }
    case "date": {
      const d = parseDateEs(text, c.today);
      return d ? { ok: true, value: d } : null;
    }
    case "week": {
      const w = parseWeekEs(text, c.today);
      return w ? { ok: true, value: w } : null;
    }
    case "number":
    case "percent": {
      const n = parseNumberEs(text);
      return n == null ? null : { ok: true, value: n };
    }
    case "months": {
      const n = parseNumberEs(text);
      const months = n == null ? (/\bano\b/.test(normalizeText(text)) ? 12 : /\bsemestre\b/.test(normalizeText(text)) ? 6 : /\btrimestre\b/.test(normalizeText(text)) ? 3 : null) : n;
      return months != null && (QUICK_DURATIONS as readonly number[]).includes(months) ? { ok: true, value: months } : null;
    }
    case "yesno": {
      const yn = parseYesNo(text);
      return yn ? { ok: true, value: yn === "yes" } : null;
    }
    case "lines": {
      const lines = matchLines(text);
      return lines.length ? { ok: true, value: lines } : null;
    }
    case "channels": {
      const matched = matchChannels(text, c.channels);
      return matched.length ? { ok: true, value: matched } : null;
    }
    case "enum": {
      const options = spec.options?.(s, c) ?? [];
      const hit = matchOption(text, options);
      return hit ? { ok: true, value: hit } : null;
    }
    case "ref": {
      const kind = s.update.kind ? REF_KIND_FOR[s.update.kind] : null;
      const hit = kind ? matchRef(text, c.refs.filter((r) => r.kind === kind)) : null;
      return hit ? { ok: true, value: hit.ref } : null;
    }
    case "line": {
      const hit = matchOption(text, c.lines.map((l) => ({ value: l.id, label: l.name })));
      return hit ? { ok: true, value: hit } : null;
    }
  }
}

export function matchLines(text: string): { k: string; n?: string | null }[] {
  const t = normalizeText(text);
  const found = Object.entries(LINE_ALIASES)
    .filter(([, aliases]) => aliases.some((a) => new RegExp(`\\b${a}\\b`).test(t)))
    .map(([k]) => ({ k }));
  if (found.length) return found;
  // Una línea que no es de las plantillas: se toma el nombre tal cual (corto).
  const clean = text.trim().replace(/^(la|una|de|para)\s+/i, "");
  return clean.length >= 2 && clean.length <= 60 && clean.split(/\s+/).length <= 6 ? [{ k: CUSTOM_LINE_KEY, n: clean }] : [];
}

export function matchChannels(text: string, catalog: string[]): string[] {
  const t = normalizeText(text);
  const inCatalog = catalog.filter((ch) => {
    const n = normalizeText(ch);
    return t.includes(n) || n.split(/\s+/).some((w) => w.length >= 4 && new RegExp(`\\b${w}\\b`).test(t));
  });
  if (inCatalog.length) return inCatalog.slice(0, 10);
  return text
    .split(/,|\sy\s|\//)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2 && p.length <= 60)
    .slice(0, 10);
}

export function matchOption(text: string, options: { value: string; label: string; aliases?: string[] }[]): string | null {
  const t = normalizeText(text);
  const exact = options.find((o) => normalizeText(o.label) === t || o.value === text.trim());
  if (exact) return exact.value;
  const hits = options.filter((o) => t.includes(normalizeText(o.label)) || (o.aliases ?? []).some((a) => new RegExp(`\\b${normalizeText(a).replace(/[/]/g, "\\/")}\\b`).test(t)));
  return hits.length === 1 ? hits[0].value : null;
}

/** Busca la referencia que mejor coincide con lo que escribió la persona; null si no hay una clara. */
export function matchRef(text: string, refs: RefItem[]): RefItem | null {
  const direct = refs.find((r) => r.ref.toLowerCase() === text.trim().toLowerCase());
  if (direct) return direct;
  const words = normalizeText(text)
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  if (!words.length) return null;
  const scored = refs
    .map((r) => {
      const label = normalizeText(r.label);
      const hits = words.filter((w) => label.includes(w)).length;
      return { r, score: hits / Math.max(1, Math.min(words.length, label.split(/\s+/).length)) };
    })
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[1].score === scored[0].score) return null;
  return scored[0].r;
}

// ---------------------------------------------------------------------------
// Aplicar valores (de botones, del intérprete local o de Claude) con validación

/** Aplica un valor a un campo del borrador activo. Devuelve null si el valor no sirve. */
export function applyValue(s: CopilotState, field: string, raw: unknown, c: CopilotContext): CopilotState | null {
  if (!s.mode) return null;
  const clean = cleanValue(s, field, raw, c);
  if (clean === undefined) return null;
  const next: CopilotState = { ...s, skipped: s.skipped.filter((k) => k !== field) };
  if (s.mode === "project") next.project = { ...s.project, [field]: clean };
  else if (s.mode === "pilot") next.pilot = { ...s.pilot, [field]: clean };
  else {
    next.update = { ...s.update, [field]: clean };
    // Cambiar el tipo de avance o el objetivo invalida lo que dependía de ellos.
    if (field === "kind" && s.update.kind !== clean) next.update = { kind: clean as UpdateKind, target: s.update.target && REF_KIND_FOR[clean as UpdateKind] === s.update.target.kind ? s.update.target : undefined };
    if (field === "target" && c.lines.length === 1 && s.update.kind === "opportunity") next.update.lineId = c.lines[0].id;
  }
  return next;
}

const str = (v: unknown, min: number, max: number) => (typeof v === "string" && v.trim().length >= min ? v.trim().slice(0, max) : undefined);
const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? (v as IsoDate) : undefined);
const num = (v: unknown, min: number, max: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseNumberEs(v) : null;
  return n != null && Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

function cleanValue(s: CopilotState, field: string, v: unknown, c: CopilotContext): unknown {
  if (s.mode === "project") {
    switch (field) {
      case "lines": {
        if (!Array.isArray(v)) return undefined;
        const keys = new Set(LINE_OPTIONS.map((o) => o.k));
        const lines = v
          .map((l) => (typeof l === "object" && l ? (l as { k?: unknown; n?: unknown }) : null))
          .filter((l): l is { k: string; n?: unknown } => !!l && typeof l.k === "string" && keys.has(l.k))
          .map((l) => ({ k: l.k, n: l.k === CUSTOM_LINE_KEY ? str(l.n, 2, 80) ?? null : null }))
          .filter((l) => l.k !== CUSTOM_LINE_KEY || l.n);
        const unique = [...new Map(lines.map((l) => [`${l.k}|${l.n ?? ""}`, l])).values()].slice(0, LINE_OPTIONS.length);
        return unique.length ? unique : undefined;
      }
      case "months":
        return (QUICK_DURATIONS as readonly number[]).includes(Number(v)) ? (Number(v) as QuickDuration) : undefined;
      case "startDate":
        return isoDate(v);
      case "calendar":
        return typeof v === "boolean" ? v : undefined;
      case "name":
        return str(v, 3, 120);
      case "oppText":
        return str(v, 10, 4000);
      case "oppStage":
        return (DEFAULT_STAGES as readonly string[]).includes(String(v)) ? String(v) : undefined;
      case "oppImpact":
        return (IMPACT_LEVELS as readonly string[]).includes(String(v)) ? (v as ImpactLevel) : undefined;
    }
    return undefined;
  }
  if (s.mode === "pilot") {
    switch (field) {
      case "problem":
        return str(v, 10, 4000);
      case "evidence":
      case "change":
        return str(v, 3, field === "change" ? 500 : 4000);
      case "metric":
        return str(v, 2, 200);
      case "expectedPct":
        return num(v, -100, 1000);
      case "channels":
      {
        const list = Array.isArray(v) ? v.map((x) => str(x, 2, 80)).filter((x): x is string => !!x).slice(0, 10) : [];
        return list.length ? list : undefined;
      }
      case "testType":
        return (PILOT_TEST_TYPES as readonly string[]).includes(String(v)) ? (v as PilotTestType) : undefined;
      case "plannedStart":
        return isoDate(v);
      case "plannedEnd": {
        const d = isoDate(v);
        return d && (!s.pilot.plannedStart || d >= s.pilot.plannedStart) ? d : undefined;
      }
      case "budgetCop":
        return num(v, 0, 1e13);
      case "title":
        return str(v, 5, 160);
    }
    return undefined;
  }
  switch (field) {
    case "kind":
      return (UPDATE_KINDS as readonly string[]).includes(String(v)) ? (v as UpdateKind) : undefined;
    case "target": {
      const want = s.update.kind ? REF_KIND_FOR[s.update.kind] : null;
      const ref = c.refs.find((r) => r.ref === v && (!want || r.kind === want));
      return ref ? ({ id: ref.id, kind: ref.kind, label: ref.label, programId: ref.programId ?? null, status: ref.status ?? null } satisfies UpdateTarget) : undefined;
    }
    case "lineId":
      return c.lines.some((l) => l.id === v) ? String(v) : undefined;
    case "stage": {
      const stages = c.stages.length ? c.stages : [...DEFAULT_STAGES];
      return stages.includes(String(v)) ? String(v) : undefined;
    }
    case "title":
      return str(v, 5, 240);
    case "text":
      return str(v, s.update.kind === "opportunity" ? 10 : 5, 4000);
    case "to":
      return movesFrom(s.update.target?.status).includes(v as CopilotMove) ? (v as CopilotMove) : undefined;
    case "value":
      return num(v, -1e13, 1e13);
    case "week": {
      const d = isoDate(v);
      return d ? weekStart(d) : undefined;
    }
    case "date":
      return isoDate(v);
    case "impact":
      return (IMPACT_LEVELS as readonly string[]).includes(String(v)) ? (v as ImpactLevel) : undefined;
  }
  return undefined;
}

/** Aplica lo que Claude entendió (un parche por campo); ignora lo que no valida. */
export function applyPatch(s: CopilotState, patch: Record<string, unknown>, c: CopilotContext): { state: CopilotState; applied: string[] } {
  let state = s;
  const applied: string[] = [];
  // El tipo de avance y el objetivo van primero: de ellos dependen los demás campos.
  const keys = Object.keys(patch).sort((a, b) => order(a) - order(b));
  for (const key of keys) {
    const next = applyValue(state, key, patch[key], c);
    if (next) {
      state = next;
      applied.push(key);
    }
  }
  return { state, applied };
}
const order = (k: string) => (k === "kind" ? 0 : k === "target" ? 1 : k === "lineId" ? 2 : 3);

// ---------------------------------------------------------------------------
// Detectar intención sin Claude (mensajes cortos y obvios)

export type QuickIntent = { mode: CopilotMode } | { advice: true } | null;

export function quickIntent(message: string): QuickIntent {
  const t = normalizeText(message);
  if (t.length > 70) return null;
  const create = /\b(crear|cree|creemos|nuevo|nueva|armar|arme|armemos|montar|monte|hacer|haga|quiero|empezar|arrancar)\b/.test(t);
  if (create && /\bpiloto\b/.test(t)) return { mode: "pilot" };
  if (create && /\b(proyecto|programa)\b/.test(t)) return { mode: "project" };
  if (/\b(avance|actualizar|actualizacion|novedad|contarle|reportar)\b/.test(t)) return { mode: "update" };
  if (/\?$/.test(message.trim()) && isAdviceLike(t)) return { advice: true };
  return null;
}

export function isAdviceLike(normalized: string): boolean {
  return /\b(que opina|opinion|consej|recomiend|interpret|como va|como vamos|por que|analic|analis|lectura|que hago|que haria|vale la pena|sirve|funciono|gano|esta bien)\b/.test(normalized);
}

/**
 * ¿Opinar con Sonnet o basta Haiku? Sonnet cuando hay que interpretar datos o
 * aconsejar; Haiku para dudas de cómo se usa algo o qué significa un término.
 */
export function adviceNeedsSmartModel(question: string, hasData: boolean): boolean {
  if (isHowTo(question)) return false;
  const t = normalizeText(question);
  return hasData || isAdviceLike(t) || t.length > 140;
}

/** Duda de cómo se usa la app o qué significa algo: no necesita datos ni Sonnet. */
export function isHowTo(question: string): boolean {
  const t = normalizeText(question).replace(/^[^a-z0-9]+/, "");
  return /^(como (hago|creo|cargo|registro|agrego|pongo|cambio|borro|uso|invito|subo)|donde (esta|queda|veo|encuentro)|que es|que significa|para que sirve)\b/.test(t);
}

// ---------------------------------------------------------------------------
// Qué dice La Tía

const MODE_INTRO: Record<CopilotMode, string> = {
  project: "¡Hágale pues! Armemos el proyecto de growth. Le voy preguntando y usted me va contando.",
  pilot: "¡Eso! Armemos el piloto. Le pregunto lo justo y yo lo monto.",
  update: "Cuénteme, que para eso estoy.",
};

export function startChips(c: CopilotContext): Chip[] {
  const chips: Chip[] = [];
  if (c.canCreateProject) chips.push({ label: "Crear un proyecto de growth", action: { t: "mode", mode: "project" } });
  if (c.canCreatePilot) chips.push({ label: "Crear un piloto de medios", action: { t: "mode", mode: "pilot" } });
  chips.push({ label: "Contarle un avance", action: { t: "mode", mode: "update" } });
  chips.push({ label: "Pedirle un consejo", action: { t: "advice" } });
  return chips;
}

/** Lo que dice La Tía después de cada paso: la siguiente pregunta o el resumen para confirmar. */
export function nextStep(s: CopilotState, c: CopilotContext, prefix?: string): { state: CopilotState; out: TiaOut } {
  if (!s.mode) return { state: s, out: { text: prefix ?? "¿En qué le ayudo?", chips: startChips(c) } };
  if (s.mode === "project" && !c.canCreateProject) {
    return {
      state: { ...s, mode: null, asked: null },
      out: { text: "Crear proyectos es cosa de un admin, y usted todavía no tiene esa llave. Pídale a un admin que lo cree; yo le ayudo con lo demás.", tone: "warn", chips: startChips(c) },
    };
  }
  if (s.mode === "pilot" && !c.canCreatePilot) {
    return {
      state: { ...s, mode: null, asked: null },
      out: { text: "Su rol en Pilotos es de lectura, así que no puedo crearlo a su nombre. Un aprobador le puede dar el rol de creador.", tone: "warn", chips: startChips(c) },
    };
  }
  const u = s.update;
  if (s.mode === "update" && u.kind === "experiment_move" && u.target && !movesFrom(u.target.status).length) {
    const href = u.target.programId ? `/programas/${u.target.programId}/ejercicios/${u.target.id}` : null;
    const decide = u.target.status === "in_reading";
    const last: CreatedRef | null = href ? { kind: "experiment", id: u.target.id, label: u.target.label, href, programId: u.target.programId } : s.last;
    return {
      state: { ...emptyCopilotState(), last },
      out: {
        text: decide
          ? `«${u.target.label}» está en lectura: lo que sigue es decidir, y eso se hace en el ejercicio, con el veredicto y el aprendizaje. Si quiere, antes le digo qué opino de los resultados.`
          : `«${u.target.label}» ya no se mueve desde aquí.`,
        links: href ? [{ label: decide ? "Ir a decidirlo" : "Abrir el ejercicio", href }] : undefined,
        chips: [...(decide && href ? [{ label: "¿Qué opina de los resultados?", action: { t: "advice", about: "last" } } satisfies Chip] : []), ...startChips(c)],
      },
    };
  }
  const field = nextField(s);
  if (field) {
    const chips = [...(field.chips?.(s, c) ?? [])];
    if (canCommit(s) && s.mode !== "update") chips.push({ label: "Créelo ya con lo que hay", action: { t: "commit" } });
    const q = field.question(s, c);
    return { state: { ...s, asked: field.key, confirming: false }, out: { text: prefix ? `${prefix}\n\n${q}` : q, chips } };
  }
  return confirmStep(s, c, prefix);
}

function confirmStep(s: CopilotState, c: CopilotContext, prefix?: string): { state: CopilotState; out: TiaOut } {
  const mode = s.mode as CopilotMode;
  const text =
    mode === "project" ? "Así quedaría el proyecto. ¿Lo creo?" : mode === "pilot" ? "Así quedaría el piloto (en borrador, para que lo revise antes de mandarlo). ¿Lo creo?" : "Esto es lo que voy a guardar. ¿Listo?";
  const commitLabel = mode === "update" ? "Guárdelo" : "Créelo, Tía";
  return {
    state: { ...s, asked: null, confirming: true },
    out: {
      text: prefix ? `${prefix}\n\n${text}` : text,
      summary: summarize(s, c),
      chips: [
        { label: commitLabel, action: { t: "commit" }, primary: true },
        { label: "Cambiar algo", action: { t: "edit" } },
        { label: "Cancelar", action: { t: "reset" } },
      ],
    },
  };
}

export function introFor(mode: CopilotMode): string {
  return MODE_INTRO[mode];
}

export function summarize(s: CopilotState, c: CopilotContext): SummaryRow[] {
  const rows: SummaryRow[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value) rows.push({ label, value });
  };
  if (s.mode === "project") {
    const p = s.project;
    const lines = (p.lines ?? []).map((l) => (l.k === CUSTOM_LINE_KEY ? l.n ?? "Otra" : LINE_OPTIONS.find((o) => o.k === l.k)?.label ?? l.k));
    push("Nombre", p.name ?? `${suggestProgramName(lines, p.startDate ?? c.today, p.months ?? 6)} (sugerido)`);
    push("Líneas", lines.join(", "));
    push("Fechas", p.startDate && p.months ? `${p.startDate} → ${quickProgramEnd(p.startDate, p.months)} (${p.months} meses)` : null);
    push("Calendario telco", p.calendar == null ? null : p.calendar ? "Sí (picos y congelamientos)" : "No");
    push("Oportunidad de mejora", p.oppText ? `${clipText(p.oppText, 140)}${p.oppStage ? ` · ${p.oppStage}` : ""}${p.oppImpact ? ` · impacto ${IMPACT_LABEL[p.oppImpact].toLowerCase()}` : ""}` : "Se registra después");
  } else if (s.mode === "pilot") {
    const p = s.pilot;
    push("Nombre", p.title);
    push("Oportunidad de mejora", p.problem && clipText(p.problem, 160));
    push("Evidencia", p.evidence && clipText(p.evidence, 120));
    push("Cambio a probar", p.change);
    push("Métrica", p.metric ? `${p.metric}${p.expectedPct != null ? ` (+${p.expectedPct} % esperado)` : ""}` : null);
    push("Medios", p.channels?.join(", "));
    push("Cómo se mide", p.testType && PILOT_TEST_TYPE_LABEL[p.testType]);
    push("Fechas", p.plannedStart ? `${p.plannedStart}${p.plannedEnd ? ` → ${p.plannedEnd}` : ""}` : null);
    push("Presupuesto", p.budgetCop != null ? `$ ${Math.round(p.budgetCop).toLocaleString("es-CO")}` : null);
  } else if (s.mode === "update") {
    const u = s.update;
    push("Qué", u.kind && UPDATE_KIND_LABEL[u.kind]);
    push(u.target?.kind === "program" ? "Programa" : u.target?.kind === "metric" ? "Métrica" : u.target?.kind === "pilot" ? "Piloto" : "Ejercicio", u.target?.label);
    push("Línea", u.lineId && c.lines.find((l) => l.id === u.lineId)?.name);
    push("Etapa", u.stage);
    push("Nuevo estado", u.to && STATUS_LABEL[u.to]);
    push("Valor", u.value != null ? u.value.toLocaleString("es-CO") : null);
    push("Semana del", u.week);
    push("Fecha", u.date);
    push("Detalle", u.text && clipText(u.text, 200));
    push("Impacto", u.impact && IMPACT_LABEL[u.impact]);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Sugerencias deterministas (sin Claude)

export function recommendTestType(p: PilotDraft): { type: PilotTestType; why: string } {
  const text = normalizeText([p.change, p.problem, ...(p.channels ?? [])].filter(Boolean).join(" "));
  if (/\b(radio|dooh|valla|vallas|tv|television|prensa|exterior|ooh)\b/.test(text))
    return { type: "geo", why: "los medios fuera de línea no se pueden prender y apagar por persona, así que se compara por ciudades" };
  // El destino (landing, WhatsApp, checkout) pesa más que la palabra "anuncio".
  if (/\b(landing|pagina|web|ecommerce|checkout|formulario|whatsapp|ctwa)\b/.test(text))
    return { type: "ab_platform", why: "la plataforma reparte el tráfico al azar entre la versión actual y la nueva" };
  if (/\b(creativ|pieza|piezas|copy|mensaje|anuncio|anuncios|video|banner)/.test(text))
    return { type: "ab_creative", why: "se prueban dos versiones de la pieza sobre la misma audiencia" };
  return { type: "holdout", why: "un grupo que no ve la campaña muestra cuánto vende de verdad (incrementalidad)" };
}

export function suggestPilotTitle(p: PilotDraft): string {
  const base = p.change ?? p.problem ?? "Piloto";
  const channel = p.channels?.[0];
  const title = clipText(base.replace(/^(probar|hacer|poner|usar)\s+/i, ""), channel ? 70 : 90);
  const full = channel && !normalizeText(title).includes(normalizeText(channel)) ? `${title} · ${channel}` : title;
  const capitalized = full.charAt(0).toUpperCase() + full.slice(1);
  return capitalized.length >= 5 ? capitalized : "Piloto nuevo";
}

function clipText(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function nextMonday(today: IsoDate): IsoDate {
  return addDays(weekStart(today), 7);
}

function firstOfNextMonth(today: IsoDate): IsoDate {
  return addMonths(`${today.slice(0, 7)}-01` as IsoDate, 1);
}

// ---------------------------------------------------------------------------
// Avisos proactivos (sin Claude)

export interface NudgeInput {
  experiments: { id: string; title: string; status: string; actual_start: string | null; min_duration_days: number | null; programId: string; programName: string }[];
  pilots: { id: string; title: string; status: PilotStatus; planned_start: string | null; planned_end: string | null; actual_start: string | null }[];
}

/** Hasta 3 cosas que La Tía le pregunta a la persona al abrir ("¿ya arrancó?", "ya se puede leer"). */
export function copilotNudges(input: NudgeInput, today: IsoDate): { text: string; chip: Chip }[] {
  const out: { text: string; chip: Chip }[] = [];
  for (const p of input.pilots) {
    if (p.status === "approved" && p.planned_start && p.planned_start <= today)
      out.push({
        text: `El piloto «${p.title}» tenía arranque el ${p.planned_start}. ¿Ya arrancó?`,
        chip: { label: `Sí, arrancó «${clipText(p.title, 30)}»`, action: { t: "update", kind: "pilot_start", target: { id: p.id, kind: "pilot", label: p.title, status: p.status } } },
      });
    if (p.status === "in_test" && p.planned_end && p.planned_end < today)
      out.push({
        text: `«${p.title}» debía terminar el ${p.planned_end}. Si ya terminó, páselo a lectura.`,
        chip: { label: `Terminó «${clipText(p.title, 30)}»`, action: { t: "update", kind: "pilot_reading", target: { id: p.id, kind: "pilot", label: p.title, status: p.status } } },
      });
  }
  for (const e of input.experiments) {
    if (e.status !== "in_test" || !e.actual_start) continue;
    const days = Math.round((Date.parse(today) - Date.parse(e.actual_start)) / 86_400_000);
    if (days >= (e.min_duration_days ?? 14))
      out.push({
        text: `«${e.title}» ya lleva ${days} días en prueba: ya se puede leer.`,
        chip: {
          label: `Pasar «${clipText(e.title, 30)}» a lectura`,
          action: { t: "update", kind: "experiment_move", target: { id: e.id, kind: "experiment", label: e.title, programId: e.programId, status: e.status } },
        },
      });
  }
  return out.slice(0, 3);
}

export function pilotStatusLabel(status: string | null | undefined): string {
  return status ? PILOT_STATUS_LABEL[status as PilotStatus] ?? status : "";
}

export function experimentStatusLabel(status: string | null | undefined): string {
  return status ? STATUS_LABEL[status as ExperimentStatus] ?? status : "";
}

// ---------------------------------------------------------------------------
// Utilidades para el servidor

const REF_LETTER: Record<RefKind, string> = { program: "R", experiment: "E", metric: "M", pilot: "P" };

/** Referencia corta y estable (no cambia entre turnos aunque cambie el orden de la lista). */
export function refFor(kind: RefKind, id: string): string {
  return `${REF_LETTER[kind]}${id.replace(/-/g, "").slice(0, 6)}`;
}

/** El estado viene del navegador: se revisa la forma antes de usarlo (los valores los validan las acciones). */
export function sanitizeState(raw: unknown): CopilotState {
  const base = emptyCopilotState();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const last = obj(r.last);
  return {
    v: 1,
    mode: (COPILOT_MODES as readonly string[]).includes(String(r.mode)) ? (r.mode as CopilotMode) : null,
    project: obj(r.project) as ProjectDraft,
    pilot: obj(r.pilot) as PilotDraft,
    update: obj(r.update) as UpdateDraft,
    asked: typeof r.asked === "string" ? r.asked.slice(0, 40) : null,
    skipped: Array.isArray(r.skipped) ? r.skipped.filter((k): k is string => typeof k === "string").slice(0, 30) : [],
    confirming: r.confirming === true,
    last:
      typeof last.id === "string" &&
      typeof last.href === "string" &&
      last.href.startsWith("/") &&
      !last.href.startsWith("//") &&
      typeof last.label === "string" &&
      ["program", "pilot", "experiment", "problem"].includes(String(last.kind))
        ? {
            kind: last.kind as CreatedRef["kind"],
            id: last.id,
            label: last.label.slice(0, 200),
            href: last.href.slice(0, 300),
            programId: typeof last.programId === "string" ? last.programId : null,
          }
        : null,
  };
}

const FIELD_LABEL: Record<string, string> = {
  lines: "las líneas",
  months: "la duración",
  startDate: "el arranque",
  calendar: "el calendario",
  name: "el nombre",
  oppText: "la oportunidad de mejora",
  problem: "la oportunidad de mejora",
  evidence: "el dato",
  change: "el cambio a probar",
  metric: "la métrica",
  expectedPct: "lo que espera mover",
  channels: "los medios",
  testType: "cómo se mide",
  plannedStart: "el arranque",
  plannedEnd: "el cierre",
  budgetCop: "la plata",
  title: "el nombre",
  kind: "qué pasó",
  target: "a qué corresponde",
  value: "el número",
  week: "la semana",
  date: "la fecha",
  text: "el detalle",
  to: "el nuevo estado",
  impact: "el impacto",
};

/** "Anotado." o, si entendió varias cosas de una, cuáles. */
export function ackFor(applied: string[]): string | null {
  const labels = [...new Set(applied.map((k) => FIELD_LABEL[k]).filter(Boolean))];
  if (labels.length < 2) return labels.length ? "Anotado." : null;
  const list = labels.length === 2 ? labels.join(" y ") : `${labels.slice(0, -1).join(", ")} y ${labels.at(-1)}`;
  return `¡Qué belleza! De una le anoté ${list}.`;
}

/** Título corto a partir de un texto (primera frase). */
export function firstSentence(text: string, max = 120): string {
  const first = text.split(/(?<=[.!?])\s|\n/)[0]?.trim() ?? "";
  const pick = first.length >= 5 ? first : text.trim();
  return clipText(pick.replace(/[.!?]+$/, ""), max);
}

/** Grupos por defecto según cómo se mide el piloto (se ajustan en el paso de diseño). */
export function armsFor(testType: PilotTestType): { name: string; is_control: boolean; split_pct: number | null; cities: string[] }[] {
  switch (testType) {
    case "holdout":
      return [
        { name: "Sin anuncios (holdout)", is_control: true, split_pct: 10, cities: [] },
        { name: "Con anuncios", is_control: false, split_pct: 90, cities: [] },
      ];
    case "geo":
      return [
        { name: "Ciudades control", is_control: true, split_pct: null, cities: [] },
        { name: "Ciudades con el cambio", is_control: false, split_pct: null, cities: [] },
      ];
    case "pre_post":
      return [
        { name: "Antes", is_control: true, split_pct: null, cities: [] },
        { name: "Después", is_control: false, split_pct: null, cities: [] },
      ];
    default:
      return [
        { name: "Control (lo de hoy)", is_control: true, split_pct: 50, cities: [] },
        { name: "Prueba (el cambio)", is_control: false, split_pct: 50, cities: [] },
      ];
  }
}

export const EDIT_FIELD = "__edit";
