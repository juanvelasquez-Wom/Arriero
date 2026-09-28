// Cruces entre ejercicios: dos ejercicios se contaminan cuando corren al mismo
// tiempo en la misma línea y tocan la misma etapa del embudo o el mismo canal.
// Si los dos mueven la misma métrica a la vez, no se sabe cuál de los dos la movió.
// Se avisa en el detalle, al lanzar la prueba y en el Gantt.
import { maxDate } from "./dates";
import { dateIntersection } from "./pilots/overlap";
import type { ExperimentStatus, IsoDate } from "./types";

/** Estados que están o pueden estar corriendo (los cerrados y las ideas no cruzan). */
export const COLLISION_STATUSES: readonly ExperimentStatus[] = ["prioritized", "in_design", "in_test", "in_reading"];

export interface CollisionCandidate {
  id: string;
  title: string;
  status: ExperimentStatus;
  line_id: string;
  stage_id: string | null;
  stage_name: string | null;
  /** Canal del problema del que nace. */
  channel: string | null;
  planned_start: IsoDate | null;
  planned_end: IsoDate | null;
  actual_start: IsoDate | null;
  actual_end: IsoDate | null;
}

/** De una fila de ejercicio (con el canal de su problema) a candidato. */
export function asCollisionCandidate(
  e: Omit<CollisionCandidate, "channel"> & { problem_channel: string | null },
): CollisionCandidate {
  return {
    id: e.id,
    title: e.title,
    status: e.status,
    line_id: e.line_id,
    stage_id: e.stage_id,
    stage_name: e.stage_name,
    channel: e.problem_channel,
    planned_start: e.planned_start,
    planned_end: e.planned_end,
    actual_start: e.actual_start,
    actual_end: e.actual_end,
  };
}

export type CollisionReason = "stage" | "channel";

export const COLLISION_REASON_LABEL: Record<CollisionReason, string> = { stage: "etapa", channel: "canal" };

export interface ExperimentCollision {
  otherId: string;
  otherTitle: string;
  otherStatus: ExperimentStatus;
  from: IsoDate;
  to: IsoDate;
  shared: { reason: CollisionReason; value: string }[];
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLocaleLowerCase("es-CO").normalize("NFD").replace(/\p{M}/gu, "");

/**
 * Fechas en que el ejercicio corre (o correría): lo real si ya arrancó; si no, lo
 * planeado. Si está corriendo sin fin real, llega al menos hasta hoy.
 */
export function activeRange(e: CollisionCandidate, today: IsoDate): { start: IsoDate; end: IsoDate } | null {
  const start = e.actual_start ?? e.planned_start;
  if (!start) return null;
  let end: IsoDate | null = e.actual_end ?? null;
  if (!end) {
    const running = !!e.actual_start && (e.status === "in_test" || e.status === "in_reading");
    end = running ? maxDate(e.planned_end, today) : e.planned_end;
  }
  if (!end || end < start) return null;
  return { start, end };
}

export function findCollision(a: CollisionCandidate, b: CollisionCandidate, today: IsoDate): ExperimentCollision | null {
  if (a.id === b.id || a.line_id !== b.line_id) return null;
  if (!COLLISION_STATUSES.includes(a.status) || !COLLISION_STATUSES.includes(b.status)) return null;
  const ra = activeRange(a, today);
  const rb = activeRange(b, today);
  if (!ra || !rb) return null;
  const dates = dateIntersection(ra.start, ra.end, rb.start, rb.end);
  if (!dates) return null;
  const shared: ExperimentCollision["shared"] = [];
  if (a.stage_id && a.stage_id === b.stage_id) shared.push({ reason: "stage", value: a.stage_name ?? "la misma etapa" });
  if (norm(a.channel) && norm(a.channel) === norm(b.channel)) shared.push({ reason: "channel", value: a.channel!.trim() });
  if (!shared.length) return null;
  return { otherId: b.id, otherTitle: b.title, otherStatus: b.status, ...dates, shared };
}

/** Todos los cruces de un ejercicio con los demás del programa. */
export function collisionsFor(e: CollisionCandidate, others: readonly CollisionCandidate[], today: IsoDate): ExperimentCollision[] {
  return others.map((o) => findCollision(e, o, today)).filter((x): x is ExperimentCollision => x !== null);
}

export interface CollisionPair {
  a: { id: string; title: string };
  b: { id: string; title: string };
  collision: ExperimentCollision;
}

/** Parejas que se cruzan (cada pareja una sola vez), para el Gantt. */
export function collisionPairs(experiments: readonly CollisionCandidate[], today: IsoDate): CollisionPair[] {
  const out: CollisionPair[] = [];
  for (let i = 0; i < experiments.length; i++) {
    for (let j = i + 1; j < experiments.length; j++) {
      const c = findCollision(experiments[i], experiments[j], today);
      if (c) out.push({ a: { id: experiments[i].id, title: experiments[i].title }, b: { id: experiments[j].id, title: experiments[j].title }, collision: c });
    }
  }
  return out;
}

/** "Comparten etapa (Conversión) y canal (WhatsApp)". */
export function describeCollision(c: Pick<ExperimentCollision, "shared">): string {
  const parts = c.shared.map((s) => `${COLLISION_REASON_LABEL[s.reason]} (${s.value})`);
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}` : parts[0];
  return `Comparten ${joined}`;
}
