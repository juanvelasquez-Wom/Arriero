import { ArrowLeft, ArrowRight, Compass, FileText, Gavel, Users } from "lucide-react";
import { ArrieroNorthStar, DirectionPilotsSection, ExecutiveBriefView } from "@/components/app/executive-brief";
import { CopySummaryButton } from "@/components/app/report-actions";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/app/app-header";
import { Fold } from "@/components/app/fold";
import { ViewTabs } from "@/components/app/view-tabs";
import { ExportCsvButton } from "@/components/app/export-csv-button";
import { Term } from "@/components/app/info-tip";
import { EmptyState, Section } from "@/components/app/page";
import { DemoBadge } from "@/components/app/status-badge";
import { ExecutiveGlanceView } from "@/components/direction/executive-glance";
import { TargetStatusSummary } from "@/components/lines/target-status";
import { TiaCommittee } from "@/components/tia/tia-committee";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toCsv } from "@/domain/csv";
import { TIA_ENABLED } from "@/domain/tia";
import { todayIso } from "@/domain/dates";
import { formatDate, formatMetricValue, formatPercent } from "@/domain/format";
import { buildExecutiveBrief, type BriefKey, executiveBriefToText, growthDecisionsByWeek, lastWeeks, weeklyActiveUsers, ARRIERO_NORTH_STAR_WEEKS } from "@/domain/executive";
import { buildExecutiveGlance } from "@/domain/executive-glance";
import { buildReport, parsePeriod, reportPeriod } from "@/domain/report";
import { bogotaDate, directionHeadline, rollupProgram, type NorthStarStatus, type ProgramRollup } from "@/domain/rollup";
import { TARGET_STATUS_LABEL } from "@/domain/targets";
import { formatCop } from "@/domain/value";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { getPilotContext } from "@/server/pilot-auth";
import { listPilotsForDirection, loadDirectionPilots, loadSustainedLift, loadUsageDays } from "@/server/queries/direction";
import { listVisiblePrograms, loadSnapshots } from "@/server/queries/management";
import { tiaConfigured } from "@/server/tia/client";
import { recordUsage } from "@/server/usage";

export const metadata: Metadata = { title: "Resumen ejecutivo" };

/** "resumen" es el vistazo (primera pantalla); el resto es el detalle para el comité. */
type DirectionView = "resumen" | "preguntas" | "programas" | "metodo" | "pilotos" | "tia";
const BRIEF_KEYS: readonly BriefKey[] = ["growing", "falling", "running", "results", "learned", "value", "decide", "next", "risks"];

function Headline({ label, value, hint, highlight }: { label: ReactNode; value: ReactNode; hint?: ReactNode; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl border bg-paper p-4 shadow-card", highlight && "border-highlight bg-highlight/10")}>
      <div className="text-xs font-medium text-soft">{label}</div>
      <div className="mt-1 font-heading text-3xl font-extrabold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-soft">{hint}</div> : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="rounded-xl border bg-wash/60 px-3 py-2">
      <div className="text-[11px] text-soft">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function NorthStarTable({ rows }: { rows: NorthStarStatus[] }) {
  if (!rows.length) {
    return <p className="text-sm text-soft">Este programa todavía no tiene métricas norte. Sin norte, la mula no sabe para dónde va.</p>;
  }
  return (
    <div className="-mx-5 overflow-x-auto">
      <Table className="tabular-nums">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Línea</TableHead>
            <TableHead>
              <Term k="northStar" />
            </TableHead>
            <TableHead className="text-right">Último valor</TableHead>
            <TableHead className="pr-5">
              <Term k="targetStatus" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((n) => (
            <TableRow key={n.metric_id}>
              <TableCell className="pl-5 font-medium">{n.line_name}</TableCell>
              <TableCell>{n.metric_name}</TableCell>
              <TableCell className="text-right">
                {formatMetricValue(n.evaluation.latest ?? n.values.at(-1)?.value ?? null, n.unit)}
                {n.evaluation.latestWeek ? (
                  <div className="text-[11px] text-soft">semana del {formatDate(n.evaluation.latestWeek)}</div>
                ) : null}
              </TableCell>
              <TableCell className="pr-5">
                <TargetStatusSummary evaluation={n.evaluation} unit={n.unit} compact />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ProgramCard({ r }: { r: ProgramRollup }) {
  const base = `/programas/${r.id}`;
  return (
    <Section
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Link href={base} className="hover:underline">
            {r.name}
          </Link>
          {r.is_demo ? <DemoBadge /> : null}
        </span>
      }
      description={
        r.northStars.length
          ? `${r.statusCounts.on_track} de ${r.northStars.length} métricas norte en la meta`
          : "Sin métricas norte todavía"
      }
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}/informe`}>
              <FileText aria-hidden /> Informe
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}/equipo`}>
              <Users aria-hidden /> Equipo
            </Link>
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <MiniStat label="En prueba ahora" value={r.running} />
          <MiniStat label="Cerrados este mes" value={r.closedThisMonth} />
          <MiniStat label="Ganadores este mes" value={r.winnersThisMonth} />
          <MiniStat label={<Term k="winRate" />} value={formatPercent(r.hitRate)} />
          <MiniStat
            label={<Term k="estimatedValue">Valor al mes</Term>}
            value={r.value ? formatCop(r.value.monthly) : "—"}
          />
        </div>
        <Fold bare title={`Métricas norte (${r.northStars.length})`}>
          <NorthStarTable rows={r.northStars} />
        </Fold>
        {r.pendingDecisions.length ? (
          <p className="text-sm">
            <Gavel aria-hidden className="mr-1 inline size-4" />
            <span className="font-medium">{r.pendingDecisions.length}</span> esperando decisión.{" "}
            <Link href={`${base}/ejercicios`} className="underline underline-offset-4">
              Ver backlog
            </Link>
          </p>
        ) : null}
      </div>
    </Section>
  );
}

export default async function DirectionPage({ searchParams }: PageProps<"/direccion">) {
  const user = await requireUser();
  recordUsage("direccion", user.id);
  const today = todayIso();
  const sp = await searchParams;
  const periodKey = parsePeriod(sp.periodo);
  const rawView = typeof sp.vista === "string" ? sp.vista : undefined;
  const rawQuestion = typeof sp.pregunta === "string" ? sp.pregunta : undefined;
  const period = reportPeriod(periodKey, today);
  const programs = await listVisiblePrograms();
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
      report: buildReport({
        period,
        today,
        northStars: rollups[i].northStars,
        experiments: s.experiments,
        economics: s.economics,
        calendar: s.calendar,
      }),
      running: s.experiments
        .filter((e) => e.status === "in_test" || e.status === "in_reading")
        .map((e) => ({ id: e.id, title: e.title, line_name: e.line_name, status: e.status as "in_test" | "in_reading", actual_start: e.actual_start })),
    })),
    period,
    today,
  );
  // La respuesta de arriba usa los mismos programas que el resumen (el ejemplo solo si los reales aún no tienen datos).
  const h = directionHeadline(rollups.filter((r) => brief.programs.some((p) => p.id === r.id)));
  const briefText = executiveBriefToText(brief, { title: h.answerTitle, text: h.answerText });
  // North Star de Arriero: con los mismos programas del resumen; pilotos solo para quien tiene rol en Pilotos.
  const briefIds = new Set(brief.programs.map((p) => p.id));
  const usedExperiments = snapshots.filter((s) => briefIds.has(s.program.id)).flatMap((s) => s.experiments);
  const hasPilotRole = !!(await getPilotContext()).actor.role;
  const allPilots = hasPilotRole ? await listPilotsForDirection() : [];
  const realPilots = allPilots.filter((p) => !p.is_example);
  const pilotPool = brief.includesDemo || !realPilots.length ? allPilots : realPilots;
  const economics = new Map(snapshots.flatMap((s) => [...s.economics]));
  const [sustained, usage, pilotSection] = await Promise.all([
    loadSustainedLift(usedExperiments, economics, today).catch(() => null),
    user.isAdmin ? loadUsageDays(lastWeeks(today, ARRIERO_NORTH_STAR_WEEKS)[0]).catch(() => null) : Promise.resolve(null),
    hasPilotRole ? loadDirectionPilots(allPilots, today).catch(() => null) : Promise.resolve(null),
  ]);
  const decisions = growthDecisionsByWeek({ experiments: usedExperiments, pilots: pilotPool, today });
  const wau = usage ? weeklyActiveUsers(usage, today) : null;
  const pilotsBlock = pilotSection ? <DirectionPilotsSection {...pilotSection} /> : null;
  const glance = buildExecutiveGlance({ brief, headline: h, pilots: pilotPool, seed: today });

  const pending = rollups.flatMap((r) => r.pendingDecisions.map((p) => ({ ...p, programId: r.id, programName: r.name })));
  pending.sort((a, b) => a.since.localeCompare(b.since));

  const csvRows = rollups.flatMap((r) =>
    (r.northStars.length ? r.northStars : [null]).map((n) => ({ r, n })),
  );
  const csv = toCsv(csvRows, [
    { header: "Programa", value: ({ r }) => r.name },
    { header: "Línea", value: ({ n }) => n?.line_name ?? "" },
    { header: "Métrica norte", value: ({ n }) => n?.metric_name ?? "" },
    { header: "Unidad", value: ({ n }) => n?.unit ?? "" },
    { header: "Último valor", value: ({ n }) => n?.evaluation.latest ?? null },
    { header: "Semana del último valor", value: ({ n }) => n?.evaluation.latestWeek ?? "" },
    { header: "Horizonte", value: ({ n }) => n?.evaluation.horizonName ?? "" },
    { header: "Meta", value: ({ n }) => n?.evaluation.target ?? null },
    { header: "Esperado a la fecha", value: ({ n }) => (n?.evaluation.expected != null ? Math.round(n.evaluation.expected * 100) / 100 : null) },
    { header: "Frente a la meta", value: ({ n }) => (n ? TARGET_STATUS_LABEL[n.evaluation.status] : "") },
    { header: "En prueba", value: ({ r }) => r.running },
    { header: "Cerrados este mes", value: ({ r }) => r.closedThisMonth },
    { header: "Ganadores este mes", value: ({ r }) => r.winnersThisMonth },
    { header: "Tasa de acierto", value: ({ r }) => (r.hitRate == null ? null : Math.round(r.hitRate * 1000) / 1000) },
    { header: "Valor mensual estimado (COP)", value: ({ r }) => (r.value ? Math.round(r.value.monthly) : null) },
    { header: "Decisiones pendientes", value: ({ r }) => r.pendingDecisions.length },
  ]);

  // Primera pantalla: el vistazo. El detalle para el comité, una vista a la vez (?vista=), se puede compartir.
  const detailViews: { key: Exclude<DirectionView, "resumen">; label: string; count?: number; attention?: boolean }[] = [
    { key: "preguntas", label: "Las 9 preguntas" },
    { key: "programas", label: "Por programa", count: pending.length || undefined, attention: pending.length > 0 },
    { key: "metodo", label: "¿Funciona el método?" },
    ...(pilotsBlock ? [{ key: "pilotos" as const, label: "Pilotos de medios" }] : []),
    ...(TIA_ENABLED ? [{ key: "tia" as const, label: "Comité con la Tía" }] : []),
  ];
  const question = BRIEF_KEYS.includes(rawQuestion as BriefKey) ? (rawQuestion as BriefKey) : null;
  // Enlaces viejos: ?pregunta= sin vista abría las preguntas (antes eran la vista por defecto).
  const view: DirectionView = detailViews.some((v) => v.key === rawView)
    ? (rawView as DirectionView)
    : question
      ? "preguntas"
      : "resumen";
  const dirHref = (p: { vista?: DirectionView; periodo?: string; pregunta?: string }) => {
    const q = new URLSearchParams();
    const vista = p.vista ?? view;
    if (vista !== "resumen") q.set("vista", vista);
    const periodo = p.periodo ?? periodKey;
    if (periodo !== "semana") q.set("periodo", periodo);
    if (p.pregunta && vista === "preguntas") q.set("pregunta", p.pregunta);
    return `/direccion${q.size ? `?${q}` : ""}`;
  };
  const otherPeriod = periodKey === "semana" ? { key: "mes", label: "ver el mes" } : { key: "semana", label: "ver la semana" };
  const programNames = brief.programs.map((p) => p.name).join(", ");
  const tools = programs.length ? (
    <>
      <CopySummaryButton text={briefText} />
      <ExportCsvButton csv={csv} name={["resumen-ejecutivo", today]} />
    </>
  ) : null;

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-12">
        {programs.length === 0 ? (
          <>
            <h1 className="mb-5 font-heading text-3xl font-extrabold">¿Estamos creciendo?</h1>
            <EmptyState
              art="diana"
              icon={Compass}
              title="Todavía no hay programas para mostrar"
              description="Cuando lo agreguen a un programa, aquí va a ver su estado de un vistazo."
              action={
                <Button asChild variant="outline">
                  <Link href="/programas">Ir a Mis programas</Link>
                </Button>
              }
            />
            {pilotsBlock ? <div className="mt-6">{pilotsBlock}</div> : null}
          </>
        ) : view === "resumen" ? (
          <ExecutiveGlanceView
            glance={glance}
            eyebrow={
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  <span className="hidden sm:inline">Resumen ejecutivo · </span>
                  {period.label}
                </span>
                <Link href={dirHref({ periodo: otherPeriod.key })} scroll={false} className="normal-case tracking-normal underline underline-offset-4 hover:text-ink">
                  {otherPeriod.label}
                </Link>
              </span>
            }
            questionHref={(q) => dirHref({ vista: "preguntas", pregunta: q })}
            footer={
              <section aria-labelledby="para-el-comite" className="rounded-2xl border bg-wash/60 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 id="para-el-comite" className="font-heading text-lg font-extrabold">
                      ¿Va para el comité?
                    </h2>
                    <p className="text-sm text-soft">
                      Las 9 preguntas, cada programa, el método y los pilotos. Programas: {programNames}
                      {brief.includesDemo ? " (datos de ejemplo)" : ""}.
                    </p>
                  </div>
                  <Button asChild variant="outline">
                    <Link href={dirHref({ vista: "preguntas" })}>
                      Ver el detalle para el comité <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                  {detailViews.slice(1).map((v) => (
                    <Link
                      key={v.key}
                      href={dirHref({ vista: v.key })}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-paper px-3 text-sm hover:bg-wash"
                    >
                      {v.label}
                    </Link>
                  ))}
                  <span className="flex flex-wrap gap-2 sm:ml-auto">{tools}</span>
                </div>
              </section>
            }
          />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <Link href={dirHref({ vista: "resumen" })} className="inline-flex min-h-9 items-center gap-1 text-sm text-soft hover:text-ink">
                  <ArrowLeft aria-hidden className="size-4" /> Volver al vistazo
                </Link>
                <h1 className="font-heading text-2xl font-extrabold sm:text-3xl">El detalle para el comité</h1>
                <p className="text-sm text-soft">
                  {glance.title} · {programNames}
                  {brief.includesDemo ? " · con datos de ejemplo" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">{tools}</div>
            </div>

            <ViewTabs
              label="Secciones del detalle para el comité"
              active={view}
              tabs={detailViews.map((v) => ({ ...v, href: dirHref({ vista: v.key }) }))}
            />

            <div key={view} className="slide-in">
              {view === "preguntas" ? (
                <ExecutiveBriefView brief={brief} periodKey={periodKey} question={question} hrefFor={(p) => dirHref({ vista: "preguntas", ...p })} />
              ) : null}

              {view === "metodo" ? <ArrieroNorthStar decisions={decisions} sustained={sustained} wau={wau} /> : null}

              {view === "pilotos" ? pilotsBlock : null}

              {view === "tia" ? <TiaCommittee briefText={briefText} configured={tiaConfigured()} /> : null}

              {view === "programas" ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Headline
                      label={<Term k="northStar">Métricas norte en la meta</Term>}
                      value={h.northStarsEvaluated ? `${h.northStarsOnTrack}/${h.northStarsEvaluated}` : "—"}
                      hint={
                        h.northStarsTotal > h.northStarsEvaluated
                          ? `${h.northStarsTotal - h.northStarsEvaluated} sin meta o sin datos`
                          : `${h.northStarsOffTrack} muy atrás`
                      }
                    />
                    <Headline label="Ejercicios en prueba" value={h.running} hint={`${h.pendingDecisions} esperando decisión`} />
                    <Headline
                      label={<Term k="winRate" />}
                      value={formatPercent(h.hitRate)}
                      hint={`${h.winnersThisMonth} ganador${h.winnersThisMonth === 1 ? "" : "es"} de ${h.closedThisMonth} cerrado${h.closedThisMonth === 1 ? "" : "s"} este mes`}
                      highlight={h.winnersThisMonth > 0}
                    />
                    <Headline
                      label={<Term k="estimatedValue">Valor estimado al mes</Term>}
                      value={formatCop(h.monthlyValue)}
                      hint={
                        h.monthlyValue == null
                          ? h.missingUnitValue
                            ? `${h.missingUnitValue} ganador(es) sin valor por unidad en su métrica`
                            : "Todavía no hay ganadores con valor"
                          : `De ${h.valueCounted} ganador${h.valueCounted === 1 ? "" : "es"} si se escalan${h.missingUnitValue ? ` · ${h.missingUnitValue} sin valor por unidad` : ""}`
                      }
                    />
                  </div>

                  <Section title="Decisiones pendientes" description="Ya terminaron la prueba y esperan veredicto. Sin decidir no se aprende nada.">
                    {pending.length === 0 ? (
                      <p className="text-sm text-soft">¡Eso! No hay nada esperando decisión.</p>
                    ) : (
                      <ul className="divide-y">
                        {pending.map((p) => (
                          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                            <div className="min-w-0">
                              <Link href={`/programas/${p.programId}/ejercicios/${p.id}`} className="font-medium hover:underline">
                                {p.title}
                              </Link>
                              <div className="text-xs text-soft">
                                {p.programName} · {p.line_name} · en lectura desde el {formatDate(bogotaDate(p.since))}
                              </div>
                            </div>
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/programas/${p.programId}/ejercicios/${p.id}`}>
                                Decidir <ArrowRight aria-hidden />
                              </Link>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>

                  {rollups.map((r) => (
                    <ProgramCard key={r.id} r={r} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
