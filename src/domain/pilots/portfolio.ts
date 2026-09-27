// Portafolio de pilotos: filtros de la URL, KPIs y resumen del resultado.
// Lógica pura: la página solo carga datos y los presenta.
import type { Decision, IsoDate } from "../types";
import type { PilotAnalysis } from "./analysis";
import { PILOT_STATUSES, PILOT_TEST_TYPES, VARIABLE_CATEGORIES, type PilotStatus, type PilotTestType, type VariableCategory } from "./types";

/** Lo mínimo de un piloto que necesitan el portafolio y el calendario. */
export interface PortfolioPilot {
  id: string;
  status: PilotStatus;
  test_type: PilotTestType | null;
  variable_category: string | null;
  owner_id: string | null;
  planned_start: IsoDate | null;
  planned_end: IsoDate | null;
  actual_start: IsoDate | null;
  actual_end: IsoDate | null;
  planned_budget_cop: number | null;
  spent_cop: number;
  media_names: string[];
  decision: Decision | null;
}

export interface PortfolioFilters {
  estado: PilotStatus | null;
  canal: string | null;
  variable: VariableCategory | null;
  tipo: PilotTestType | null;
  responsable: string | null;
  desde: IsoDate | null;
  hasta: IsoDate | null;
}

export type PortfolioView = "lista" | "tarjetas";

/** Estados que cuentan como piloto activo (aprobado y corriendo o por leer). */
export const ACTIVE_PILOT_STATUSES: readonly PilotStatus[] = ["approved", "in_test", "in_reading"];
/** Estados en que ya hay datos para leer un resultado. */
export const RESULT_PILOT_STATUSES: readonly PilotStatus[] = ["in_test", "in_reading", "decided"];

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;
const isoOrNull = (v: string | null): IsoDate | null => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
function oneOf<T extends string>(list: readonly T[], v: string | null): T | null {
  return v && (list as readonly string[]).includes(v) ? (v as T) : null;
}

export function parsePortfolioFilters(sp: Params): PortfolioFilters {
  return {
    estado: oneOf(PILOT_STATUSES, first(sp.estado)),
    canal: first(sp.canal),
    variable: oneOf(VARIABLE_CATEGORIES, first(sp.variable)),
    tipo: oneOf(PILOT_TEST_TYPES, first(sp.tipo)),
    responsable: first(sp.responsable),
    desde: isoOrNull(first(sp.desde)),
    hasta: isoOrNull(first(sp.hasta)),
  };
}

export function parsePortfolioView(sp: Params): PortfolioView {
  return first(sp.vista) === "tarjetas" ? "tarjetas" : "lista";
}

export function activeFilterCount(f: PortfolioFilters): number {
  return Object.values(f).filter((v) => v != null).length;
}

/** Rango del piloto: fechas reales si existen, si no las planeadas. */
export function pilotRange(p: Pick<PortfolioPilot, "planned_start" | "planned_end" | "actual_start" | "actual_end">): {
  start: IsoDate | null;
  end: IsoDate | null;
} {
  const start = p.actual_start ?? p.planned_start;
  const end = p.actual_end ?? p.planned_end ?? start;
  return { start, end };
}

/**
 * ¿El rango del piloto se cruza con [desde, hasta]? Sin fechas del piloto no
 * entra cuando hay filtro de fechas. Un extremo vacío del filtro es abierto.
 */
export function overlapsWindow(p: PortfolioPilot, desde: IsoDate | null, hasta: IsoDate | null): boolean {
  if (!desde && !hasta) return true;
  const { start, end } = pilotRange(p);
  if (!start || !end) return false;
  if (desde && end < desde) return false;
  if (hasta && start > hasta) return false;
  return true;
}

export function filterPilots<T extends PortfolioPilot>(items: T[], f: PortfolioFilters): T[] {
  const canal = f.canal?.toLocaleLowerCase("es-CO") ?? null;
  return items.filter(
    (p) =>
      (!f.estado || p.status === f.estado) &&
      (!canal || p.media_names.some((m) => m.toLocaleLowerCase("es-CO") === canal)) &&
      (!f.variable || p.variable_category === f.variable) &&
      (!f.tipo || p.test_type === f.tipo) &&
      (!f.responsable || p.owner_id === f.responsable) &&
      overlapsWindow(p, f.desde, f.hasta),
  );
}

export interface PortfolioKpis {
  active: number;
  /** Inversión planeada de los activos (COP). */
  activePlannedCop: number;
  /** Inversión ejecutada de los activos (COP). */
  activeSpentCop: number;
  decided: number;
  scaled: number;
  /** scaled / decided (0–1); null si no hay decididos. */
  scaledRate: number | null;
}

export function portfolioKpis(items: PortfolioPilot[]): PortfolioKpis {
  const active = items.filter((p) => ACTIVE_PILOT_STATUSES.includes(p.status));
  const decided = items.filter((p) => p.status === "decided");
  const scaled = decided.filter((p) => p.decision === "scale").length;
  return {
    active: active.length,
    activePlannedCop: active.reduce((s, p) => s + (p.planned_budget_cop ?? 0), 0),
    activeSpentCop: active.reduce((s, p) => s + (p.spent_cop ?? 0), 0),
    decided: decided.length,
    scaled,
    scaledRate: decided.length ? scaled / decided.length : null,
  };
}

/** Avance de la inversión: % ejecutado sobre lo planeado (tope visual 100). */
export function budgetProgress(planned: number | null, spent: number): { pct: number | null; over: boolean } {
  if (planned == null || planned <= 0) return { pct: null, over: false };
  const ratio = (spent / planned) * 100;
  return { pct: Math.max(0, Math.min(100, ratio)), over: ratio > 100 };
}

export interface HeadlineResult {
  armId: string;
  /** Probabilidad de ganar (0–1). */
  probability: number | null;
  /** Diferencia vs. control en % relativo. */
  liftPct: number | null;
}

/** Resultado de la mejor variante (la que marca la lectura, o la de mayor probabilidad). */
export function headlineResult(analysis: PilotAnalysis | null): HeadlineResult | null {
  const primary = analysis?.primary;
  if (!primary || primary.comparisons.length === 0) return null;
  const best =
    primary.comparisons.find((c) => c.armId === primary.bestArmId) ??
    primary.comparisons.reduce((acc, c) => ((c.probabilityBetter ?? -1) > (acc.probabilityBetter ?? -1) ? c : acc));
  return { armId: best.armId, probability: best.probabilityBetter, liftPct: best.liftPct };
}

/** Opciones de canal (nombres de medios) presentes en los pilotos, ordenadas. */
export function channelOptions(items: Pick<PortfolioPilot, "media_names">[]): string[] {
  return [...new Set(items.flatMap((p) => p.media_names))].sort((a, b) => a.localeCompare(b, "es-CO"));
}
