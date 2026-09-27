import { ArrowRight, Compass, FileText, Gavel, TrendingUp, Users } from "lucide-react";
import { ExecutiveBriefView } from "@/components/app/executive-brief";
import { CopySummaryButton } from "@/components/app/report-actions";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/app/app-header";
import { ExportCsvButton } from "@/components/app/export-csv-button";
import { Term } from "@/components/app/info-tip";
import { Callout, EmptyState, PageHeader, Section } from "@/components/app/page";
import { DemoBadge } from "@/components/app/status-badge";
import { TargetStatusSummary } from "@/components/lines/target-status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toCsv } from "@/domain/csv";
import { todayIso } from "@/domain/dates";
import { formatDate, formatMetricValue, formatPercent } from "@/domain/format";
import { buildExecutiveBrief, executiveBriefToText } from "@/domain/executive";
import { buildReport, parsePeriod, reportPeriod } from "@/domain/report";
import { bogotaDate, directionHeadline, rollupProgram, type NorthStarStatus, type ProgramRollup } from "@/domain/rollup";
import { TARGET_STATUS_LABEL } from "@/domain/targets";
import { formatCop } from "@/domain/value";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { listVisiblePrograms, loadSnapshots } from "@/server/queries/management";

export const metadata: Metadata = { title: "Resumen ejecutivo" };

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
        <NorthStarTable rows={r.northStars} />
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
  const today = todayIso();
  const periodKey = parsePeriod((await searchParams).periodo);
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

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <PageHeader
          eyebrow="Resumen ejecutivo · para dirección"
          title="¿Estamos creciendo?"
          description="Lo que un director o un CMO necesita saber de todos los programas, en una sola página y sin carreta: qué crece, qué cae, qué se está probando, qué ganó, qué aprendimos, cuánto vale y qué hay que decidir."
          actions={
            programs.length ? (
              <>
                <CopySummaryButton text={briefText} />
                <ExportCsvButton csv={csv} name={["resumen-ejecutivo", today]} />
              </>
            ) : null
          }
        />

        {programs.length === 0 ? (
          <EmptyState art="diana"
            icon={Compass}
            title="Todavía no hay programas para mostrar"
            description="Cuando lo agreguen a un programa, aquí va a ver su estado de un vistazo."
            action={
              <Button asChild variant="outline">
                <Link href="/programas">Ir a Mis programas</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-6">
            <Callout
              icon={TrendingUp}
              tone={h.answer === "yes" || h.answer === "unknown" ? "neutral" : "attention"}
              title={<span className="text-base">{h.answerTitle}</span>}
            >
              {h.answerText}
              {h.includesDemo ? " (Con datos del programa de ejemplo.)" : null}
            </Callout>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Headline
                label={<Term k="northStar">Métricas norte en la meta</Term>}
                value={h.northStarsEvaluated ? `${h.northStarsOnTrack}/${h.northStarsEvaluated}` : "—"}
                hint={
                  h.northStarsTotal > h.northStarsEvaluated
                    ? `${h.northStarsTotal - h.northStarsEvaluated} sin meta o sin datos`
                    : `${h.northStarsOffTrack} muy atrás`
                }
                highlight={h.answer === "yes"}
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

            <ExecutiveBriefView brief={brief} periodKey={periodKey} />

            <h2 className="pt-4 text-2xl font-extrabold">Por programa</h2>

            <Section
              title="Decisiones pendientes"
              description="Ejercicios que ya terminaron la prueba y esperan veredicto y decisión. Mientras no se decidan, no se aprende nada."
            >
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
        )}
      </main>
    </>
  );
}
