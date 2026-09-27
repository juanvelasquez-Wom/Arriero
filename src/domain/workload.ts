// Carga del equipo para quien dirige growth: qué tiene cada persona, qué está
// listo para leer, qué se venció, qué ideas llevan quietas y quién está
// sobrecargado. Funciones puras.
import { daysBetween } from "./dates";
import { isReadyToRead } from "./home";
import { ACTIVE_STATUSES } from "./lifecycle";
import type { ExperimentStatus, IsoDate, ProgramRole } from "./types";

/** Más de este número de ejercicios en prueba a la vez = sobrecarga. */
export const OVERLOAD_IN_TEST = 3;
/** Días sin moverse para considerar una idea quieta (igual que el aviso diario). */
export const STALE_DAYS = 30;

export const OPEN_STATUSES: readonly ExperimentStatus[] = ["idea", ...ACTIVE_STATUSES];

export interface WorkloadMember {
  user_id: string;
  name: string;
  role: ProgramRole;
}

export interface WorkloadExperiment {
  id: string;
  title: string;
  status: ExperimentStatus;
  owner_id: string | null;
  line_name: string;
  planned_end: IsoDate | null;
  actual_start: IsoDate | null;
  min_duration_days: number | null;
  /** timestamptz */
  status_changed_at: string;
}

export interface WorkloadActivity {
  actor_id: string | null;
  /** timestamptz */
  created_at: string;
}

export interface WorkloadItem {
  id: string;
  title: string;
  status: ExperimentStatus;
  line_name: string;
  /** Días vencido (overdue) o quieto (stale). */
  days?: number;
}

export type ActiveCounts = Record<"prioritized" | "in_design" | "in_test" | "in_reading", number>;

export interface PersonWorkload {
  /** null = ejercicios sin responsable. */
  user_id: string | null;
  name: string;
  role: ProgramRole | null;
  byStatus: ActiveCounts;
  active: number;
  ideas: number;
  inTest: number;
  readyToRead: WorkloadItem[];
  overdue: WorkloadItem[];
  stale: WorkloadItem[];
  /** Todo lo abierto (idea a en lectura), para enlazar. */
  open: WorkloadItem[];
  lastActivity: string | null;
  overloaded: boolean;
}

export interface TeamWorkload {
  people: PersonWorkload[];
  totals: { active: number; inTest: number; readyToRead: number; overdue: number; stale: number };
  overloaded: PersonWorkload[];
  /** Miembros que pueden llevar ejercicios y no tienen nada activo. */
  idle: PersonWorkload[];
}

function emptyCounts(): ActiveCounts {
  return { prioritized: 0, in_design: 0, in_test: 0, in_reading: 0 };
}

/** Días completos entre una fecha y hoy (a partir de un timestamptz o una fecha). */
function daysSince(from: string, today: IsoDate): number {
  const start = new Date(from.length === 10 ? `${from}T00:00:00Z` : from).getTime();
  const end = new Date(`${today}T23:59:59Z`).getTime();
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

export function isOverdue(e: Pick<WorkloadExperiment, "status" | "planned_end">, today: IsoDate): boolean {
  return !!e.planned_end && e.planned_end < today && OPEN_STATUSES.includes(e.status);
}

export function isStale(e: Pick<WorkloadExperiment, "status" | "status_changed_at">, today: IsoDate): boolean {
  if (e.status !== "idea" && e.status !== "prioritized") return false;
  return daysSince(e.status_changed_at, today) > STALE_DAYS;
}

const CAN_OWN: readonly ProgramRole[] = ["owner", "collaborator", "agency"];

export function computeWorkload(input: {
  members: WorkloadMember[];
  experiments: WorkloadExperiment[];
  activity?: WorkloadActivity[];
  today: IsoDate;
  overloadThreshold?: number;
}): TeamWorkload {
  const threshold = input.overloadThreshold ?? OVERLOAD_IN_TEST;
  const lastBy = new Map<string, string>();
  for (const a of input.activity ?? []) {
    if (!a.actor_id) continue;
    const prev = lastBy.get(a.actor_id);
    if (!prev || a.created_at > prev) lastBy.set(a.actor_id, a.created_at);
  }

  const people = new Map<string | null, PersonWorkload>();
  const person = (user_id: string | null, name: string, role: ProgramRole | null): PersonWorkload => ({
    user_id,
    name,
    role,
    byStatus: emptyCounts(),
    active: 0,
    ideas: 0,
    inTest: 0,
    readyToRead: [],
    overdue: [],
    stale: [],
    open: [],
    lastActivity: user_id ? (lastBy.get(user_id) ?? null) : null,
    overloaded: false,
  });
  for (const m of input.members) people.set(m.user_id, person(m.user_id, m.name, m.role));

  for (const e of input.experiments) {
    if (!OPEN_STATUSES.includes(e.status)) continue;
    const key = e.owner_id;
    let p = people.get(key);
    if (!p) {
      // Responsable que ya no es miembro, o sin responsable.
      p = person(key, key ? "Ex miembro del programa" : "Sin responsable", null);
      people.set(key, p);
    }
    const item: WorkloadItem = { id: e.id, title: e.title, status: e.status, line_name: e.line_name };
    p.open.push(item);
    if (e.status === "idea") p.ideas += 1;
    else {
      p.byStatus[e.status as keyof ActiveCounts] += 1;
      p.active += 1;
    }
    if (e.status === "in_test") p.inTest += 1;
    if (isReadyToRead(e, input.today)) p.readyToRead.push(item);
    if (isOverdue(e, input.today)) p.overdue.push({ ...item, days: daysBetween(e.planned_end!, input.today) });
    if (isStale(e, input.today)) p.stale.push({ ...item, days: daysSince(e.status_changed_at, input.today) });
  }

  const list = [...people.values()];
  for (const p of list) p.overloaded = p.inTest > threshold;
  list.sort((a, b) => {
    if ((a.user_id === null) !== (b.user_id === null)) return a.user_id === null ? 1 : -1;
    return b.active - a.active || b.ideas - a.ideas || a.name.localeCompare(b.name, "es");
  });

  const sum = (f: (p: PersonWorkload) => number) => list.reduce((acc, p) => acc + f(p), 0);
  return {
    people: list,
    totals: {
      active: sum((p) => p.active),
      inTest: sum((p) => p.inTest),
      readyToRead: sum((p) => p.readyToRead.length),
      overdue: sum((p) => p.overdue.length),
      stale: sum((p) => p.stale.length),
    },
    overloaded: list.filter((p) => p.overloaded),
    idle: list.filter((p) => p.user_id && p.role && CAN_OWN.includes(p.role) && p.active === 0),
  };
}
