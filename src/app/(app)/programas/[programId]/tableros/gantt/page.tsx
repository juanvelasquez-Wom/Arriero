import { CalendarRange, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/page";
import { TimelineGantt, type TimelineBar, type TimelineGroup } from "@/components/boards/timeline-gantt";
import { DashboardFrame, FilteredOutNote } from "@/components/dashboards/dashboard-frame";
import { Button } from "@/components/ui/button";
import { experimentColumn } from "@/domain/boards";
import { asCollisionCandidate, collisionPairs, describeCollision } from "@/domain/collisions";
import { firstParam } from "@/domain/dashboard-filters";
import { formatDateRange } from "@/domain/format";
import {
  barGeometry,
  boardRange,
  crossesFreeze,
  displaySpan,
  ganttScale,
  ganttZoomParam,
  GANTT_ZOOMS,
  parseGanttZoom,
  spanProgress,
  type DisplaySpan,
  type GanttZoom,
  type Timeline,
} from "@/domain/gantt";
import { STATUS_LABEL } from "@/domain/labels";
import { loadDashboard } from "../_lib/data";

export const metadata: Metadata = { title: "Gantt" };

const RUNNING = new Set(["in_test", "in_reading"]);

function toBar(timeline: Timeline, span: DisplaySpan | null): TimelineBar | null {
  if (!span) return null;
  const g = barGeometry(timeline, span.start, span.end);
  return g ? { ...g, range: formatDateRange(span.start, span.end), mode: span.mode, ongoing: span.ongoing, progress: spanProgress(span) } : null;
}

export default async function GanttPage({ params, searchParams }: PageProps<"/programas/[programId]/tableros/gantt">) {
  const { programId } = await params;
  const sp = await searchParams;
  const data = await loadDashboard(programId, sp);
  // El mes es la vista por defecto: se lee de un vistazo. La semana y el trimestre, a pedido.
  const zoom: GanttZoom = parseGanttZoom(firstParam(sp.zoom));

  // Rango: el del programa, estirado para que quepan los ejercicios, el calendario y hoy, con margen.
  const spans = new Map(data.filtered.map((e) => [e.id, displaySpan(e, RUNNING.has(e.status), data.today)]));
  const allDates = [
    data.program.start_date,
    data.program.end_date,
    ...[...spans.values()].flatMap((s) => (s ? [s.start, s.end] : [])),
    ...data.calendar.flatMap((c) => [c.start_date, c.end_date]),
  ];
  const range = boardRange(allDates, data.today, zoom);
  const scale = ganttScale(range.start, range.end, zoom, data.today);
  const timeline = scale.timeline;

  const events = data.calendar
    .map((ev) => {
      const g = barGeometry(timeline, ev.start_date, ev.end_date);
      return g ? { id: ev.id, type: ev.type, name: ev.name, ...g, range: formatDateRange(ev.start_date, ev.end_date) } : null;
    })
    .filter((e) => e != null);

  const visibleLines = data.filters.linea ? data.lines.filter((l) => l.id === data.filters.linea) : data.lines;
  const freezeNames = new Map(data.filtered.map((e) => [e.id, crossesFreeze(e, data.calendar).map((f) => f.name)]));
  const groups: TimelineGroup[] = visibleLines.map((line) => ({
    key: line.id,
    label: line.name,
    emptyText: "Sin ejercicios con estos filtros.",
    rows: data.filtered
      .filter((e) => e.line_id === line.id)
      .sort((a, b) => (a.actual_start ?? a.planned_start ?? "9999").localeCompare(b.actual_start ?? b.planned_start ?? "9999"))
      .map((e) => {
        const span = spans.get(e.id) ?? null;
        const bar = toBar(timeline, span);
        const freezes = freezeNames.get(e.id) ?? [];
        return {
          id: e.id,
          title: e.title,
          href: `/programas/${programId}/ejercicios/${e.id}`,
          ownerName: e.owner_name,
          statusLabel: STATUS_LABEL[e.status],
          tone: experimentColumn(e.status),
          bar,
          emptyText: span ? "Fuera del rango del programa" : "Sin fechas todavía",
          warning: freezes.length ? `Se cruza con ${freezes.map((f) => `«${f}»`).join(", ")}: en congelamiento no se lanzan ejercicios.` : null,
        };
      }),
  }));

  const crossing = data.filtered.filter((e) => (freezeNames.get(e.id) ?? []).length > 0);
  // Ejercicios que corren a la vez en la misma línea y tocan la misma etapa o canal.
  const collisions = collisionPairs(data.filtered.map(asCollisionCandidate), data.today);
  const alerts = [
    crossing.length ? `${crossing.length} ${crossing.length === 1 ? "cruza" : "cruzan"} un congelamiento` : null,
    collisions.length ? `${collisions.length} ${collisions.length === 1 ? "pareja corre" : "parejas corren"} a la vez` : null,
  ].filter(Boolean);

  const zoomHrefs = Object.fromEntries(
    GANTT_ZOOMS.map(({ zoom: z }) => {
      const next = { ...data.current };
      const param = ganttZoomParam(z);
      if (param) next.zoom = param;
      else delete next.zoom;
      const qs = new URLSearchParams(next).toString();
      return [z, qs ? `?${qs}` : "?"];
    }),
  ) as Record<GanttZoom, string>;

  return (
    <DashboardFrame
      programId={programId}
      active="gantt"
      title="Gantt"
      description="Una barra por ejercicio: rellena si ya arrancó, punteada si todavía es plan. Arriba, el calendario del programa."
      fields={data.globalFields}
      current={data.current}
      query={data.query}
    >
      {data.lines.length === 0 ? (
        <EmptyState
          art="mapa"
          icon={CalendarRange}
          title="Todavía no hay líneas de negocio"
          description="El Gantt agrupa los ejercicios por línea. Cree las líneas del programa en la configuración para empezar."
          action={
            <Button asChild variant="outline">
              <Link href={`/programas/${programId}/configuracion?paso=lineas`}>Configurar líneas</Link>
            </Button>
          }
        />
      ) : data.filtered.length === 0 ? (
        <EmptyState
          art="camino"
          icon={CalendarRange}
          title="Camino despejado: todavía no hay ejercicios"
          description={
            <>
              Cada ejercicio aparece aquí apenas tenga fechas.
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
        <div className="space-y-3">
          {alerts.length ? (
            <details className="group rounded-xl border border-highlight bg-highlight/15 px-3.5 py-2 text-sm">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
                <TriangleAlert aria-hidden className="size-4 shrink-0" />
                Ojo: {alerts.join(" · ")}.
                <span className="ml-auto text-xs font-normal underline underline-offset-2 group-open:hidden">Ver cuáles</span>
                <span className="ml-auto hidden text-xs font-normal underline underline-offset-2 group-open:inline">Ocultar</span>
              </summary>
              <ul className="mt-2 space-y-1 text-[13px]">
                {crossing.map((e) => (
                  <li key={e.id}>
                    <Link href={`/programas/${programId}/ejercicios/${e.id}`} className="font-medium underline underline-offset-2">
                      {e.title}
                    </Link>
                    <span className="text-soft"> · cruza {(freezeNames.get(e.id) ?? []).map((f) => `«${f}»`).join(", ")}</span>
                  </li>
                ))}
                {collisions.map((p) => (
                  <li key={`${p.a.id}-${p.b.id}`}>
                    <Link href={`/programas/${programId}/ejercicios/${p.a.id}`} className="font-medium underline underline-offset-2">
                      {p.a.title}
                    </Link>{" "}
                    y{" "}
                    <Link href={`/programas/${programId}/ejercicios/${p.b.id}`} className="font-medium underline underline-offset-2">
                      {p.b.title}
                    </Link>
                    <span className="text-soft">
                      {" "}
                      · {describeCollision(p.collision)} · {formatDateRange(p.collision.from, p.collision.to)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-soft">
                En congelamiento no se lanzan ejercicios; y si dos corren a la vez sobre la misma etapa o canal, no se sabe cuál movió la métrica.
              </p>
            </details>
          ) : null}
          <TimelineGantt
            widthPx={scale.widthPx}
            zoom={zoom}
            zoomHrefs={zoomHrefs}
            months={scale.months}
            weeks={scale.weeks}
            quarters={scale.quarters}
            bands={scale.bands}
            events={events}
            todayLeft={scale.todayLeft}
            groups={groups}
            ariaLabel="Línea de tiempo de ejercicios"
          />
          <p className="text-xs text-soft">
            {data.program.start_date && data.program.end_date
              ? `Programa: ${formatDateRange(data.program.start_date, data.program.end_date)}. `
              : "Rango calculado con los ejercicios y el calendario. "}
            Haga clic en una barra para abrir el ejercicio; arrastre o use ‹ › para moverse por los meses.
          </p>
        </div>
      )}
    </DashboardFrame>
  );
}
