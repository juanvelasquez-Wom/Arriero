import { CalendarRange, Columns3, Milestone, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app/app-header";
import { EmptyState, PageHeader } from "@/components/app/page";
import { ReadOnlyKanban, Roadmap } from "@/components/boards/global-views";
import { HealthLegend } from "@/components/boards/health-badge";
import { TimelineGantt, type TimelineBar, type TimelineGroup } from "@/components/boards/timeline-gantt";
import { DashboardFilters, type FilterField } from "@/components/dashboards/dashboard-filters";
import { Button } from "@/components/ui/button";
import { BOARD_VIEW_LABEL, BOARD_VIEWS, filterBoardItems, parseBoardFilters, UNASSIGNED, type BoardItem, type BoardView } from "@/domain/boards";
import { firstParam } from "@/domain/dashboard-filters";
import { todayIso } from "@/domain/dates";
import { formatDateRange, formatMonth, formatShortDate } from "@/domain/format";
import {
  barGeometry,
  boardPixelsPerDay,
  buildTimeline,
  displaySpan,
  positionOf,
  spansRange,
  timelineColumns,
  type GanttZoom,
} from "@/domain/gantt";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { loadGlobalBoards } from "@/server/queries/boards";

export const metadata: Metadata = { title: "Tableros generales" };

const VIEW_ICON: Record<BoardView, LucideIcon> = { gantt: CalendarRange, kanban: Columns3, ruta: Milestone };
const VIEW_HELP: Record<BoardView, string> = {
  gantt: "Todos los ejercicios y pilotos en una sola línea de tiempo, por programa. Relleno si ya arrancó, punteado si todavía es plan.",
  kanban: "Ejercicios y pilotos en las mismas cinco columnas, de lo que espera turno a lo cerrado. Solo lectura: para mover, entre al programa.",
  ruta: "La hoja de ruta: qué corre ahora, qué sigue y qué va después, con un semáforo de salud en cada tarjeta.",
};

const running = (i: BoardItem) => i.column === "test" || i.column === "reading";

export default async function GlobalBoardsPage({ searchParams }: PageProps<"/tableros">) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters = parseBoardFilters(sp);
  const today = todayIso();
  const data = await loadGlobalBoards(today);
  const items = filterBoardItems(data.items, filters);

  const current: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    const value = firstParam(v);
    if (value) current[k] = value;
  }
  const hrefFor = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) next.set(k, v);
    const qs = next.toString();
    return qs ? `/tableros?${qs}` : "/tableros";
  };

  const fields: FilterField[] = [
    { key: "programa", label: "Programa", options: data.programs.map((p) => ({ value: p.id, label: p.name })) },
    ...(data.hasPilots
      ? [{ key: "tipo", label: "Tipo", options: [{ value: "ejercicios", label: "Ejercicios" }, { value: "pilotos", label: "Pilotos de medios" }] }]
      : []),
    {
      key: "responsable",
      label: "Responsable",
      options: [...data.owners.map((o) => ({ value: o.id, label: o.name })), { value: UNASSIGNED, label: "Sin responsable" }],
    },
  ];

  const nothingAtAll = data.items.length === 0;

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8">
        <PageHeader
          eyebrow="Tableros generales"
          title="Todo el camino, en una vista"
          description={`${VIEW_HELP[filters.vista]}${data.hasPilots ? "" : " Los pilotos de medios aparecen si usted tiene un rol en ese módulo."}`}
          className="mb-4"
        />

        <nav aria-label="Vistas" className="-mx-1 overflow-x-auto px-1">
          <ul className="flex w-max gap-1 border-b">
            {BOARD_VIEWS.map((v) => {
              const Icon = VIEW_ICON[v];
              const active = v === filters.vista;
              return (
                <li key={v}>
                  <Link
                    href={hrefFor({ vista: v === "gantt" ? null : v })}
                    aria-current={active ? "page" : undefined}
                    scroll={false}
                    className={cn(
                      "relative -mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-soft transition-colors hover:text-ink",
                      active && "border-highlight font-semibold text-ink",
                    )}
                  >
                    <Icon aria-hidden className="size-4" />
                    {BOARD_VIEW_LABEL[v]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <DashboardFilters fields={fields} current={current} className="mt-4 mb-6" />

        {nothingAtAll ? (
          <EmptyState
            art="camino"
            icon={CalendarRange}
            title="Camino despejado: todavía no hay nada que mostrar"
            description="Aquí aparecen los ejercicios de todos sus programas y los pilotos de medios. Arranque por un programa."
            action={
              <Button asChild variant="outline">
                <Link href="/programas">Ir a mis programas</Link>
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            art="celular-ruta"
            icon={Columns3}
            title="Nada coincide con los filtros"
            description="Ese camino no era. Revise los filtros o use «Limpiar filtros»."
          />
        ) : filters.vista === "kanban" ? (
          <ReadOnlyKanban items={items.filter((i) => i.column !== "discarded")} withWip={!!filters.programa} />
        ) : filters.vista === "ruta" ? (
          <div className="space-y-3">
            <HealthLegend />
            <Roadmap items={items} />
          </div>
        ) : (
          <GlobalGantt items={items} data={data} filters={filters} zoomParam={firstParam(sp.zoom)} hrefFor={hrefFor} today={today} />
        )}
      </main>
    </>
  );
}

function GlobalGantt({
  items,
  data,
  filters,
  zoomParam,
  hrefFor,
  today,
}: {
  items: BoardItem[];
  data: Awaited<ReturnType<typeof loadGlobalBoards>>;
  filters: ReturnType<typeof parseBoardFilters>;
  zoomParam: string | null;
  hrefFor: (patch: Record<string, string | null>) => string;
  today: string;
}) {
  const zoom: GanttZoom = zoomParam === "semana" ? "week" : "month";
  const visible = items.filter((i) => i.column !== "discarded");
  const spans = new Map(
    visible.map((i) => [
      `${i.kind}-${i.id}`,
      displaySpan({ planned_start: i.plannedStart, planned_end: i.plannedEnd, actual_start: i.actualStart, actual_end: i.actualEnd }, running(i), today),
    ]),
  );
  const range = spansRange([...spans.values()], today);
  const timeline = buildTimeline(range.start, range.end);
  const widthPx = timeline.totalDays * boardPixelsPerDay(zoom);
  const months = timelineColumns(timeline, "month", formatMonth);
  const weeks = zoom === "week" ? timelineColumns(timeline, "week", (d) => formatShortDate(d)) : null;
  const todayLeft = positionOf(timeline, today) + 100 / timeline.totalDays / 2;

  // La franja de calendario solo tiene sentido con un programa: cada uno tiene el suyo.
  const events = filters.programa
    ? (data.calendar.get(filters.programa) ?? [])
        .map((ev) => {
          const g = barGeometry(timeline, ev.start_date, ev.end_date);
          return g ? { id: ev.id, type: ev.type, name: ev.name, ...g, range: formatDateRange(ev.start_date, ev.end_date) } : null;
        })
        .filter((e) => e != null)
    : null;

  const row = (i: BoardItem) => {
    const span = spans.get(`${i.kind}-${i.id}`) ?? null;
    const g = span ? barGeometry(timeline, span.start, span.end) : null;
    const bar: TimelineBar | null = span && g ? { ...g, range: formatDateRange(span.start, span.end), mode: span.mode, ongoing: span.ongoing } : null;
    return {
      id: `${i.kind}-${i.id}`,
      title: i.title,
      href: i.href,
      ownerName: i.ownerName,
      statusLabel: i.statusLabel,
      tone: i.column,
      bar,
      emptyText: "Sin fechas todavía",
      warning: i.health.level === "red" ? i.health.reasons.join(" ") : null,
      badge: i.isExample ? "Ejemplo" : null,
    };
  };
  const byStart = (a: BoardItem, b: BoardItem) =>
    (a.actualStart ?? a.plannedStart ?? "9999").localeCompare(b.actualStart ?? b.plannedStart ?? "9999");

  const groups: TimelineGroup[] = [
    ...data.programs.map((p) => ({
      key: p.id,
      label: p.name,
      href: `/programas/${p.id}/tableros/gantt`,
      rows: visible.filter((i) => i.kind === "experiment" && i.programId === p.id).sort(byStart).map(row),
    })),
    {
      key: "pilotos",
      label: "Pilotos de medios",
      href: "/pilotos/calendario",
      rows: visible.filter((i) => i.kind === "pilot").sort(byStart).map(row),
    },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-soft">
          {filters.programa ? "Arriba, el calendario del programa." : "Filtre por un programa para ver su calendario (congelamientos, picos y decisión)."} El ícono
          amarillo marca lo que está en riesgo.
        </p>
        <div role="group" aria-label="Escala de la línea de tiempo" className="inline-flex rounded-xl border bg-paper p-0.5 shadow-card">
          {(["mes", "semana"] as const).map((z) => {
            const active = (z === "mes") === (zoom === "month");
            return (
              <Button key={z} asChild size="sm" variant="ghost" className={cn(active && "bg-gray-1 font-semibold")}>
                <Link href={hrefFor({ zoom: z === "semana" ? "semana" : null })} aria-current={active ? "true" : undefined} scroll={false}>
                  {z === "semana" ? "Semana" : "Mes"}
                </Link>
              </Button>
            );
          })}
        </div>
      </div>
      {groups.length ? (
        <TimelineGantt
          widthPx={widthPx}
          months={months}
          weeks={weeks}
          events={events}
          todayLeft={todayLeft}
          groups={groups}
          ariaLabel="Línea de tiempo de ejercicios y pilotos (desplácese horizontalmente)"
        />
      ) : (
        <p className="rounded-2xl border border-dashed bg-paper py-10 text-center text-sm text-soft">Solo hay descartados o cancelados con estos filtros.</p>
      )}
      <p className="text-xs text-soft">Rango: {formatDateRange(timeline.start, timeline.end)}. Haga clic en una barra para abrir el detalle.</p>
    </div>
  );
}
