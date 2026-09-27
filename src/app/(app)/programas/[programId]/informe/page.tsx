import { AlertTriangle, CalendarRange, Gavel, ListOrdered, Rocket, Snowflake, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ExportCsvButton } from "@/components/app/export-csv-button";
import { Term } from "@/components/app/info-tip";
import { PageHeader, Section } from "@/components/app/page";
import { DecisionBadge, StatusBadge, VerdictBadge } from "@/components/app/status-badge";
import { TargetStatusBadge } from "@/components/lines/target-status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toCsv } from "@/domain/csv";
import { todayIso } from "@/domain/dates";
import { formatDate, formatMetricValue, formatScore, formatSignedPercent } from "@/domain/format";
import { DECISION_LABEL, VERDICT_LABEL, labelOf } from "@/domain/labels";
import { buildReport, parsePeriod, reportPeriod, reportToText, type ReportRiskKind } from "@/domain/report";
import { evaluateNorthStars } from "@/domain/rollup";
import { formatCop } from "@/domain/value";
import { cn } from "@/lib/utils";
import { getProgramContext } from "@/server/auth";
import { loadProgramSnapshot } from "@/server/queries/management";
import { CopySummaryButton, PrintButton } from "@/components/app/report-actions";

export const metadata: Metadata = { title: "Informe" };

// Al imprimir se esconden el header, la navegación lateral y los controles.
const PRINT_CSS = `@media print {
  header, aside, [data-print-hide] { display: none !important; }
  body, main { background: #fff !important; }
  main { padding: 0 !important; }
  section { break-inside: avoid; box-shadow: none !important; }
}`;

const RISK_ICON: Record<ReportRiskKind, typeof Snowflake> = {
  freeze: Snowflake,
  off_track: AlertTriangle,
  behind: AlertTriangle,
  pending: Gavel,
};

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-soft">{children}</p>;
}

export default async function ReportPage({ params, searchParams }: PageProps<"/programas/[programId]/informe">) {
  const { programId } = await params;
  const sp = await searchParams;
  const ctx = await getProgramContext(programId);
  const today = todayIso();
  const key = parsePeriod(sp.periodo);
  const period = reportPeriod(key, today);
  const snap = await loadProgramSnapshot(
    {
      id: ctx.program.id,
      name: ctx.program.name,
      is_demo: ctx.program.is_demo,
      start_date: ctx.program.start_date,
      end_date: ctx.program.end_date,
    },
    today,
  );
  const report = buildReport({
    period,
    today,
    northStars: evaluateNorthStars({ northStars: snap.northStars, horizons: snap.horizons, start_date: snap.program.start_date, today }),
    experiments: snap.experiments,
    economics: snap.economics,
    calendar: snap.calendar,
  });
  const text = reportToText(report, ctx.program.name);
  const base = `/programas/${programId}`;

  const csv = toCsv(report.closed, [
    { header: "Ejercicio", value: (c) => c.title },
    { header: "Línea", value: (c) => c.line_name },
    { header: "Decidido", value: (c) => c.decided ?? "" },
    { header: "Veredicto", value: (c) => labelOf(VERDICT_LABEL, c.verdict, "") },
    { header: "Decisión", value: (c) => labelOf(DECISION_LABEL, c.decision, "") },
    { header: "Diferencia vs control", value: (c) => (c.diff == null ? null : Math.round(c.diff * 10000) / 10000) },
    { header: "Valor mensual estimado (COP)", value: (c) => (c.monthlyValue == null ? null : Math.round(c.monthlyValue)) },
    { header: "Justificación", value: (c) => c.rationale ?? "" },
    { header: "Aprendizaje", value: (c) => c.learning ?? "" },
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <style>{PRINT_CSS}</style>
      <PageHeader
        eyebrow="Informe para el comité"
        title={`Informe de growth · ${ctx.program.name}`}
        description={
          <>
            {period.label}: del {formatDate(period.start)} al {formatDate(period.end)}. Qué se movió, qué se lanzó, qué se cerró y qué
            sigue. Menos carreta, más crecimiento.
          </>
        }
        actions={
          <div data-print-hide className="flex flex-wrap items-center gap-2">
            <CopySummaryButton text={text} />
            <PrintButton />
          </div>
        }
      />

      <nav data-print-hide aria-label="Periodo del informe" className="mb-6 inline-flex rounded-xl border bg-paper p-1 text-sm">
        {(["semana", "mes"] as const).map((k) => (
          <Link
            key={k}
            href={`${base}/informe?periodo=${k}`}
            aria-current={k === key ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium",
              k === key ? "bg-highlight text-[#1F1F1F]" : "text-soft hover:bg-wash hover:text-ink",
            )}
          >
            <CalendarRange aria-hidden className="size-3.5" /> {k === "semana" ? "Última semana" : "Último mes"}
          </Link>
        ))}
      </nav>

      <div className="space-y-6">
        <Section
          title={<span className="inline-flex items-center gap-1.5"><TrendingUp aria-hidden className="size-4" /> Qué se movió</span>}
          description="Último valor de cada métrica norte, cuánto cambió frente a antes del periodo y cómo va frente a la meta."
        >
          {report.moved.length === 0 ? (
            <Empty>El programa todavía no tiene métricas norte.</Empty>
          ) : (
            <div className="-m-5 overflow-x-auto">
              <Table className="tabular-nums">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Línea</TableHead>
                    <TableHead>
                      <Term k="northStar" />
                    </TableHead>
                    <TableHead className="text-right">Último valor</TableHead>
                    <TableHead className="text-right">Cambio en el periodo</TableHead>
                    <TableHead className="text-right">
                      <Term k="target" />
                    </TableHead>
                    <TableHead className="pr-5">
                      <Term k="targetStatus" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.moved.map((m) => (
                    <TableRow key={`${m.line_name}-${m.metric_name}`}>
                      <TableCell className="pl-5 font-medium">{m.line_name}</TableCell>
                      <TableCell>{m.metric_name}</TableCell>
                      <TableCell className="text-right">
                        {formatMetricValue(m.latest, m.unit)}
                        {m.latestWeek ? <div className="text-[11px] text-soft">semana del {formatDate(m.latestWeek)}</div> : null}
                      </TableCell>
                      <TableCell className="text-right">{formatSignedPercent(m.change)}</TableCell>
                      <TableCell className="text-right">
                        {m.target != null ? `${formatMetricValue(m.target, m.unit)} (${m.horizonName})` : "—"}
                      </TableCell>
                      <TableCell className="pr-5">
                        <TargetStatusBadge status={m.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>

        <div className="grid gap-4 md:grid-cols-2">
          <Section title={<span className="inline-flex items-center gap-1.5"><Rocket aria-hidden className="size-4" /> Qué se lanzó</span>}>
            {report.launched.length === 0 ? (
              <Empty>Nada arrancó en este periodo.</Empty>
            ) : (
              <ul className="divide-y">
                {report.launched.map((l) => (
                  <li key={l.id} className="py-2 first:pt-0 last:pb-0">
                    <Link href={`${base}/ejercicios/${l.id}`} className="font-medium hover:underline">
                      {l.title}
                    </Link>
                    <div className="text-xs text-soft">
                      {l.line_name} · desde el {formatDate(l.actual_start)}
                      {l.owner_name ? ` · ${l.owner_name}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title={<Term k="estimatedValue" />}
            description="Lo que valdrían al mes los ganadores cerrados en el periodo si se escalan. Es un orden de magnitud, no una promesa."
          >
            {report.value?.counted ? (
              <div>
                <div className="font-heading text-3xl font-extrabold tabular-nums">≈ {formatCop(report.value.monthly)}</div>
                <div className="mt-1 text-xs text-soft">
                  al mes, de {report.value.counted} ganador{report.value.counted === 1 ? "" : "es"}
                  {report.value.missingUnitValue ? ` · ${report.value.missingUnitValue} sin valor por unidad` : ""}
                </div>
              </div>
            ) : (
              <Empty>
                {report.value?.missingUnitValue
                  ? `${report.value.missingUnitValue} ganador(es) sin valor por unidad en su métrica: agréguelo para ver la plata.`
                  : `Sin ganadores en este periodo (${report.winners}).`}
              </Empty>
            )}
          </Section>
        </div>

        <Section
          title={<span className="inline-flex items-center gap-1.5"><Gavel aria-hidden className="size-4" /> Qué se cerró</span>}
          description="Ejercicios decididos en el periodo, con su veredicto, la decisión y lo que aprendimos."
          actions={report.closed.length ? <span data-print-hide><ExportCsvButton csv={csv} name={["informe", ctx.program.name, key, today]} /></span> : null}
        >
          {report.closed.length === 0 ? (
            <Empty>Ningún ejercicio se decidió en este periodo.</Empty>
          ) : (
            <ul className="space-y-4">
              {report.closed.map((c) => (
                <li
                  key={c.id}
                  className={cn("rounded-xl border p-4", c.verdict === "winner" && "border-l-4 border-l-highlight bg-highlight/5")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`${base}/ejercicios/${c.id}`} className="font-semibold hover:underline">
                      {c.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <VerdictBadge verdict={c.verdict} />
                      <DecisionBadge decision={c.decision} />
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-soft tabular-nums">
                    {c.line_name} · decidido el {formatDate(c.decided)}
                    {c.diff != null ? ` · ${formatSignedPercent(c.diff)} vs. control` : ""}
                    {c.monthlyValue != null ? ` · ≈ ${formatCop(c.monthlyValue)} al mes` : ""}
                  </div>
                  {c.learning ? (
                    <p className="mt-2 text-sm">
                      <span className="font-medium">Aprendizaje:</span> {c.learning}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="grid gap-4 md:grid-cols-2">
          <Section
            title={<span className="inline-flex items-center gap-1.5"><ListOrdered aria-hidden className="size-4" /> Qué sigue</span>}
            description={
              <>
                Los 5 priorizados o en diseño con mejor <Term k="finalScore">puntaje final</Term>.
              </>
            }
          >
            {report.nextUp.length === 0 ? (
              <Empty>No hay ejercicios priorizados. Hágale pues: califique el backlog.</Empty>
            ) : (
              <ol className="space-y-2">
                {report.nextUp.map((n, i) => (
                  <li key={n.id} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-wash text-xs font-bold tabular-nums">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={`${base}/ejercicios/${n.id}`} className="font-medium hover:underline">
                        {n.title}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-soft tabular-nums">
                        <StatusBadge status={n.status} /> {n.line_name} · puntaje {formatScore(n.final_score)}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section
            title={<span className="inline-flex items-center gap-1.5"><AlertTriangle aria-hidden className="size-4" /> Riesgos</span>}
            description="Congelamientos de los próximos 30 días, métricas norte atrasadas y decisiones pendientes."
          >
            {report.risks.length === 0 ? (
              <Empty>Sin riesgos a la vista. ¡Eso!</Empty>
            ) : (
              <ul className="space-y-3">
                {report.risks.map((r, i) => {
                  const Icon = RISK_ICON[r.kind];
                  return (
                    <li key={`${r.kind}-${i}`} className="flex gap-2.5 text-sm">
                      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", r.kind === "off_track" && "text-ink")} />
                      <div>
                        <div className="font-medium">{r.title}</div>
                        <div className="text-soft">{r.detail}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
