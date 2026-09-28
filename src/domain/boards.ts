// Tableros simplificados: columnas agrupadas (Kanban), límites WIP, envejecimiento,
// hoja de ruta Ahora / Siguiente / Después y semáforo de salud. Sirve a los
// ejercicios de un programa y al tablero general (ejercicios + pilotos).
// Lógica pura: la presentación vive en src/components/boards.
import { addDays, daysBetween, isWithin, rangesOverlap } from "./dates";
import type { PilotStatus } from "./pilots/types";
import type { CalendarEvent, ExperimentStatus, IsoDate } from "./types";

// -----------------------------------------------------------------------------
// Columnas
// -----------------------------------------------------------------------------

/** Las cinco columnas comunes; `discarded` queda oculta tras un interruptor. */
export const BOARD_COLUMNS = ["todo", "design", "test", "reading", "closed"] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];
export type BoardColumnKey = BoardColumn | "discarded";

export const BOARD_COLUMN_LABEL: Record<BoardColumnKey, string> = {
  todo: "Por hacer",
  design: "En diseño",
  test: "En prueba",
  reading: "En lectura",
  closed: "Cerrado",
  discarded: "Descartado",
};

export const BOARD_COLUMN_HINT: Record<BoardColumnKey, string> = {
  todo: "Ideas y priorizados: lo que espera turno.",
  design: "Se arma la prueba antes de lanzarla (en pilotos: aprobado y listo para arrancar).",
  test: "Corriendo en la calle.",
  reading: "Ya terminó: toca leer el resultado y decidir.",
  closed: "Decidido o escalado a BAU.",
  discarded: "Ideas que no siguieron.",
};

/** Estados de ejercicio que caben en cada columna (en orden del ciclo). */
export const EXPERIMENT_COLUMN_STATUSES: Record<BoardColumnKey, readonly ExperimentStatus[]> = {
  todo: ["idea", "prioritized"],
  design: ["in_design"],
  test: ["in_test"],
  reading: ["in_reading"],
  closed: ["decided", "scaled"],
  discarded: ["discarded"],
};

export function experimentColumn(status: ExperimentStatus): BoardColumnKey {
  for (const key of [...BOARD_COLUMNS, "discarded"] as const) {
    if (EXPERIMENT_COLUMN_STATUSES[key].includes(status)) return key;
  }
  return "todo";
}

/** Pilotos: Borrador y En revisión esperan turno; Aprobado es "listo para arrancar"; Cancelado se oculta. */
export const PILOT_COLUMN: Record<PilotStatus, BoardColumnKey> = {
  draft: "todo",
  in_review: "todo",
  approved: "design",
  in_test: "test",
  in_reading: "reading",
  decided: "closed",
  cancelled: "discarded",
};

export const pilotColumn = (status: PilotStatus): BoardColumnKey => PILOT_COLUMN[status];

/**
 * Soltar una tarjeta en una columna agrupada: de los destinos permitidos, los
 * que caben en esa columna. 0 = no se puede, 1 = se mueve directo, 2+ = se pregunta.
 */
export function dropOptions(allowed: readonly ExperimentStatus[], column: BoardColumnKey): ExperimentStatus[] {
  return EXPERIMENT_COLUMN_STATUSES[column].filter((s) => allowed.includes(s));
}

// -----------------------------------------------------------------------------
// Límites WIP (método Kanban) y envejecimiento
// -----------------------------------------------------------------------------

/** Cuántos caben a la vez antes de que el equipo se atore. Por programa; sin cambio en la base. */
export const WIP_LIMITS: Partial<Record<BoardColumn, number>> = {
  design: 5,
  test: 4,
  reading: 3,
};

export interface WipState {
  count: number;
  limit: number | null;
  over: boolean;
  /** "3/4" o solo "3" si la columna no tiene límite. */
  text: string;
}

export function wipState(column: BoardColumnKey, count: number, limits: Partial<Record<BoardColumn, number>> = WIP_LIMITS): WipState {
  const limit = column === "discarded" ? null : (limits[column] ?? null);
  return { count, limit, over: limit != null && count > limit, text: limit != null ? `${count}/${limit}` : String(count) };
}

/** Días en la columna a partir de los cuales la tarjeta "se está quedando quieta". */
export const AGING_DAYS: Record<BoardColumnKey, number | null> = {
  todo: 45,
  design: 21,
  test: 45,
  reading: 14,
  closed: null,
  discarded: null,
};

export function isAging(column: BoardColumnKey, days: number): boolean {
  const limit = AGING_DAYS[column];
  return limit != null && days > limit;
}

// -----------------------------------------------------------------------------
// Hoja de ruta Ahora / Siguiente / Después
// -----------------------------------------------------------------------------

export const ROADMAP_BUCKETS = ["now", "next", "later"] as const;
export type RoadmapBucket = (typeof ROADMAP_BUCKETS)[number];

export const ROADMAP_LABEL: Record<RoadmapBucket, string> = { now: "Ahora", next: "Siguiente", later: "Después" };
export const ROADMAP_HINT: Record<RoadmapBucket, string> = {
  now: "Corriendo o en lectura.",
  next: "Diseñado, aprobado o priorizado: lo que arranca pronto.",
  later: "Ideas y borradores que esperan turno.",
};

/** Cerrados, descartados y cancelados no van en la hoja de ruta. */
export function roadmapBucket(column: BoardColumnKey, status: ExperimentStatus | PilotStatus): RoadmapBucket | null {
  if (column === "test" || column === "reading") return "now";
  if (column === "design") return "next";
  if (column === "todo") return status === "idea" || status === "draft" ? "later" : "next";
  return null;
}

// -----------------------------------------------------------------------------
// Semáforo de salud (sin rojo ni verde en pantalla: gris oscuro, amarillo y gris claro)
// -----------------------------------------------------------------------------

export type HealthLevel = "red" | "yellow" | "green";
export const HEALTH_LABEL: Record<HealthLevel, string> = { red: "En riesgo", yellow: "Atención", green: "Al día" };

/** Días sin datos a partir de los cuales una prueba en curso se marca. */
export const STALE_DATA_DAYS = 14;
/** Días de gracia al arrancar antes de exigir datos. */
export const DATA_GRACE_DAYS = 7;

export interface HealthInput {
  column: BoardColumnKey;
  plannedStart: IsoDate | null;
  plannedEnd: IsoDate | null;
  actualStart: IsoDate | null;
  actualEnd: IsoDate | null;
  /** Días en el estado actual. */
  days: number;
  /** Último dato cargado (resultados de variantes o mediciones); null si nunca. */
  lastDataAt: IsoDate | null;
  /** Congelamientos del programa (otros eventos se ignoran). */
  calendar: Pick<CalendarEvent, "type" | "name" | "start_date" | "end_date">[];
  today: IsoDate;
}

export interface Health {
  level: HealthLevel;
  reasons: string[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function boardHealth(h: HealthInput): Health {
  const red: string[] = [];
  const yellow: string[] = [];
  const freezes = h.calendar.filter((e) => e.type === "freeze");
  const running = h.column === "test";
  const upcoming = h.column === "todo" || h.column === "design";

  if (h.column === "closed" || h.column === "discarded") return { level: "green", reasons: [] };

  // Rojo: en prueba pasado de la fecha de fin planeada.
  if (running && h.plannedEnd && !h.actualEnd && h.today > h.plannedEnd) {
    red.push(`Pasó la fecha de fin planeada hace ${plural(daysBetween(h.plannedEnd, h.today), "día", "días")}.`);
  }

  // Rojo: el arranque planeado cae dentro de un congelamiento (no se puede lanzar).
  if (upcoming && h.plannedStart) {
    const start = h.plannedStart;
    const f = freezes.find((e) => isWithin(start, e.start_date, e.end_date));
    if (f) red.push(`El arranque planeado cae en el congelamiento «${f.name}».`);
  }

  // Amarillo: la prueba corre durante un congelamiento.
  if (running && h.actualStart) {
    const end = h.actualEnd ?? h.plannedEnd ?? h.today;
    const f = freezes.find((e) => rangesOverlap(h.actualStart!, end < h.actualStart! ? h.actualStart! : end, e.start_date, e.end_date));
    if (f) yellow.push(`Corre durante el congelamiento «${f.name}».`);
  }

  // Amarillo: sin datos recientes en una prueba en curso (con días de gracia al arrancar).
  if (running && h.actualStart && daysBetween(h.actualStart, h.today) > DATA_GRACE_DAYS) {
    if (!h.lastDataAt) yellow.push("Todavía no tiene datos cargados.");
    else if (h.lastDataAt < addDays(h.today, -STALE_DATA_DAYS)) {
      yellow.push(`Sin datos nuevos hace ${plural(daysBetween(h.lastDataAt, h.today), "día", "días")}.`);
    }
  }

  // Amarillo: debía arrancar y no ha arrancado.
  if (upcoming && h.plannedStart && h.plannedStart < h.today && !h.actualStart) {
    yellow.push(`Debía arrancar hace ${plural(daysBetween(h.plannedStart, h.today), "día", "días")}.`);
  }

  // Amarillo: quieto en la columna.
  if (isAging(h.column, h.days)) {
    yellow.push(`Lleva ${plural(h.days, "día", "días")} en ${BOARD_COLUMN_LABEL[h.column]}.`);
  }

  if (red.length) return { level: "red", reasons: [...red, ...yellow] };
  if (yellow.length) return { level: "yellow", reasons: yellow };
  return { level: "green", reasons: [] };
}

// -----------------------------------------------------------------------------
// Ítems del tablero general y filtros
// -----------------------------------------------------------------------------

export type BoardKind = "experiment" | "pilot";

export interface BoardItem {
  id: string;
  kind: BoardKind;
  title: string;
  href: string;
  /** Programa del ejercicio; null en pilotos. */
  programId: string | null;
  programName: string | null;
  /** Línea del ejercicio o "Piloto de medios". */
  chip: string;
  status: ExperimentStatus | PilotStatus;
  statusLabel: string;
  column: BoardColumnKey;
  ownerId: string | null;
  ownerName: string | null;
  days: number;
  plannedStart: IsoDate | null;
  plannedEnd: IsoDate | null;
  actualStart: IsoDate | null;
  actualEnd: IsoDate | null;
  lastDataAt: IsoDate | null;
  isExample: boolean;
  health: Health;
}

export const BOARD_VIEWS = ["gantt", "kanban", "ruta"] as const;
export type BoardView = (typeof BOARD_VIEWS)[number];
export const BOARD_VIEW_LABEL: Record<BoardView, string> = { gantt: "Gantt", kanban: "Kanban", ruta: "Ahora · Siguiente · Después" };

export const BOARD_TYPES = ["todo", "ejercicios", "pilotos"] as const;
export type BoardType = (typeof BOARD_TYPES)[number];

export const UNASSIGNED = "sin-responsable";

export interface BoardFilters {
  vista: BoardView;
  programa: string | null;
  tipo: BoardType;
  responsable: string | null;
}

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s : null;
};

export function parseBoardFilters(sp: Raw): BoardFilters {
  const vista = one(sp.vista);
  const tipo = one(sp.tipo);
  return {
    vista: (BOARD_VIEWS as readonly string[]).includes(vista ?? "") ? (vista as BoardView) : "gantt",
    programa: one(sp.programa),
    tipo: (BOARD_TYPES as readonly string[]).includes(tipo ?? "") ? (tipo as BoardType) : "todo",
    responsable: one(sp.responsable),
  };
}

export function filterBoardItems<T extends Pick<BoardItem, "kind" | "programId" | "ownerId">>(items: T[], f: BoardFilters): T[] {
  return items.filter((i) => {
    if (f.tipo === "ejercicios" && i.kind !== "experiment") return false;
    if (f.tipo === "pilotos" && i.kind !== "pilot") return false;
    // Filtrar por programa deja fuera los pilotos (no cuelgan de un programa).
    if (f.programa && i.programId !== f.programa) return false;
    if (f.responsable === UNASSIGNED ? i.ownerId != null : f.responsable && i.ownerId !== f.responsable) return false;
    return true;
  });
}

/** Iniciales para el avatar del responsable ("Ana María Gómez" → "AM"). */
export function ownerInitials(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  return (
    name
      .split(/\s+|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?"
  );
}
