// Cruces entre pilotos: dos pilotos se contaminan cuando corren al mismo tiempo
// y comparten cuenta, campaña, audiencia, ciudad o destino. Se avisa al crear,
// al aprobar y en el calendario.
import type { IsoDate } from "../types";
import type { PilotStatus, PilotSummary } from "./types";

export type OverlapReason = "account" | "campaign" | "audience" | "city" | "destination";

export const OVERLAP_REASON_LABEL: Record<OverlapReason, string> = {
  account: "cuenta",
  campaign: "campaña",
  audience: "audiencia",
  city: "ciudad",
  destination: "destino",
};

export interface PilotOverlap {
  otherId: string;
  otherTitle: string;
  otherStatus: PilotStatus;
  from: IsoDate;
  to: IsoDate;
  /** Qué comparten, con los valores en común. */
  shared: { reason: OverlapReason; values: string[] }[];
}

/** Estados que todavía pueden correr o están corriendo (los cerrados no cruzan). */
const ACTIVE: PilotStatus[] = ["draft", "in_review", "approved", "in_test", "in_reading"];

const norm = (s: string | null | undefined) => (s ?? "").trim().toLocaleLowerCase("es-CO").normalize("NFD").replace(/\p{M}/gu, "");

function values(p: PilotSummary, reason: OverlapReason): Map<string, string> {
  const out = new Map<string, string>();
  const add = (raw: string | null | undefined) => {
    const k = norm(raw);
    if (k && !out.has(k)) out.set(k, raw!.trim());
  };
  for (const m of p.media) {
    if (reason === "account") add(m.account ? `${m.media_name} · ${m.account}` : null);
    if (reason === "campaign") add(m.campaign);
    if (reason === "audience") add(m.audience);
    if (reason === "destination") add(m.destination);
    if (reason === "city") m.cities.forEach(add);
  }
  if (reason === "city") p.arm_cities.forEach(add);
  return out;
}

/** Intersección de fechas; null si no se cruzan o falta alguna fecha. */
export function dateIntersection(aStart: IsoDate | null, aEnd: IsoDate | null, bStart: IsoDate | null, bEnd: IsoDate | null) {
  if (!aStart || !aEnd || !bStart || !bEnd) return null;
  const from = aStart > bStart ? aStart : bStart;
  const to = aEnd < bEnd ? aEnd : bEnd;
  return from <= to ? { from, to } : null;
}

export function findOverlap(a: PilotSummary, b: PilotSummary): PilotOverlap | null {
  if (a.id === b.id) return null;
  if (!ACTIVE.includes(a.status) || !ACTIVE.includes(b.status)) return null;
  const dates = dateIntersection(a.start, a.end, b.start, b.end);
  if (!dates) return null;
  const shared: PilotOverlap["shared"] = [];
  for (const reason of Object.keys(OVERLAP_REASON_LABEL) as OverlapReason[]) {
    const va = values(a, reason);
    const vb = values(b, reason);
    const common = [...va.keys()].filter((k) => vb.has(k)).map((k) => va.get(k)!);
    if (common.length) shared.push({ reason, values: common });
  }
  if (!shared.length) return null;
  return { otherId: b.id, otherTitle: b.title, otherStatus: b.status, ...dates, shared };
}

/** Todos los cruces de un piloto con los demás. */
export function overlapsFor(pilot: PilotSummary, others: PilotSummary[]): PilotOverlap[] {
  return others.map((o) => findOverlap(pilot, o)).filter((x): x is PilotOverlap => x !== null);
}

/** Frase para el aviso: "Comparten campaña (CTWA Pospago) y ciudad (Medellín)". */
export function describeOverlap(o: PilotOverlap): string {
  const parts = o.shared.map((s) => `${OVERLAP_REASON_LABEL[s.reason]} (${s.values.join(", ")})`);
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}` : parts[0];
  return `Comparten ${joined}`;
}
