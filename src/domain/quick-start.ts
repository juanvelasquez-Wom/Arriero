// Arranque rápido: arma en una sola pantalla todo lo que el asistente paso a
// paso pide en 4 + N pantallas (programa, calendario típico de telco,
// horizontes, y una o más líneas con su métrica norte, eficiencia, árbol y
// embudo). Aquí solo se planea; la server action persiste el plan tal cual.
// Todo queda editable después en Configuración.
import { addDays, daysBetween, parseIsoDate, rangesOverlap, toIsoDate } from "./dates";
import {
  DEFAULT_STAGES,
  GENERIC_TEMPLATE,
  proposeHorizons,
  suggestFreeze,
  TELCO_TEMPLATES,
  type LineTemplate,
  type MetricSuggestion,
  type ProposedHorizon,
} from "./growth-templates";
import { METRIC_BRANCHES, type CalendarEventType, type IsoDate, type MetricBranch } from "./types";

export const QUICK_DURATIONS = [3, 6, 12] as const;
export type QuickDuration = (typeof QUICK_DURATIONS)[number];
export const DEFAULT_QUICK_DURATION: QuickDuration = 6;

/** Clave de la plantilla genérica ("Otra línea"). */
export const CUSTOM_LINE_KEY = GENERIC_TEMPLATE.key;

/** Margen mínimo (días) entre el punto de decisión y el inicio o el fin del programa. */
export const DECISION_MARGIN_DAYS = 28;

export interface QuickLineInput {
  /** Clave de TELCO_TEMPLATES o CUSTOM_LINE_KEY. */
  templateKey: string;
  /** Nombre de la línea cuando es "Otra línea" (se ignora con plantillas telco). */
  lineName?: string | null;
}

/** Máximo de líneas en el arranque rápido: las plantillas telco más una propia. */
export const QUICK_MAX_LINES = TELCO_TEMPLATES.length + 1;

export interface QuickStartInput {
  name: string;
  /** Una o más líneas, en el orden en que se crean. */
  lines: QuickLineInput[];
  startDate: IsoDate;
  months: QuickDuration;
  useTelcoCalendar: boolean;
}

export interface PlannedEvent {
  type: CalendarEventType;
  name: string;
  start_date: IsoDate;
  end_date: IsoDate;
}

export interface PlannedTreeMetric extends MetricSuggestion {
  branch: MetricBranch;
  sort_order: number;
}

export interface PlannedStage {
  name: (typeof DEFAULT_STAGES)[number];
  description: string;
  /** Nombre de la métrica del árbol que mide la etapa (se resuelve a id al guardar). */
  metricName: string | null;
}

export interface PlannedLine {
  name: string;
  templateKey: string;
  northStar: MetricSuggestion;
  efficiency: MetricSuggestion;
  tree: PlannedTreeMetric[];
  funnel: PlannedStage[];
}

export interface QuickStartPlan {
  program: { name: string; start_date: IsoDate; end_date: IsoDate };
  events: PlannedEvent[];
  horizons: ProposedHorizon[];
  lines: PlannedLine[];
}

// -----------------------------------------------------------------------------
// Fechas
// -----------------------------------------------------------------------------

/** Suma meses a una fecha; si el día no existe en el mes destino, usa el último día del mes. */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = parseIsoDate(date);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return toIsoDate(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay))));
}

/** Fin del programa: el día anterior a cumplir los meses (1 oct + 6 meses → 31 mar). */
export function quickProgramEnd(start: IsoDate, months: number): IsoDate {
  return addDays(addMonths(start, months), -1);
}

/** Black Friday: el viernes siguiente al cuarto jueves de noviembre. */
export function blackFriday(year: number): IsoDate {
  const nov1 = new Date(Date.UTC(year, 10, 1)).getUTCDay(); // 0 domingo … 4 jueves
  const firstThursday = 1 + ((4 - nov1 + 7) % 7);
  return toIsoDate(new Date(Date.UTC(year, 10, firstThursday + 21 + 1)));
}

const clip = (r: { start_date: IsoDate; end_date: IsoDate }, start: IsoDate, end: IsoDate) => ({
  start_date: r.start_date < start ? start : r.start_date,
  end_date: r.end_date > end ? end : r.end_date,
});

/**
 * Calendario típico de telco dentro del periodo: Black Friday–Cyber y la
 * temporada decembrina de cada año que toque el programa, con su congelamiento
 * sugerido (`suggestFreeze`), recortados a las fechas del programa. Más el
 * punto de decisión (ver `quickDecisionDate`).
 */
export function typicalTelcoCalendar(start: IsoDate, end: IsoDate): PlannedEvent[] {
  const events: PlannedEvent[] = [];
  const firstYear = parseIsoDate(start).getUTCFullYear() - 1; // una temporada decembrina puede venir del año anterior
  const lastYear = parseIsoDate(end).getUTCFullYear();
  for (let y = firstYear; y <= lastYear; y++) {
    const bf = blackFriday(y);
    const peaks = [
      { name: `Black Friday–Cyber ${y}`, start_date: bf, end_date: addDays(bf, 3) },
      { name: `Temporada decembrina ${y}`, start_date: `${y}-12-14`, end_date: `${y}-12-31` },
    ];
    for (const peak of peaks) {
      const freeze = suggestFreeze(peak);
      if (rangesOverlap(peak.start_date, peak.end_date, start, end)) {
        events.push({ type: "peak", name: peak.name, ...clip(peak, start, end) });
      }
      if (rangesOverlap(freeze.start_date, freeze.end_date, start, end)) {
        events.push({ type: "freeze", name: `Congelamiento ${peak.name}`, ...clip(freeze, start, end) });
      }
    }
  }
  const decision = quickDecisionDate(start, end);
  if (decision) events.push({ type: "decision", name: "Punto de decisión", start_date: decision, end_date: decision });
  return events.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.type.localeCompare(b.type));
}

/**
 * Punto de decisión: el 18 de enero siguiente a la temporada decembrina (se
 * decide con los picos ya leídos), si cae con al menos cuatro semanas de margen
 * dentro del programa. Si no, la mitad del programa. Programas de menos de
 * ocho semanas no llevan punto de decisión.
 */
export function quickDecisionDate(start: IsoDate, end: IsoDate): IsoDate | null {
  const total = daysBetween(start, end);
  if (total < DECISION_MARGIN_DAYS * 2) return null;
  const earliest = addDays(start, DECISION_MARGIN_DAYS);
  const latest = addDays(end, -DECISION_MARGIN_DAYS);
  const firstYear = parseIsoDate(start).getUTCFullYear();
  for (let y = firstYear; y <= parseIsoDate(end).getUTCFullYear(); y++) {
    const candidate = `${y}-01-18`;
    if (candidate >= earliest && candidate <= latest) return candidate;
  }
  return addDays(start, Math.floor(total / 2));
}

// -----------------------------------------------------------------------------
// Métricas
// -----------------------------------------------------------------------------

const norm = (s: string) => s.trim().toLowerCase();

export function quickTemplate(templateKey: string): LineTemplate | null {
  if (templateKey === CUSTOM_LINE_KEY) return GENERIC_TEMPLATE;
  return TELCO_TEMPLATES.find((t) => t.key === templateKey) ?? null;
}

/**
 * Métricas de entrada a crear: la primera sugerida de cada rama (como marca el
 * asistente por defecto: pocas y claras) más las que el embudo de la plantilla
 * usa para medir sus etapas, para que cada etapa quede con su métrica.
 */
export function quickTreeMetrics(template: LineTemplate): PlannedTreeMetric[] {
  const funnelNames = new Set(
    Object.values(template.funnel)
      .map((s) => s.metric)
      .filter((n): n is string => !!n)
      .map(norm),
  );
  const out: PlannedTreeMetric[] = [];
  for (const branch of METRIC_BRANCHES) {
    template.tree[branch].forEach((s, i) => {
      if (i === 0 || funnelNames.has(norm(s.name))) out.push({ ...s, branch, sort_order: out.length });
    });
  }
  return out;
}

/** Etapas por defecto con la descripción y la métrica de la plantilla (solo si esa métrica se crea). */
export function quickFunnel(template: LineTemplate, tree: PlannedTreeMetric[]): PlannedStage[] {
  const created = new Set(tree.map((m) => norm(m.name)));
  return DEFAULT_STAGES.map((name) => {
    const t = template.funnel[name];
    const metricName = t.metric && created.has(norm(t.metric)) ? t.metric : null;
    return { name, description: t.description, metricName };
  });
}

// -----------------------------------------------------------------------------
// Plan completo
// -----------------------------------------------------------------------------

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** "2026-10-01" → "oct 2026". */
const monthYear = (d: IsoDate) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/**
 * Nombre sugerido para el programa: "Plan digital Pospago oct 2026 – mar 2027".
 * Con dos líneas las nombra; con más, "Plan digital WOM". Se usa si el nombre
 * queda vacío.
 */
export function suggestProgramName(lineNames: string[], start: IsoDate | null, months: number): string {
  const names = lineNames.map((n) => n.trim()).filter(Boolean);
  // Con una línea, su nombre; con varias, un nombre general (evita "Pospago y Recargas y paquetes").
  const who = names.length === 1 ? names[0] : "WOM";
  const valid = !!start && /^\d{4}-\d{2}-\d{2}$/.test(start);
  const period = valid ? ` ${monthYear(start)} – ${monthYear(quickProgramEnd(start, months))}` : "";
  return `Plan digital ${who}${period}`;
}

/** Nombre visible de una línea elegida (la plantilla o el nombre propio). */
export function quickLineName(line: QuickLineInput): string {
  const template = quickTemplate(line.templateKey);
  if (!template) return "";
  return template === GENERIC_TEMPLATE ? (line.lineName ?? "").trim() : template.name;
}

export type QuickStartPlanResult = { ok: true; plan: QuickStartPlan } | { ok: false; error: string };

export function planQuickStart(input: QuickStartInput): QuickStartPlanResult {
  if (!input.lines.length) return { ok: false, error: "Elija al menos una línea de negocio." };
  if (input.lines.length > QUICK_MAX_LINES) return { ok: false, error: "Son demasiadas líneas para arrancar. Elija las que va a trabajar primero." };
  if (!QUICK_DURATIONS.includes(input.months)) return { ok: false, error: "Elija una duración de 3, 6 o 12 meses." };

  const lines: PlannedLine[] = [];
  const seen = new Set<string>();
  for (const l of input.lines) {
    const template = quickTemplate(l.templateKey);
    if (!template) return { ok: false, error: "Elija una de las líneas de la lista." };
    const name = quickLineName(l);
    if (name.length < 2) return { ok: false, error: "Escriba el nombre de su línea de negocio." };
    if (seen.has(norm(name))) return { ok: false, error: `La línea ${name} está repetida.` };
    seen.add(norm(name));
    const tree = quickTreeMetrics(template);
    lines.push({
      name,
      templateKey: template.key,
      northStar: template.northStar,
      efficiency: template.efficiency,
      tree,
      funnel: quickFunnel(template, tree),
    });
  }

  const start = input.startDate;
  const end = quickProgramEnd(start, input.months);
  const events = input.useTelcoCalendar ? typicalTelcoCalendar(start, end) : [];
  const decision = events.find((e) => e.type === "decision")?.start_date ?? null;
  const name = input.name.trim() || suggestProgramName(lines.map((l) => l.name), start, input.months);

  return {
    ok: true,
    plan: {
      program: { name, start_date: start, end_date: end },
      events,
      horizons: proposeHorizons(start, end, decision),
      lines,
    },
  };
}
