// Resumen ejecutivo para dirección (Head of Growth, CMO, CEO): responde en
// lenguaje simple las preguntas de un comité, para todos los programas que la
// persona puede ver. Funciones puras; se arma con los informes (`buildReport`)
// y los consolidados (`rollupProgram`) de cada programa.
import { daysBetween } from "./dates";
import { formatDate, formatMetricValue, formatSignedPercent } from "./format";
import { DECISION_LABEL, VERDICT_LABEL, labelOf } from "./labels";
import type { Report, ReportPeriod } from "./report";
import type { NorthStarStatus, ProgramRollup } from "./rollup";
import type { IsoDate } from "./types";
import { formatCop } from "./value";

export interface ExecutiveProgramInput {
  rollup: ProgramRollup;
  report: Report;
  /** Ejercicios en prueba o en lectura, con su fecha real de inicio. */
  running: { id: string; title: string; line_name: string; status: "in_test" | "in_reading"; actual_start: IsoDate | null }[];
}

export type BriefTone = "good" | "bad" | "attention" | "neutral";

export interface BriefItem {
  text: string;
  detail?: string;
  href?: string;
  /** Acción sugerida (texto del enlace). */
  action?: string;
  tone: BriefTone;
}

export type BriefKey = "growing" | "falling" | "running" | "results" | "learned" | "value" | "decide" | "next" | "risks";

export interface BriefSection {
  key: BriefKey;
  question: string;
  items: BriefItem[];
  /** Qué decir cuando no hay nada. */
  empty: string;
}

export interface ExecutiveBrief {
  period: ReportPeriod;
  /** Programas incluidos (sin el de ejemplo si hay reales). */
  programs: { id: string; name: string; is_demo: boolean }[];
  includesDemo: boolean;
  sections: BriefSection[];
}

/** Cambio de la métrica en el periodo, con signo "a favor" según su dirección. */
export function periodChange(n: NorthStarStatus, periodStart: IsoDate): { change: number | null; latest: number | null; previous: number | null } {
  const latest = n.values.at(-1)?.value ?? null;
  const previous = n.values.filter((v) => v.week_start < periodStart).at(-1)?.value ?? null;
  if (latest == null || previous == null || previous === 0) return { change: null, latest, previous };
  const raw = (latest - previous) / Math.abs(previous);
  return { change: n.direction === "down" ? -raw : raw, latest, previous };
}

const EPS = 0.005;

export function buildExecutiveBrief(inputs: ExecutiveProgramInput[], period: ReportPeriod, today: IsoDate): ExecutiveBrief {
  // Programas reales con algo que contar; si ninguno tiene datos todavía, se usa el de ejemplo.
  const hasData = (i: ExecutiveProgramInput) =>
    i.rollup.northStars.some((n) => n.values.length > 0) ||
    i.running.length > 0 ||
    i.report.closed.length > 0 ||
    i.report.nextUp.length > 0 ||
    i.rollup.pendingDecisions.length > 0;
  const real = inputs.filter((i) => !i.rollup.is_demo && hasData(i));
  const demo = inputs.filter((i) => i.rollup.is_demo);
  const used = real.length ? real : demo.length ? demo : inputs;
  const includesDemo = used.some((i) => i.rollup.is_demo);
  const multi = used.length > 1;
  const where = (i: ExecutiveProgramInput, line: string) => (multi ? `${i.rollup.name} · ${line}` : line);
  const base = (i: ExecutiveProgramInput) => `/programas/${i.rollup.id}`;

  const growing: BriefItem[] = [];
  const falling: BriefItem[] = [];
  for (const i of used) {
    for (const n of i.rollup.northStars) {
      const { change, latest } = periodChange(n, period.start);
      const status = n.evaluation.status;
      const value = formatMetricValue(latest, n.unit);
      const vsTarget =
        n.evaluation.gap != null && n.evaluation.target != null
          ? `${formatSignedPercent(n.evaluation.gap)} frente a lo esperado para la meta ${n.evaluation.horizonName ?? ""}`.trim()
          : "sin meta para comparar";
      const moved = change == null ? "" : ` (${formatSignedPercent(change)} en el periodo)`;
      const label = `${n.metric_name} · ${where(i, n.line_name)}`;
      if (status === "off_track" || status === "behind" || (change != null && change < -EPS)) {
        falling.push({
          text: `${label}: ${value}${moved}`,
          detail: status === "off_track" ? `Va muy atrás: ${vsTarget}.` : status === "behind" ? `Va un poco atrás: ${vsTarget}.` : `Bajó en el periodo; ${vsTarget}.`,
          href: `${base(i)}/problemas/nuevo?metrica=${n.metric_id}`,
          action: "Convertir en problema",
          tone: status === "off_track" ? "bad" : "attention",
        });
      } else if (status === "on_track" || (change != null && change > EPS)) {
        growing.push({
          text: `${label}: ${value}${moved}`,
          detail: status === "on_track" ? `Vamos bien: ${vsTarget}.` : vsTarget,
          href: `${base(i)}/lineas/${n.line_id}`,
          tone: "good",
        });
      }
    }
  }

  const running: BriefItem[] = used.flatMap((i) =>
    i.running.map((e) => {
      const days = e.actual_start ? Math.max(0, daysBetween(e.actual_start, today)) : null;
      return {
        text: `${e.title} · ${where(i, e.line_name)}`,
        detail:
          e.status === "in_reading"
            ? "Ya terminó la prueba: está en lectura."
            : days == null
              ? "En prueba."
              : e.actual_start! > today
                ? `Arranca el ${formatDate(e.actual_start)}.`
                : `En prueba hace ${days} día${days === 1 ? "" : "s"}.`,
        href: `${base(i)}/ejercicios/${e.id}`,
        tone: "neutral" as const,
      };
    }),
  );

  const results: BriefItem[] = [];
  const learned: BriefItem[] = [];
  let monthly = 0;
  let counted = 0;
  let missing = 0;
  for (const i of used) {
    const r = i.report;
    if (r.value) {
      monthly += r.value.monthly;
      counted += r.value.counted;
      missing += r.value.missingUnitValue;
    }
    for (const c of r.closed) {
      const verdict = c.verdict ? labelOf(VERDICT_LABEL, c.verdict) : "Sin veredicto";
      const decision = c.decision ? labelOf(DECISION_LABEL, c.decision) : null;
      results.push({
        text: `${verdict}: ${c.title} · ${where(i, c.line_name)}`,
        detail: [
          c.diff != null ? `${formatSignedPercent(c.diff)} frente al control` : null,
          decision ? `Decisión: ${decision.toLowerCase()}` : null,
          c.monthlyValue != null ? `≈ ${formatCop(c.monthlyValue)} al mes si se escala` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        href: `${base(i)}/ejercicios/${c.id}`,
        tone: c.verdict === "winner" ? "good" : c.verdict === "loser" ? "bad" : "neutral",
      });
      if (c.learning) {
        learned.push({ text: c.learning, detail: `De «${c.title}» · ${where(i, c.line_name)}`, href: `${base(i)}/aprendizajes`, tone: "neutral" });
      }
    }
  }

  const value: BriefItem[] = [];
  if (counted) {
    value.push({
      text: `≈ ${formatCop(monthly)} al mes`,
      detail: `Valor estimado de ${counted} ganador${counted === 1 ? "" : "es"} del periodo si se escalan.${missing ? ` Faltan ${missing} por calcular: agregue el valor por unidad en su métrica.` : ""}`,
      tone: "good",
    });
  } else if (missing) {
    value.push({
      text: "Hay ganadores, pero todavía no se puede poner en pesos",
      detail: `A ${missing} métrica(s) les falta el valor por unidad. Con ese dato Arriero calcula cuánto vale cada resultado.`,
      tone: "attention",
    });
  }

  const decide: BriefItem[] = used.flatMap((i) =>
    i.rollup.pendingDecisions.map((p) => ({
      text: `${p.title} · ${where(i, p.line_name)}`,
      detail: `En lectura desde el ${formatDate(p.since.slice(0, 10))}. Mientras no se decida, no se aprende.`,
      href: `${base(i)}/ejercicios/${p.id}`,
      action: "Decidir",
      tone: "attention" as const,
    })),
  );

  const next: BriefItem[] = used
    .flatMap((i) => i.report.nextUp.map((n) => ({ i, n })))
    .sort((a, b) => (b.n.final_score ?? -Infinity) - (a.n.final_score ?? -Infinity))
    .slice(0, 5)
    .map(({ i, n }) => ({
      text: `${n.title} · ${where(i, n.line_name)}`,
      detail: n.final_score != null ? `Puntaje ${String(n.final_score).replace(".", ",")}` : undefined,
      href: `${base(i)}/ejercicios/${n.id}`,
      tone: "neutral" as const,
    }));

  const risks: BriefItem[] = used.flatMap((i) =>
    i.report.risks
      .filter((r) => r.kind === "freeze")
      .map((r) => ({ text: multi ? `${i.rollup.name}: ${r.title}` : r.title, detail: r.detail, href: `${base(i)}/tableros/gantt`, tone: "attention" as const })),
  );

  const sections: BriefSection[] = [
    { key: "growing", question: "¿Qué está creciendo?", items: growing, empty: "Nada va por encima de lo esperado todavía (o faltan datos y metas)." },
    { key: "falling", question: "¿Qué está cayendo o va atrás?", items: falling, empty: "¡Eso! Ninguna métrica norte va atrás." },
    { key: "running", question: "¿Qué estamos probando?", items: running, empty: "No hay pruebas corriendo. La mula está quieta: toca lanzar la siguiente." },
    { key: "results", question: "¿Qué ganó y qué perdió?", items: results, empty: "No se cerró ningún ejercicio en el periodo." },
    { key: "learned", question: "¿Qué aprendimos?", items: learned, empty: "Sin aprendizajes nuevos en el periodo." },
    { key: "value", question: "¿Cuánto vale?", items: value, empty: "Todavía no hay ganadores con valor estimado en el periodo." },
    { key: "decide", question: "¿Qué hay que decidir?", items: decide, empty: "Nada esperando decisión." },
    { key: "next", question: "¿Qué sigue?", items: next, empty: "La fila está vacía: no hay ejercicios priorizados ni en diseño." },
    { key: "risks", question: "¿Qué riesgos vienen?", items: risks, empty: "No hay congelamientos en los próximos 30 días." },
  ];

  return {
    period,
    programs: used.map((i) => ({ id: i.rollup.id, name: i.rollup.name, is_demo: i.rollup.is_demo })),
    includesDemo,
    sections,
  };
}

/** Texto plano para pegar en un correo o chat del comité. */
export function executiveBriefToText(brief: ExecutiveBrief, headline: { title: string; text: string }): string {
  const out: string[] = [];
  out.push(`Resumen ejecutivo de growth · ${brief.period.label} (${formatDate(brief.period.start)} – ${formatDate(brief.period.end)})`);
  out.push(`Programas: ${brief.programs.map((p) => p.name).join(", ")}${brief.includesDemo ? " (datos de ejemplo)" : ""}`);
  out.push("");
  out.push(`¿Dónde estamos? ${headline.title}. ${headline.text}`);
  for (const s of brief.sections) {
    out.push("");
    out.push(s.question);
    if (!s.items.length) out.push(`- ${s.empty}`);
    for (const it of s.items) out.push(`- ${it.text}${it.detail ? ` — ${it.detail}` : ""}`);
  }
  out.push("");
  out.push("Arriero · Menos carreta, más crecimiento.");
  return out.join("\n");
}
