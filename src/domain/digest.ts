// Resumen semanal por correo (los lunes): por persona, lo que le toca en los
// programas donde es miembro. Sale de lo que la app ya calcula: carga semanal
// pendiente, ejercicios listos para leer, ideas quietas, métricas norte
// atrasadas y pilotos en prueba que terminan esta semana. Funciones puras:
// arman los datos, el HTML y el texto plano; el envío vive en el servidor.
import { addDays, daysBetween, weekStart } from "./dates";
import { formatShortDate } from "./format";
import { daysRunning, isReadyToRead } from "./home";
import { evaluateTarget, type TargetHorizon, type TargetStatus } from "./targets";
import type { ExperimentStatus, IsoDate, MetricDirection, ProgramRole } from "./types";

/** Días sin moverse para que una idea (o un priorizado) cuente como quieta. */
export const DIGEST_STALE_DAYS = 30;

export type DigestRole = ProgramRole | "admin";

// -----------------------------------------------------------------------------
// Hechos por programa
// -----------------------------------------------------------------------------

export interface DigestExperimentInput {
  id: string;
  title: string;
  line_name: string;
  owner_id: string | null;
  status: ExperimentStatus;
  status_changed_at: string;
  actual_start: IsoDate | null;
  min_duration_days: number | null;
}

export interface DigestNorthStarInput {
  metric_id: string;
  metric_name: string;
  line_id: string;
  line_name: string;
  direction: MetricDirection;
  baseline: number | null;
  targets: { horizon_id: string; target: number }[];
  values: { week_start: IsoDate; value: number }[];
}

export interface DigestProgramFacts {
  id: string;
  name: string;
  /** Semana (lunes) que se revisó para la carga pendiente. */
  loadWeek: IsoDate;
  pendingLoad: string[];
  readyToRead: { id: string; title: string; line_name: string; days: number }[];
  staleIdeas: number;
  northStarsBehind: { line_id: string; line_name: string; metric_name: string; status: TargetStatus; gap: number | null }[];
}

const CAN_LOAD: readonly DigestRole[] = ["admin", "owner", "collaborator"];
const SEES_ALL_READY: readonly DigestRole[] = ["admin", "owner"];

/**
 * Lo que le toca a una persona en un programa. El rol decide qué entra:
 * carga pendiente e ideas quietas para quien puede editar; listos para leer
 * los propios (o todos para owner y admin); métricas norte para todos.
 */
export function programDigestFacts(input: {
  program: { id: string; name: string; start_date: IsoDate | null };
  role: DigestRole;
  userId: string;
  today: IsoDate;
  /** Métricas activas del programa (líneas activas). */
  metrics: { id: string; name: string }[];
  /** Ids de métricas con valor en la semana anterior. */
  loadedLastWeek: ReadonlySet<string>;
  experiments: DigestExperimentInput[];
  northStars: DigestNorthStarInput[];
  horizons: TargetHorizon[];
}): DigestProgramFacts {
  const { role, userId, today } = input;
  const loadWeek = addDays(weekStart(today), -7);
  const canLoad = CAN_LOAD.includes(role);

  const pendingLoad = canLoad ? input.metrics.filter((m) => !input.loadedLastWeek.has(m.id)).map((m) => m.name) : [];

  const readyToRead = input.experiments
    .filter((e) => isReadyToRead(e, today) && (e.owner_id === userId || SEES_ALL_READY.includes(role)))
    .map((e) => ({ id: e.id, title: e.title, line_name: e.line_name, days: daysRunning(e.actual_start, today) ?? 0 }));

  const staleIdeas = canLoad
    ? input.experiments.filter(
        (e) =>
          (e.status === "idea" || e.status === "prioritized") &&
          daysBetween(e.status_changed_at.slice(0, 10), today) >= DIGEST_STALE_DAYS,
      ).length
    : 0;

  const northStarsBehind = input.northStars.flatMap((n) => {
    const ev = evaluateTarget({
      baseline: n.baseline,
      direction: n.direction,
      targets: n.targets,
      horizons: input.horizons,
      values: n.values,
      today,
      programStart: input.program.start_date,
    });
    return ev.status === "behind" || ev.status === "off_track"
      ? [{ line_id: n.line_id, line_name: n.line_name, metric_name: n.metric_name, status: ev.status, gap: ev.gap }]
      : [];
  });

  return { id: input.program.id, name: input.program.name, loadWeek, pendingLoad, readyToRead, staleIdeas, northStarsBehind };
}

export function hasDigestMaterial(p: DigestProgramFacts): boolean {
  return p.pendingLoad.length > 0 || p.readyToRead.length > 0 || p.staleIdeas > 0 || p.northStarsBehind.length > 0;
}

// -----------------------------------------------------------------------------
// Pilotos
// -----------------------------------------------------------------------------

export interface DigestPilot {
  id: string;
  name: string;
  planned_end: IsoDate;
}

/** Pilotos en prueba cuyo fin planeado cae entre hoy y el domingo de esta semana. */
export function pilotsEndingThisWeek<P extends { status: string; planned_end: IsoDate | null }>(pilots: P[], today: IsoDate): P[] {
  const sunday = addDays(weekStart(today), 6);
  return pilots.filter((p) => p.status === "in_test" && !!p.planned_end && p.planned_end >= today && p.planned_end <= sunday);
}

// -----------------------------------------------------------------------------
// El correo
// -----------------------------------------------------------------------------

export interface DigestItem {
  text: string;
  detail?: string;
  href: string;
}

export interface DigestSection {
  key: "load" | "ready" | "north" | "stale" | "pilots";
  title: string;
  items: DigestItem[];
}

export interface Digest {
  subject: string;
  preheader: string;
  greeting: string;
  intro: string;
  sections: DigestSection[];
  total: number;
  homeHref: string;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function pctText(gap: number | null): string {
  if (gap == null || !Number.isFinite(gap)) return "";
  return ` · ${Math.round(Math.abs(gap) * 100)} % por debajo de lo esperado`;
}

/**
 * Arma el resumen de una persona. Null si no hay nada que contar (no se manda
 * correo vacío). `siteUrl` sin "/" al final.
 */
export function buildDigest(input: {
  userName: string;
  today: IsoDate;
  siteUrl: string;
  programs: DigestProgramFacts[];
  pilots: DigestPilot[];
}): Digest | null {
  const base = input.siteUrl.replace(/\/$/, "");
  const programs = input.programs.filter(hasDigestMaterial);
  const many = programs.length > 1;
  const tag = (p: DigestProgramFacts) => (many ? `${p.name} · ` : "");

  const load: DigestItem[] = programs
    .filter((p) => p.pendingLoad.length)
    .map((p) => ({
      text: `${tag(p)}${plural(p.pendingLoad.length, "métrica sin cargar", "métricas sin cargar")} de la semana del ${formatShortDate(p.loadWeek)}`,
      detail: p.pendingLoad.slice(0, 4).join(", ") + (p.pendingLoad.length > 4 ? ` y ${p.pendingLoad.length - 4} más` : ""),
      href: `${base}/programas/${p.id}/carga?semana=${p.loadWeek}`,
    }));

  const ready: DigestItem[] = programs.flatMap((p) =>
    p.readyToRead.map((e) => ({
      text: `${tag(p)}${e.title}`,
      detail: `${e.line_name} · lleva ${plural(e.days, "día", "días")} en prueba. Páselo a En lectura.`,
      href: `${base}/programas/${p.id}/ejercicios/${e.id}`,
    })),
  );

  const north: DigestItem[] = programs.flatMap((p) =>
    p.northStarsBehind.map((n) => ({
      text: `${tag(p)}${n.line_name}: ${n.metric_name} va ${n.status === "off_track" ? "muy atrás" : "un poco atrás"}`,
      detail: `Frente a la meta del horizonte${pctText(n.gap)}. Revise el árbol y busque dónde se pierde.`,
      href: `${base}/programas/${p.id}/lineas/${n.line_id}?tab=norte`,
    })),
  );

  const stale: DigestItem[] = programs
    .filter((p) => p.staleIdeas > 0)
    .map((p) => ({
      text: `${tag(p)}${plural(p.staleIdeas, "idea lleva", "ideas llevan")} más de ${DIGEST_STALE_DAYS} días quieta${p.staleIdeas === 1 ? "" : "s"}`,
      detail: "Califíquelas con ICE o descártelas.",
      href: `${base}/programas/${p.id}/ejercicios?estado=idea`,
    }));

  const pilots: DigestItem[] = input.pilots.map((p) => ({
    text: p.name,
    detail: `Termina el ${formatShortDate(p.planned_end)}. Tenga listos los datos para leerlo.`,
    href: `${base}/pilotos/${p.id}`,
  }));

  const sections: DigestSection[] = (
    [
      { key: "ready", title: "Listos para leer", items: ready },
      { key: "north", title: "Métricas norte atrasadas", items: north },
      { key: "load", title: "Carga semanal pendiente", items: load },
      { key: "pilots", title: "Pilotos que terminan esta semana", items: pilots },
      { key: "stale", title: "Ideas quietas", items: stale },
    ] satisfies DigestSection[]
  ).filter((s) => s.items.length);

  const total = sections.reduce((a, s) => a + s.items.length, 0);
  if (!total) return null;

  const first = input.userName.trim().split(/\s+/)[0] || "";
  return {
    subject: `Su semana en Arriero: ${plural(total, "cosa por mirar", "cosas por mirar")}`,
    preheader: sections.map((s) => `${s.title} (${s.items.length})`).join(" · "),
    greeting: first ? `Buenos días, ${first}` : "Buenos días",
    intro: "Esto es lo que le toca esta semana. La mula ya cargó los datos; a usted le toca mirarlos.",
    sections,
    total,
    homeHref: `${base}/programas`,
  };
}

// -----------------------------------------------------------------------------
// HTML y texto plano
// -----------------------------------------------------------------------------

const INK = "#111111";
const SOFT = "#595959";
const WASH = "#F6F6F4";
const LINE = "#E2E2DF";
const YELLOW = "#F2C200";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** HTML del correo con la marca (tablas y estilos en línea, como las plantillas de Auth). */
export function renderDigestHtml(d: Digest): string {
  const e = escapeHtml;
  const sections = d.sections
    .map(
      (s) => `<tr><td style="padding:20px 32px 0 32px;">
        <h2 style="margin:0 0 8px 0;font-size:16px;line-height:1.3;font-weight:800;color:${INK};">
          <span style="display:inline-block;width:4px;height:14px;background:${YELLOW};border-radius:2px;margin-right:8px;vertical-align:-1px;"></span>${e(s.title)} <span style="color:${SOFT};font-weight:600;">(${s.items.length})</span>
        </h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${s.items
            .map(
              (i) => `<tr><td style="padding:8px 0;border-top:1px solid ${LINE};">
            <a href="${e(i.href)}" style="color:${INK};font-weight:600;font-size:15px;line-height:1.4;text-decoration:underline;">${e(i.text)}</a>
            ${i.detail ? `<div style="font-size:13px;line-height:1.5;color:${SOFT};margin-top:2px;">${e(i.detail)}</div>` : ""}
          </td></tr>`,
            )
            .join("")}
        </table>
      </td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${e(d.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${WASH};font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:${INK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(d.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${WASH};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${LINE};border-radius:16px;overflow:hidden;">
      <tr><td style="background:${INK};padding:20px 32px;">
        <span style="font-size:20px;font-weight:800;letter-spacing:0.12em;color:#FFFFFF;">ARRIERO</span>
        <span style="display:inline-block;margin-left:10px;padding:2px 8px;border-radius:999px;background:${YELLOW};color:#1F1F1F;font-size:11px;font-weight:700;vertical-align:3px;">Resumen semanal</span>
      </td></tr>
      <tr><td style="padding:24px 32px 0 32px;">
        <h1 style="margin:0;font-size:24px;line-height:1.2;font-weight:800;letter-spacing:-0.02em;color:${INK};">${e(d.greeting)}</h1>
        <p style="margin:8px 0 0 0;font-size:15px;line-height:1.6;color:${INK};">${e(d.intro)}</p>
      </td></tr>
      ${sections}
      <tr><td style="padding:24px 32px 8px 32px;">
        <a href="${e(d.homeHref)}" style="display:inline-block;background:${YELLOW};color:#1F1F1F;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:10px;">Abrir Arriero</a>
      </td></tr>
      <tr><td style="padding:16px 32px 28px 32px;">
        <p style="margin:0;padding-top:16px;border-top:1px solid ${LINE};font-size:12px;line-height:1.5;color:${SOFT};">
          Le llega porque es miembro de estos programas. ¿No lo quiere recibir? Apáguelo en su menú de usuario: "Recibir el resumen semanal por correo".<br>
          <strong style="color:${INK};">Arriero</strong> · Menos carreta, más growth marketing.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;
}

/** Versión en texto plano (para clientes sin HTML). */
export function renderDigestText(d: Digest): string {
  const lines = [`${d.greeting}.`, "", d.intro, ""];
  for (const s of d.sections) {
    lines.push(`${s.title.toUpperCase()} (${s.items.length})`);
    for (const i of s.items) {
      lines.push(`- ${i.text}`);
      if (i.detail) lines.push(`  ${i.detail}`);
      lines.push(`  ${i.href}`);
    }
    lines.push("");
  }
  lines.push(`Abrir Arriero: ${d.homeHref}`, "");
  lines.push('¿No lo quiere recibir? Apáguelo en su menú de usuario: "Recibir el resumen semanal por correo".');
  lines.push("Arriero · Menos carreta, más growth marketing.");
  return lines.join("\n");
}
