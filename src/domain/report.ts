// Informe para el comité: qué se movió, qué se lanzó, qué se cerró (con
// veredicto, decisión y aprendizaje), valor estimado, qué sigue y riesgos.
// Funciones puras; `reportToText` arma la versión en texto plano para copiar.
import { addDays, rangesOverlap } from "./dates";
import { formatDate, formatMetricValue, formatScore, formatSignedPercent } from "./format";
import { DECISION_LABEL, STATUS_LABEL, VERDICT_LABEL, labelOf } from "./labels";
import { isClosed } from "./lifecycle";
import { readExperiment } from "./results";
import { bogotaDate, type NorthStarStatus, type RollupExperiment } from "./rollup";
import { TARGET_STATUS_LABEL, type TargetStatus } from "./targets";
import type { CalendarEvent, IsoDate } from "./types";
import { formatValueRange, type MetricEconomics } from "./value";

export const REPORT_PERIODS = ["semana", "mes"] as const;
export type ReportPeriodKey = (typeof REPORT_PERIODS)[number];

export function parsePeriod(v: unknown): ReportPeriodKey {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "mes" ? "mes" : "semana";
}

export interface ReportPeriod {
  key: ReportPeriodKey;
  start: IsoDate;
  end: IsoDate;
  label: string;
}

/** Ventana móvil que termina hoy: 7 días (semana) o 30 días (mes). */
export function reportPeriod(key: ReportPeriodKey, today: IsoDate): ReportPeriod {
  const days = key === "mes" ? 30 : 7;
  return { key, start: addDays(today, -(days - 1)), end: today, label: `Últimos ${days} días` };
}

export interface ReportExperiment extends RollupExperiment {
  actual_start: IsoDate | null;
  owner_name: string | null;
  final_score: number | null;
  decision_rationale: string | null;
  learning: string | null;
}

export interface ReportInput {
  period: ReportPeriod;
  today: IsoDate;
  northStars: NorthStarStatus[];
  experiments: ReportExperiment[];
  economics: Map<string, MetricEconomics>;
  calendar: CalendarEvent[];
  /** Días hacia adelante para avisar congelamientos. */
  freezeLookaheadDays?: number;
}

export interface ReportMoved {
  line_name: string;
  metric_name: string;
  unit: string | null;
  status: TargetStatus;
  latest: number | null;
  latestWeek: IsoDate | null;
  /** Último valor anterior al periodo (para ver cuánto se movió). */
  previous: number | null;
  /** Cambio relativo latest vs previous. */
  change: number | null;
  target: number | null;
  horizonName: string | null;
  gap: number | null;
}

export interface ReportLaunched {
  id: string;
  title: string;
  line_name: string;
  actual_start: IsoDate;
  owner_name: string | null;
}

export interface ReportClosed {
  id: string;
  title: string;
  line_name: string;
  verdict: RollupExperiment["verdict"];
  decision: RollupExperiment["decision"];
  decided: IsoDate | null;
  diff: number | null;
  /** Valor mensual estimado, conservador (solo ganadores con valor por unidad). */
  monthlyValue: number | null;
  /** Techo optimista del valor mensual (el cálculo con la mejora observada). */
  monthlyValueHigh?: number | null;
  learning: string | null;
  rationale: string | null;
}

export interface ReportNext {
  id: string;
  title: string;
  line_name: string;
  status: RollupExperiment["status"];
  final_score: number | null;
}

export type ReportRiskKind = "freeze" | "off_track" | "behind" | "pending";

export interface ReportRisk {
  kind: ReportRiskKind;
  title: string;
  detail: string;
}

export interface Report {
  period: ReportPeriod;
  moved: ReportMoved[];
  launched: ReportLaunched[];
  closed: ReportClosed[];
  winners: number;
  /** `monthly` es el piso conservador; `monthlyHigh`, el techo optimista. */
  value: { monthly: number; monthlyHigh?: number; counted: number; missingUnitValue: number } | null;
  nextUp: ReportNext[];
  risks: ReportRisk[];
}

function relChange(latest: number | null, previous: number | null): number | null {
  if (latest == null || previous == null || previous === 0) return null;
  return (latest - previous) / Math.abs(previous);
}

export function buildReport(input: ReportInput): Report {
  const { period, today } = input;
  const inPeriod = (d: IsoDate | null) => !!d && d >= period.start && d <= period.end;

  const moved: ReportMoved[] = input.northStars.map((n) => {
    const before = n.values.filter((v) => v.week_start < period.start).at(-1) ?? null;
    const ev = n.evaluation;
    const latest = ev.latest ?? n.values.at(-1)?.value ?? null;
    return {
      line_name: n.line_name,
      metric_name: n.metric_name,
      unit: n.unit,
      status: ev.status,
      latest,
      latestWeek: ev.latestWeek ?? n.values.at(-1)?.week_start ?? null,
      previous: before?.value ?? null,
      change: relChange(latest, before?.value ?? null),
      target: ev.target,
      horizonName: ev.horizonName,
      gap: ev.gap,
    };
  });

  const launched = input.experiments
    .filter((e) => e.actual_start && inPeriod(e.actual_start) && e.status !== "discarded")
    .sort((a, b) => a.actual_start!.localeCompare(b.actual_start!))
    .map((e) => ({ id: e.id, title: e.title, line_name: e.line_name, actual_start: e.actual_start!, owner_name: e.owner_name }));

  let monthly = 0;
  let monthlyHigh = 0;
  let counted = 0;
  let missingUnitValue = 0;
  const closed: ReportClosed[] = input.experiments
    .filter((e) => isClosed(e.status) && inPeriod(bogotaDate(e.decided_at)))
    .sort((a, b) => (a.decided_at ?? "").localeCompare(b.decided_at ?? ""))
    .map((e) => {
      const headline = readExperiment({ variants: e.variants, testType: e.test_type, metric: input.economics.get(e.metric_id) ?? null }).headline;
      let value: number | null = null;
      let valueHigh: number | null = null;
      if (e.verdict === "winner") {
        if (headline?.value_estimate) {
          // Para dirección se cuenta el piso (conservador); el techo va aparte.
          valueHigh = headline.value_estimate.monthly;
          value = headline.value_conservative?.monthly ?? valueHigh;
          monthly += value;
          monthlyHigh += valueHigh;
          counted += 1;
        } else if (headline?.value_missing === "unit_value") missingUnitValue += 1;
      }
      return {
        id: e.id,
        title: e.title,
        line_name: e.line_name,
        verdict: e.verdict,
        decision: e.decision,
        decided: bogotaDate(e.decided_at),
        diff: headline?.diffVsControl ?? null,
        monthlyValue: value,
        monthlyValueHigh: valueHigh,
        learning: e.learning,
        rationale: e.decision_rationale,
      };
    });

  const nextUp = input.experiments
    .filter((e) => e.status === "prioritized" || e.status === "in_design")
    .sort((a, b) => (b.final_score ?? -Infinity) - (a.final_score ?? -Infinity) || a.title.localeCompare(b.title, "es"))
    .slice(0, 5)
    .map((e) => ({ id: e.id, title: e.title, line_name: e.line_name, status: e.status, final_score: e.final_score }));

  const risks: ReportRisk[] = [];
  const lookahead = addDays(today, input.freezeLookaheadDays ?? 30);
  for (const ev of [...input.calendar].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
    if (ev.type !== "freeze" || !rangesOverlap(ev.start_date, ev.end_date, today, lookahead)) continue;
    const ongoing = ev.start_date <= today;
    risks.push({
      kind: "freeze",
      title: ongoing ? `Congelamiento en curso: ${ev.name}` : `Se viene un congelamiento: ${ev.name}`,
      detail: `Del ${formatDate(ev.start_date)} al ${formatDate(ev.end_date)} no se lanza nada nuevo.${ongoing ? "" : " Lo que vaya a arrancar, que arranque antes."}`,
    });
  }
  for (const m of moved) {
    if (m.status !== "off_track" && m.status !== "behind") continue;
    risks.push({
      kind: m.status,
      title: `${m.metric_name} (${m.line_name}) va ${m.status === "off_track" ? "muy atrás" : "un poco atrás"}`,
      detail: `Último valor ${formatMetricValue(m.latest, m.unit)}${m.gap != null ? `, ${formatSignedPercent(m.gap)} frente a lo esperado` : ""}${m.target != null ? `; meta ${m.horizonName ?? ""} ${formatMetricValue(m.target, m.unit)}` : ""}.`,
    });
  }
  const pending = input.experiments.filter((e) => e.status === "in_reading");
  if (pending.length) {
    risks.push({
      kind: "pending",
      title: `${pending.length} ejercicio${pending.length === 1 ? "" : "s"} esperando decisión`,
      detail: pending.map((e) => e.title).join(" · "),
    });
  }

  return {
    period,
    moved,
    launched,
    closed,
    winners: closed.filter((c) => c.verdict === "winner").length,
    value: counted || missingUnitValue ? { monthly, monthlyHigh, counted, missingUnitValue } : null,
    nextUp,
    risks,
  };
}

/** Versión en texto plano para pegar en un correo o chat. */
export function reportToText(report: Report, programName: string): string {
  const out: string[] = [];
  const p = report.period;
  out.push(`Informe de growth · ${programName}`);
  out.push(`${p.label}: ${formatDate(p.start)} – ${formatDate(p.end)}`);
  out.push("");

  out.push("QUÉ SE MOVIÓ (métricas norte)");
  if (!report.moved.length) out.push("- Sin métricas norte definidas.");
  for (const m of report.moved) {
    const change = m.change != null ? ` (${formatSignedPercent(m.change)} vs. antes del periodo)` : "";
    out.push(`- ${m.line_name} · ${m.metric_name}: ${formatMetricValue(m.latest, m.unit)}${change} · ${TARGET_STATUS_LABEL[m.status]}`);
  }
  out.push("");

  out.push("QUÉ SE LANZÓ");
  if (!report.launched.length) out.push("- Nada arrancó en este periodo.");
  for (const l of report.launched) out.push(`- ${l.title} (${l.line_name}) · desde ${formatDate(l.actual_start)}`);
  out.push("");

  out.push("QUÉ SE CERRÓ");
  if (!report.closed.length) out.push("- Ningún ejercicio se decidió en este periodo.");
  for (const c of report.closed) {
    const bits = [labelOf(VERDICT_LABEL, c.verdict), labelOf(DECISION_LABEL, c.decision)];
    if (c.diff != null) bits.push(`${formatSignedPercent(c.diff)} vs. control`);
    if (c.monthlyValue != null) bits.push(formatValueRange(c.monthlyValue, c.monthlyValueHigh ?? c.monthlyValue, "al mes"));
    out.push(`- ${c.title} (${c.line_name}): ${bits.join(" · ")}`);
    if (c.learning) out.push(`  Aprendizaje: ${c.learning}`);
  }
  out.push("");

  out.push("VALOR ESTIMADO");
  if (report.value && report.value.counted) {
    out.push(`- ${formatValueRange(report.value.monthly, report.value.monthlyHigh ?? report.value.monthly, "al mes")} si se escalan los ${report.value.counted} ganador(es) con valor por unidad.`);
  } else out.push("- Sin valor estimado en este periodo.");
  if (report.value?.missingUnitValue) out.push(`- ${report.value.missingUnitValue} ganador(es) sin valor por unidad en su métrica.`);
  out.push("");

  out.push("QUÉ SIGUE");
  if (!report.nextUp.length) out.push("- No hay ejercicios priorizados.");
  report.nextUp.forEach((n, i) =>
    out.push(`${i + 1}. ${n.title} (${n.line_name}) · ${STATUS_LABEL[n.status]} · puntaje ${formatScore(n.final_score)}`),
  );
  out.push("");

  out.push("RIESGOS");
  if (!report.risks.length) out.push("- Sin riesgos a la vista.");
  for (const r of report.risks) out.push(`- ${r.title}. ${r.detail}`);
  return out.join("\n");
}
