// Resúmenes ejecutivos de La Tía: los arma el código con los números ya calculados
// (cero tokens y nada inventado). Claude no participa.
import { formatDate } from "./format";
import { PILOT_STATUS_LABEL, PILOT_TEST_TYPE_LABEL } from "./pilots/labels";
import type { PilotStatus, PilotTestType } from "./pilots/types";

export interface PilotSummaryInput {
  title: string;
  status: PilotStatus;
  testType: PilotTestType | null;
  start: string | null;
  end: string | null;
  budgetCop: number | null;
  media: string[];
  arms: number;
  incidents: number;
  measurements: number;
  checklistPending: number;
  reading: { ready: boolean; reasons: string[]; warnings: string[] } | null;
}

const cop = (n: number) => `$ ${Math.round(n).toLocaleString("es-CO")}`;

/** Resumen de un piloto en viñetas, solo con lo que hay en la base. */
export function pilotSummaryText(p: PilotSummaryInput): string {
  const out: string[] = [`**Resumen ejecutivo · ${p.title}**`];
  const lines: string[] = [];
  lines.push(`Estado: ${PILOT_STATUS_LABEL[p.status]}${p.testType ? ` · ${PILOT_TEST_TYPE_LABEL[p.testType]}` : " · sin forma de medir definida"}.`);
  lines.push(p.start ? `Fechas: ${formatDate(p.start)}${p.end ? ` → ${formatDate(p.end)}` : ""}.` : "Fechas: sin definir.");
  lines.push(p.budgetCop != null ? `Presupuesto: ${cop(p.budgetCop)}.` : "Presupuesto: sin definir.");
  lines.push(`Medios: ${p.media.length ? p.media.join(", ") : "sin definir"} · grupos: ${p.arms}.`);
  if (p.status === "in_test" || p.status === "in_reading" || p.status === "decided") {
    lines.push(`Datos cargados: ${p.measurements} ${p.measurements === 1 ? "registro" : "registros"} · incidentes: ${p.incidents}.`);
  } else if (p.checklistPending) lines.push(`Lista de chequeo: ${p.checklistPending} ${p.checklistPending === 1 ? "punto pendiente" : "puntos pendientes"}.`);
  if (p.reading) {
    if (!p.reading.ready) lines.push("Lectura: todavía no hay datos suficientes para el resultado principal.");
    for (const r of p.reading.reasons.slice(0, 3)) lines.push(`Lectura: ${r}`);
    for (const w of p.reading.warnings.slice(0, 2)) lines.push(`Ojo: ${w}`);
  }
  out.push(lines.map((l) => `- ${l}`).join("\n"));
  return out.join("\n\n");
}

/** Conteo de pilotos por estado ("3 en prueba, 1 en lectura…"). */
export function pilotPortfolioLine(pilots: { status: PilotStatus }[]): string | null {
  if (!pilots.length) return null;
  const order: PilotStatus[] = ["in_test", "in_reading", "approved", "in_review", "draft", "decided"];
  const counts = order.map((s) => [s, pilots.filter((p) => p.status === s).length] as const).filter(([, n]) => n > 0);
  const plural: Partial<Record<PilotStatus, string>> = { draft: "borradores", approved: "aprobados", decided: "decididos" };
  const label = (s: PilotStatus, n: number) => (n > 1 && plural[s] ? plural[s] : PILOT_STATUS_LABEL[s].toLowerCase());
  return `Pilotos de medios: ${counts.map(([s, n]) => `${n} ${label(s, n)}`).join(", ")}.`;
}

/**
 * Da formato de chat al texto del resumen de Dirección (executiveBriefToText):
 * la primera línea en negrita y las preguntas como subtítulos.
 */
export function briefForChat(text: string): string {
  const lines = text.split("\n");
  return lines
    .map((l, i) => (i === 0 ? `**${l}**` : /^¿.+\?$/.test(l.trim()) ? `**${l.trim()}**` : l))
    .join("\n")
    .replace(/\n\nArriero · Menos carreta, más crecimiento\.$/, "");
}
