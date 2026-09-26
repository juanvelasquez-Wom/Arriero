import { CalendarRange, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Callout, EmptyState } from "@/components/app/page";
import { DashboardFrame, FilteredOutNote } from "@/components/dashboards/dashboard-frame";
import { Gantt, type GanttBar, type GanttGroup } from "@/components/dashboards/gantt";
import { Button } from "@/components/ui/button";
import { firstParam } from "@/domain/dashboard-filters";
import { addDays, maxDate, minDate } from "@/domain/dates";
import { formatDateRange, formatMonth, formatShortDate } from "@/domain/format";
import {
  barGeometry,
  buildTimeline,
  crossesFreeze,
  pixelsPerDay,
  positionOf,
  timelineColumns,
  type GanttZoom,
  type Timeline,
} from "@/domain/gantt";
import type { IsoDate } from "@/domain/types";
import { cn } from "@/lib/utils";
import { loadDashboard } from "../_lib/data";

export const metadata: Metadata = { title: "Gantt" };

const RUNNING = new Set(["in_test", "in_reading"]);

function bar(timeline: Timeline, start: IsoDate | null, end: IsoDate | null, ongoing = false): GanttBar | null {
  const g = barGeometry(timeline, start, end);
  if (!g || !start) return null;
  return { ...g, range: formatDateRange(start, end ?? start), ongoing };
}

export default async function GanttPage({ params, searchParams }: PageProps<"/programas/[programId]/tableros/gantt">) {
  const { programId } = await params;
  const sp = await searchParams;
  const data = await loadDashboard(programId, sp);
  const zoom: GanttZoom = firstParam(sp.zoom) === "mes" ? "month" : "week";

  // Rango: el del programa; si falta, el de los ejercicios y el calendario.
  const allDates = [
    ...data.experiments.flatMap((e) => [e.planned_start, e.planned_end, e.actual_start, e.actual_end]),
    ...data.calendar.flatMap((c) => [c.start_date, c.end_date]),
  ];
  const start = data.program.start_date ?? minDate(...allDates) ?? data.today;
  const end = data.program.end_date ?? maxDate(...allDates, addDays(start, 90)) ?? addDays(start, 90);
  const timeline = buildTimeline(start, end);
  const widthPx = timeline.totalDays * pixelsPerDay(zoom);

  const months = timelineColumns(timeline, "month", formatMonth);
  const weeks = zoom === "week" ? timelineColumns(timeline, "week", (d) => formatShortDate(d)) : null;
  const events = data.calendar
    .map((ev) => {
      const g = barGeometry(timeline, ev.start_date, ev.end_date);
      return g ? { id: ev.id, type: ev.type, name: ev.name, ...g, range: formatDateRange(ev.start_date, ev.end_date) } : null;
    })
    .filter((e) => e != null);
  const todayLeft =
    data.today >= timeline.start && data.today <= timeline.end ? positionOf(timeline, data.today) + 100 / timeline.totalDays / 2 : null;

  const visibleLines = data.filters.linea ? data.lines.filter((l) => l.id === data.filters.linea) : data.lines;
  const groups: GanttGroup[] = visibleLines.map((line) => ({
    lineId: line.id,
    lineName: line.name,
    items: data.filtered
      .filter((e) => e.line_id === line.id)
      .sort((a, b) => (a.actual_start ?? a.planned_start ?? "9999").localeCompare(b.actual_start ?? b.planned_start ?? "9999"))
      .map((e) => {
        const ongoing = !e.actual_end && RUNNING.has(e.status) && !!e.actual_start;
        const actualEnd = ongoing ? maxDate(e.actual_start, data.today) : e.actual_end;
        const planned = bar(timeline, e.planned_start, e.planned_end);
        const actual = bar(timeline, e.actual_start, actualEnd, ongoing);
        return {
          id: e.id,
          title: e.title,
          status: e.status,
          ownerName: e.owner_name,
          planned,
          actual,
          freezes: crossesFreeze(e, data.calendar).map((f) => f.name),
          noDates: !e.planned_start && !e.actual_start,
          outOfRange: !planned && !actual && !!(e.planned_start || e.actual_start),
        };
      }),
  }));
  const crossing = groups.flatMap((g) => g.items).filter((i) => i.freezes.length > 0);

  const zoomHref = (z: "semana" | "mes") => `?${new URLSearchParams({ ...data.current, zoom: z }).toString()}`;
  const zoomLinks = (
    <div role="group" aria-label="Zoom de la línea de tiempo" className="inline-flex rounded-lg border bg-paper p-0.5">
      {(["semana", "mes"] as const).map((z) => {
        const active = (z === "mes") === (zoom === "month");
        return (
          <Button key={z} asChild size="sm" variant="ghost" className={cn(active && "bg-gray-1 font-semibold")}>
            <Link href={zoomHref(z)} aria-current={active ? "true" : undefined} scroll={false}>
              {z === "semana" ? "Semana" : "Mes"}
            </Link>
          </Button>
        );
      })}
    </div>
  );

  return (
    <DashboardFrame
      programId={programId}
      active="gantt"
      title="Gantt"
      description="Todos los ejercicios en la línea de tiempo del programa, agrupados por línea, con congelamientos, picos y el punto de decisión."
      actions={zoomLinks}
      fields={data.globalFields}
      current={data.current}
      query={data.query}
    >
      {data.lines.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="Aún no hay líneas de negocio"
          description="El Gantt agrupa los ejercicios por línea. Crea las líneas del programa en la configuración para empezar."
          action={
            <Button asChild variant="outline">
              <Link href={`/programas/${programId}/configuracion?paso=lineas`}>Configurar líneas</Link>
            </Button>
          }
        />
      ) : data.filtered.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No hay ejercicios para mostrar"
          description={
            <>
              Cada ejercicio aparece aquí con su barra planeada y la real en cuanto tenga fechas.
              <FilteredOutNote active={data.filtersActive} />
            </>
          }
          action={
            <Button asChild variant="outline">
              <Link href={`/programas/${programId}/ejercicios`}>Ir al backlog</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {crossing.length ? (
            <Callout icon={TriangleAlert} title={`${crossing.length} ejercicio(s) se cruzan con un congelamiento`}>
              {crossing.map((c) => c.title).join(" · ")}. En congelamiento no se lanzan ejercicios: revisa sus fechas.
            </Callout>
          ) : null}
          <Gantt
            programId={programId}
            widthPx={widthPx}
            months={months}
            weeks={weeks}
            events={events}
            todayLeft={todayLeft}
            groups={groups}
          />
          <p className="text-xs text-soft">
            Rango: {formatDateRange(timeline.start, timeline.end)}
            {data.program.start_date && data.program.end_date ? " (fechas del programa)" : " (calculado con los ejercicios y el calendario)"}.
            Haz clic en una barra para abrir el detalle del ejercicio.
          </p>
        </div>
      )}
    </DashboardFrame>
  );
}
