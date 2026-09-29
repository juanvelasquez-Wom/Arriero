import "server-only";

// Resumen ejecutivo para La Tía: el mismo cálculo de /direccion (buildExecutiveBrief),
// leído con RLS. Sin Claude: cero tokens y ningún número inventado.
import { todayIso } from "@/domain/dates";
import { buildExecutiveBrief, executiveBriefToText } from "@/domain/executive";
import { buildReport, reportPeriod } from "@/domain/report";
import { directionHeadline, rollupProgram } from "@/domain/rollup";
import { briefForChat, pilotPortfolioLine, pilotSummaryText } from "@/domain/tia-summary";
import type { PilotStatus } from "@/domain/pilots/types";
import { analyzePilotDetail } from "@/server/pilot-reading";
import { listVisiblePrograms, loadSnapshots } from "@/server/queries/management";
import { listPilots, loadPilotCatalogs, loadPilotDetail } from "@/server/queries/pilots";

export interface SummaryResult {
  text: string;
  links: { label: string; href: string }[];
}

/** Resumen de los programas (todos los visibles, o uno) en el periodo. */
export async function programsSummary(opts: { programId?: string | null; period: "semana" | "mes" }): Promise<SummaryResult | null> {
  const today = todayIso();
  const period = reportPeriod(opts.period, today);
  const all = await listVisiblePrograms();
  const programs = opts.programId ? all.filter((p) => p.id === opts.programId) : all;
  if (!programs.length) return null;
  const snapshots = await loadSnapshots(programs, today);
  const rollups = snapshots.map((s) =>
    rollupProgram({
      id: s.program.id,
      name: s.program.name,
      is_demo: s.program.is_demo,
      start_date: s.program.start_date,
      horizons: s.horizons,
      northStars: s.northStars,
      experiments: s.experiments,
      economics: s.economics,
      today,
    }),
  );
  const brief = buildExecutiveBrief(
    snapshots.map((s, i) => ({
      rollup: rollups[i],
      report: buildReport({ period, today, northStars: rollups[i].northStars, experiments: s.experiments, economics: s.economics, calendar: s.calendar }),
      running: s.experiments
        .filter((e) => e.status === "in_test" || e.status === "in_reading")
        .map((e) => ({ id: e.id, title: e.title, line_name: e.line_name, status: e.status as "in_test" | "in_reading", actual_start: e.actual_start })),
    })),
    period,
    today,
  );
  const h = directionHeadline(rollups.filter((r) => brief.programs.some((p) => p.id === r.id)));
  let text = briefForChat(executiveBriefToText(brief, { title: h.answerTitle, text: h.answerText }));
  if (!opts.programId) {
    const pilots = await listPilots().catch(() => []);
    const line = pilotPortfolioLine(pilots.filter((p) => !p.deleted_at && !p.is_example && p.status !== "cancelled").map((p) => ({ status: p.status as PilotStatus })));
    if (line) text += `\n\n${line}`;
  }
  const links = opts.programId
    ? [
        { label: "Informe del programa", href: `/programas/${opts.programId}/informe?periodo=${opts.period}` },
        { label: "Ver el programa", href: `/programas/${opts.programId}` },
      ]
    : [{ label: "Abrir Dirección", href: `/direccion?periodo=${opts.period}` }];
  return { text, links };
}

/** Resumen de un piloto con su lectura calculada por el motor de Pilotos. */
export async function pilotSummary(pilotId: string): Promise<SummaryResult | null> {
  const [detail, catalogs] = await Promise.all([loadPilotDetail(pilotId), loadPilotCatalogs()]);
  if (!detail) return null;
  const p = detail.pilot;
  const reading = p.status === "in_test" || p.status === "in_reading" || p.status === "decided" ? analyzePilotDetail(detail, catalogs) : null;
  const text = pilotSummaryText({
    title: p.title,
    status: p.status,
    testType: p.test_type,
    start: p.actual_start ?? p.planned_start,
    end: p.actual_end ?? p.planned_end,
    budgetCop: p.planned_budget_cop,
    media: detail.media.map((m) => m.media_name).filter((m): m is string => !!m),
    arms: detail.arms.length,
    incidents: detail.incidents.length,
    measurements: detail.measurements.length,
    checklistPending: detail.checklist.filter((c) => c.status !== "ok").length,
    reading: reading ? { ready: reading.ready, reasons: reading.suggestion.reasons, warnings: reading.warnings } : null,
  });
  return { text, links: [{ label: "Abrir el piloto", href: `/pilotos/${pilotId}` }, { label: "Ficha para gerencia", href: `/pilotos/${pilotId}/ficha` }] };
}
