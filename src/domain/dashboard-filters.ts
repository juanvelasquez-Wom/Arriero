// Filtros de los tableros (línea, estado, responsable, horizonte) y cortes
// extra de Resultados (etapa, tipo de prueba). Funciones puras: los valores
// llegan como search params de la URL.
import { maxDate, rangesOverlap } from "./dates";
import { EXPERIMENT_STATUSES, TEST_TYPES, type ExperimentStatus, type IsoDate, type TestType } from "./types";

/** Valor de `responsable` para ejercicios sin responsable asignado. */
export const UNASSIGNED_OWNER = "sin-asignar";

export const GLOBAL_FILTER_KEYS = ["linea", "estado", "responsable", "horizonte"] as const;
export type GlobalFilterKey = (typeof GLOBAL_FILTER_KEYS)[number];

export interface DashboardFilters {
  linea: string | null;
  estado: ExperimentStatus | null;
  responsable: string | null;
  horizonte: string | null;
}

export interface ResultSlicers {
  etapa: string | null;
  tipo: TestType | null;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Primer valor no vacío de un search param. */
export function firstParam(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  const trimmed = v?.trim();
  return trimmed ? trimmed : null;
}

function isStatus(value: string | null): value is ExperimentStatus {
  return !!value && (EXPERIMENT_STATUSES as readonly string[]).includes(value);
}

function isTestType(value: string | null): value is TestType {
  return !!value && (TEST_TYPES as readonly string[]).includes(value);
}

export function parseDashboardFilters(params: RawSearchParams): DashboardFilters {
  const estado = firstParam(params.estado);
  return {
    linea: firstParam(params.linea),
    estado: isStatus(estado) ? estado : null,
    responsable: firstParam(params.responsable),
    horizonte: firstParam(params.horizonte),
  };
}

export function parseResultSlicers(params: RawSearchParams): ResultSlicers {
  const tipo = firstParam(params.tipo);
  return { etapa: firstParam(params.etapa), tipo: isTestType(tipo) ? tipo : null };
}

export function hasActiveFilters(filters: DashboardFilters | ResultSlicers): boolean {
  return Object.values(filters).some((v) => v != null);
}

export interface FilterableExperiment {
  line_id: string;
  status: ExperimentStatus;
  owner_id: string | null;
  planned_start: IsoDate | null;
  planned_end: IsoDate | null;
  actual_start: IsoDate | null;
  actual_end: IsoDate | null;
}

export interface HorizonRange {
  id: string;
  start_date: IsoDate;
  end_date: IsoDate;
}

const RUNNING: readonly ExperimentStatus[] = ["in_test", "in_reading"];

/**
 * ¿El rango planeado o el real del ejercicio se cruza con [start, end]?
 * Si falta el fin se usa el inicio; un ejercicio en curso sin fin real se
 * extiende hasta `today`. Sin fechas no se cruza con nada.
 */
export function overlapsRange(exp: FilterableExperiment, start: IsoDate, end: IsoDate, today?: IsoDate): boolean {
  const ranges: [IsoDate, IsoDate][] = [];
  if (exp.planned_start) {
    ranges.push([exp.planned_start, maxDate(exp.planned_start, exp.planned_end)!]);
  }
  if (exp.actual_start) {
    const running = !exp.actual_end && RUNNING.includes(exp.status) && today;
    const actualEnd = running ? maxDate(exp.actual_start, today) : maxDate(exp.actual_start, exp.actual_end);
    ranges.push([exp.actual_start, actualEnd!]);
  }
  return ranges.some(([s, e]) => rangesOverlap(s, e, start, end));
}

/**
 * Aplica los filtros globales. Un horizonte que no existe (p. ej. borrado)
 * se ignora en vez de vaciar el tablero.
 */
export function filterExperiments<T extends FilterableExperiment>(
  experiments: T[],
  filters: DashboardFilters,
  horizons: HorizonRange[],
  today?: IsoDate,
): T[] {
  const horizon = filters.horizonte ? horizons.find((h) => h.id === filters.horizonte) ?? null : null;
  return experiments.filter((e) => {
    if (filters.linea && e.line_id !== filters.linea) return false;
    if (filters.estado && e.status !== filters.estado) return false;
    if (filters.responsable) {
      if (filters.responsable === UNASSIGNED_OWNER ? e.owner_id !== null : e.owner_id !== filters.responsable) {
        return false;
      }
    }
    if (horizon && !overlapsRange(e, horizon.start_date, horizon.end_date, today)) return false;
    return true;
  });
}

/** Cortes de Resultados: etapa (por nombre, igual que la matriz) y tipo de prueba. */
export function applyResultSlicers<T extends { stage_name: string | null; test_type: TestType | null }>(
  experiments: T[],
  slicers: ResultSlicers,
): T[] {
  return experiments.filter(
    (e) => (!slicers.etapa || e.stage_name === slicers.etapa) && (!slicers.tipo || e.test_type === slicers.tipo),
  );
}

/**
 * Query string (con `?`, o vacío) con los parámetros indicados. Sirve para que
 * la navegación entre tableros conserve los filtros globales.
 */
export function buildQuery(
  params: Record<string, string | null | undefined>,
  keys: readonly string[] = Object.keys(params),
): string {
  const sp = new URLSearchParams();
  for (const key of keys) {
    const value = params[key];
    if (value) sp.set(key, value);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Solo los filtros globales, para enlaces entre tableros. */
export function globalFiltersQuery(filters: DashboardFilters): string {
  return buildQuery({ ...filters }, GLOBAL_FILTER_KEYS);
}
