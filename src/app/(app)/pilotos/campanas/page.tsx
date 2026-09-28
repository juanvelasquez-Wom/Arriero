import { CalendarDays, CalendarRange, Plug, Scale, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Callout, EmptyState, PageHeader, Section, Stat } from "@/components/app/page";
import { BusinessImport } from "@/components/pilots/campaigns/business-import";
import { CampaignsTable } from "@/components/pilots/campaigns/campaigns-table";
import { ReconciliationTable } from "@/components/pilots/campaigns/reconciliation-table";
import { Trend } from "@/components/pilots/campaigns/trend";
import { DateRangeFilter } from "@/components/pilots/portfolio/date-range-filter";
import { SegmentLinks, hrefWith } from "@/components/pilots/portfolio/segment-links";
import { Button } from "@/components/ui/button";
import { todayIso } from "@/domain/dates";
import { formatDate, formatNumber, formatPercent } from "@/domain/format";
import { aggregateCampaigns, campaignSummary, changeRatio, parseCampaignRange, previousRange } from "@/domain/pilots/campaigns";
import { canWritePilots } from "@/domain/pilots/flow";
import { reconcile, reconciliationTotals } from "@/domain/pilots/reconciliation";
import { formatCop } from "@/domain/value";
import { getPilotContext, isPilotsReady } from "@/server/pilot-auth";
import { listAdFacts, listBusinessConversions } from "@/server/queries/pilots";

export const metadata: Metadata = { title: "Campañas" };

export default async function CampaignsPage({ searchParams }: PageProps<"/pilotos/campanas">) {
  const { actor } = await getPilotContext();
  if (!actor.role || !(await isPilotsReady())) return null;
  const sp = await searchParams;
  const today = todayIso();
  const range = parseCampaignRange(sp, today);
  const prev = previousRange(range);
  const byWeek = (Array.isArray(sp.periodo) ? sp.periodo[0] : sp.periodo) === "semana";
  const canWrite = canWritePilots(actor);

  const [facts, sales] = await Promise.all([listAdFacts(prev.from, range.to), listBusinessConversions(range.from, range.to)]);
  const rows = aggregateCampaigns(facts, range);
  const summary = campaignSummary(facts, range);
  const flagged = rows.filter((r) => r.flags.length).length;
  const reconciliation = reconcile(facts, sales, { from: range.from, to: range.to, period: byWeek ? "week" : "range" });
  const totals = reconciliationTotals(reconciliation);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pilotos de medios"
        title="Campañas"
        description="Cómo van las campañas día a día, frente al periodo anterior del mismo largo, y qué tanto de lo que dice la plataforma se vuelve venta en el negocio."
        actions={<DateRangeFilter legend="Fechas de las campañas" />}
      />
      <p className="-mt-4 inline-flex items-center gap-1.5 text-xs text-soft tabular-nums">
        <CalendarRange aria-hidden className="size-3.5" />
        {formatDate(range.from)} – {formatDate(range.to)} · se compara con {formatDate(prev.from)} – {formatDate(prev.to)}
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="Todavía no hay datos de campañas en estas fechas"
          description={
            <>
              Los datos llegan solos cada mañana cuando la cuenta de Meta está conectada (Catálogos › Integraciones) y las integraciones están prendidas.
              Mientras tanto, los pilotos siguen con carga manual y la conciliación de abajo funciona con lo que suba del negocio.
            </>
          }
          action={
            <Button asChild variant="outline">
              <Link href="/pilotos/catalogos?tab=integraciones">
                <Plug aria-hidden /> Ver integraciones
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Inversión"
              value={formatCop(summary.current.spend)}
              hint={<Trend change={changeRatio(summary.current.spend, summary.previous.spend)} neutral />}
            />
            <Stat
              label="Conversaciones"
              value={formatNumber(summary.current.conversations)}
              hint={<Trend change={changeRatio(summary.current.conversations, summary.previous.conversations)} />}
            />
            <Stat
              label="Costo por conversación"
              value={formatCop(summary.current.costPerConversation)}
              hint={<Trend change={changeRatio(summary.current.costPerConversation, summary.previous.costPerConversation)} lowerIsBetter />}
            />
            <Stat
              label="Campañas que piden atención"
              value={formatNumber(flagged)}
              hint={`de ${formatNumber(rows.length)} con datos`}
              highlight={flagged > 0}
            />
          </div>
          <Section title="Por campaña" description="Primero las que piden atención; después, por inversión. CTR = clics / impresiones; CPC = inversión / clics.">
            <CampaignsTable rows={rows} />
          </Section>
        </>
      )}

      <Section
        title="Plataforma vs. negocio"
        description="Lo que la plataforma se atribuye (conversaciones) frente a lo que el negocio registra (ventas). Se cruza por el nombre de la campaña."
        actions={
          <SegmentLinks
            label="Periodo de la conciliación"
            options={[
              { href: hrefWith("/pilotos/campanas", sp, "periodo", null), label: "Todo el rango", active: !byWeek, icon: CalendarRange },
              { href: hrefWith("/pilotos/campanas", sp, "periodo", "semana"), label: "Por semana", active: byWeek, icon: CalendarDays },
            ]}
          />
        }
      >
        <div className="space-y-5">
          {canWrite ? <BusinessImport today={today} /> : null}
          {reconciliation.length === 0 ? (
            <EmptyState
              icon={Scale}
              title="Nada que conciliar en estas fechas"
              description={
                canWrite
                  ? "Suba las ventas del negocio (del CRM o el BSS) con la plantilla. Con los datos de la plataforma al lado, aquí se ve el CAC real."
                  : "Cuando el equipo suba las ventas del negocio, aquí se ve cuánto de lo que dice la plataforma se vuelve venta."
              }
              className="py-8"
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat
                  label="Conversación → venta"
                  value={formatPercent(totals.conversationToSale)}
                  hint={`${formatNumber(totals.sales)} ventas de ${formatNumber(totals.conversations)} conversaciones (${totals.matched} ${totals.matched === 1 ? "campaña cruzada" : "campañas cruzadas"})`}
                />
                <Stat label="CAC real" value={formatCop(totals.realCac)} hint="Inversión / ventas del negocio, en las campañas cruzadas" />
                <Stat
                  label="Sin cruzar"
                  value={formatNumber(totals.platformOnly + totals.businessOnly)}
                  hint={`${totals.platformOnly} solo en la plataforma · ${totals.businessOnly} solo en el negocio`}
                />
              </div>
              {totals.doubleCountRisks ? (
                <Callout icon={TriangleAlert} title="Ojo con el doble conteo">
                  En {totals.doubleCountRisks} {totals.doubleCountRisks === 1 ? "fila" : "filas"} el negocio registra más ventas que conversaciones. Revise que
                  las ventas de otros canales no estén marcadas con el nombre de la campaña.
                </Callout>
              ) : null}
              <ReconciliationTable rows={reconciliation} byWeek={byWeek} />
            </>
          )}
        </div>
      </Section>
    </div>
  );
}
