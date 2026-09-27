import { CalendarRange, Plus, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Callout, EmptyState, PageHeader } from "@/components/app/page";
import { UrlFilters } from "@/components/app/url-filters";
import { PilotGantt, type PilotGanttBar, type PilotGanttItem } from "@/components/pilots/calendar/pilot-gantt";
import { SegmentLinks, hrefWith } from "@/components/pilots/portfolio/segment-links";
import { Button } from "@/components/ui/button";
import { todayIso } from "@/domain/dates";
import { formatDateRange, formatMonth, formatShortDate } from "@/domain/format";
import { barGeometry, buildTimeline, pixelsPerDay, positionOf, timelineColumns, type Timeline } from "@/domain/gantt";
import { canWritePilots } from "@/domain/pilots/flow";
import { PILOT_STATUS_LABEL } from "@/domain/pilots/labels";
import { channelOptions, filterPilots, parsePortfolioFilters } from "@/domain/pilots/portfolio";
import { actualSpan, crossingsByPilot, parseCalendarScale, pilotCrossings, scheduleRange, spanText } from "@/domain/pilots/schedule";
import { PILOT_STATUSES } from "@/domain/pilots/types";
import type { IsoDate } from "@/domain/types";
import { getPilotContext, isPilotsReady } from "@/server/pilot-auth";
import { listPilots } from "@/server/queries/pilots";

export const metadata: Metadata = { title: "Calendario de pilotos" };

function bar(timeline: Timeline, start: IsoDate | null, end: IsoDate | null, ongoing = false): PilotGanttBar | null {
  const g = barGeometry(timeline, start, end);
  if (!g || !start) return null;
  return { ...g, range: formatDateRange(start, end ?? start), ongoing };
}

export default async function PilotsCalendarPage({ searchParams }: PageProps<"/pilotos/calendario">) {
  const { actor } = await getPilotContext();
  if (!actor.role || !(await isPilotsReady())) return null;
  const sp = await searchParams;
  const scale = parseCalendarScale(sp.escala);
  const today = todayIso();

  const pilots = await listPilots();
  // Solo estado y canal en el calendario; el resto de filtros no aplica aquí.
  const base = parsePortfolioFilters(sp);
  const filtered = filterPilots(pilots, { ...parsePortfolioFilters({}), estado: base.estado, canal: base.canal }).sort((a, b) =>
    (a.actual_start ?? a.planned_start ?? "9999").localeCompare(b.actual_start ?? b.planned_start ?? "9999"),
  );

  // Los cruces se buscan entre todos los pilotos: uno oculto por el filtro igual contamina.
  const crossings = pilotCrossings(pilots.map((p) => p.summary));
  const byPilot = crossingsByPilot(crossings);
  const visibleIds = new Set(filtered.map((p) => p.id));
  const visibleCrossings = crossings.filter((c) => visibleIds.has(c.aId) || visibleIds.has(c.bId));

  const range = scheduleRange(filtered, today);
  const timeline = buildTimeline(range.start, range.end);
  const zoom = scale === "mes" ? "month" : "week";
  const widthPx = timeline.totalDays * pixelsPerDay(zoom);
  const months = timelineColumns(timeline, "month", formatMonth);
  const weeks = zoom === "week" ? timelineColumns(timeline, "week", (d) => formatShortDate(d)) : null;
  const todayLeft = today >= timeline.start && today <= timeline.end ? positionOf(timeline, today) + 100 / timeline.totalDays / 2 : null;

  const items: PilotGanttItem[] = filtered.map((p) => {
    const span = actualSpan(p, today);
    return {
      id: p.id,
      title: p.title,
      status: p.status,
      ownerName: p.owner_name,
      planned: bar(timeline, p.planned_start, p.planned_end),
      actual: span ? bar(timeline, span.start, span.end, span.ongoing) : null,
      crossings: (byPilot.get(p.id) ?? []).map((c) => `«${c.otherTitle}» (${c.text.charAt(0).toLowerCase()}${c.text.slice(1)})`),
      isExample: p.is_example,
    };
  });

  return (
    <div>
      <PageHeader
        eyebrow="Pilotos de medios"
        title="Calendario de pilotos"
        description="Todos los pilotos en la línea de tiempo, con lo planeado y lo real. Si dos pilotos corren a la vez sobre la misma cuenta, campaña, audiencia, ciudad o destino, se contaminan: aquí se ven los cruces."
        actions={
          <SegmentLinks
            label="Escala de la línea de tiempo"
            options={[
              { href: hrefWith("/pilotos/calendario", sp, "escala", null), label: "Semana", active: scale === "semana" },
              { href: hrefWith("/pilotos/calendario", sp, "escala", "mes"), label: "Mes", active: scale === "mes" },
            ]}
          />
        }
      />

      {pilots.length === 0 ? (
        <EmptyState
          art="camino"
          icon={CalendarRange}
          title="Camino despejado: todavía no hay pilotos"
          description="Cada piloto aparece aquí con su barra planeada apenas tenga fechas, y con la real cuando arranque."
          action={
            canWritePilots(actor) ? (
              <Button asChild>
                <Link href="/pilotos/nuevo">
                  <Plus aria-hidden /> Nuevo piloto
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-4">
          <UrlFilters
            filters={[
              { param: "estado", label: "Estado", options: PILOT_STATUSES.map((s) => ({ value: s, label: PILOT_STATUS_LABEL[s] })) },
              { param: "canal", label: "Canal", options: channelOptions(pilots).map((m) => ({ value: m, label: m })) },
            ]}
          />

          {visibleCrossings.length ? (
            <Callout icon={TriangleAlert} title="Ojo: estos pilotos se cruzan">
              <ul className="mt-1 space-y-1.5">
                {visibleCrossings.map((c) => (
                  <li key={`${c.aId}-${c.bId}`} className="leading-snug">
                    <Link href={`/pilotos/${c.aId}`} className="font-medium underline-offset-2 hover:underline">
                      {c.aTitle}
                    </Link>
                    <span className="text-ink/80"> y </span>
                    <Link href={`/pilotos/${c.bId}`} className="font-medium underline-offset-2 hover:underline">
                      {c.bTitle}
                    </Link>
                    <span className="text-ink/80">
                      {" "}
                      · {c.text} · {spanText(c.from, c.to, formatShortDate)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs">Mueva las fechas o separe cuentas, campañas o ciudades para que cada lectura quede limpia.</p>
            </Callout>
          ) : null}

          {items.length === 0 ? (
            <p className="rounded-2xl border border-dashed bg-paper py-10 text-center text-sm text-soft">
              Ningún piloto coincide con los filtros. Ese camino no era: pruebe con otros.
            </p>
          ) : (
            <PilotGantt widthPx={widthPx} months={months} weeks={weeks} todayLeft={todayLeft} items={items} />
          )}
          <p className="text-xs text-soft">
            Rango: {formatDateRange(timeline.start, timeline.end)}. Haga clic en una barra para abrir el piloto. Los pilotos decididos y cancelados no se
            cuentan en los cruces.
          </p>
        </div>
      )}
    </div>
  );
}
