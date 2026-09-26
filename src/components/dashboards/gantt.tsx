"use client";

import { Flag, Snowflake, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { StatusBadge } from "@/components/app/status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STATUS_LABEL } from "@/domain/labels";
import type { CalendarEventType, ExperimentStatus } from "@/domain/types";
import { cn } from "@/lib/utils";
import { STATUS_FILL } from "./status-visual";

/** Posiciones en % del ancho de la línea de tiempo. */
export interface GanttBar {
  left: number;
  width: number;
  /** Rango legible, p. ej. "1 oct – 20 oct 2026". */
  range: string;
  ongoing?: boolean;
}

export interface GanttItem {
  id: string;
  title: string;
  status: ExperimentStatus;
  ownerName: string | null;
  planned: GanttBar | null;
  actual: GanttBar | null;
  /** Nombres de los congelamientos que cruza (planeado o real). */
  freezes: string[];
  /** Tiene fechas pero caen fuera del rango del programa. */
  outOfRange: boolean;
  noDates: boolean;
}

export interface GanttGroup {
  lineId: string;
  lineName: string;
  items: GanttItem[];
}

export interface GanttEvent {
  id: string;
  type: CalendarEventType;
  name: string;
  left: number;
  width: number;
  range: string;
}

export interface GanttColumn {
  key: string;
  label: string;
  left: number;
  width: number;
}

export interface GanttProps {
  programId: string;
  widthPx: number;
  months: GanttColumn[];
  weeks: GanttColumn[] | null;
  events: GanttEvent[];
  todayLeft: number | null;
  groups: GanttGroup[];
}

const LABEL_W = 272;
const ROW_H = 56;
const CAL_H = 76;

const pct = (n: number) => `${n}%`;

export function Gantt({ programId, widthPx, months, weeks, events, todayLeft, groups }: GanttProps) {
  const scroller = useRef<HTMLDivElement>(null);

  // Al abrir, centra la vista cerca de hoy.
  useEffect(() => {
    const el = scroller.current;
    if (!el || todayLeft == null) return;
    const x = (todayLeft / 100) * widthPx;
    el.scrollLeft = Math.max(0, x - (el.clientWidth - LABEL_W) / 3);
  }, [todayLeft, widthPx]);

  const freezes = events.filter((e) => e.type === "freeze");
  const peaks = events.filter((e) => e.type === "peak");
  const decisions = events.filter((e) => e.type === "decision");
  const grid = weeks ?? months;

  return (
    <div className="overflow-hidden rounded-2xl border bg-paper shadow-card">
      <GanttLegend />
      <div
        ref={scroller}
        className="relative overflow-x-auto tabular-nums"
        role="region"
        aria-label="Línea de tiempo de ejercicios (desplácese horizontalmente)"
        tabIndex={0}
      >
        <div className="relative" style={{ width: LABEL_W + widthPx }}>
          {/* Capa de fondo que cruza todas las filas: grilla, congelamientos, picos, decisión y hoy. */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: LABEL_W, width: widthPx }}>
            {grid.map((c) => (
              <div key={c.key} className="absolute inset-y-0 border-l border-line/70" style={{ left: pct(c.left) }} />
            ))}
            {freezes.map((f) => (
              <div
                key={f.id}
                className="freeze-stripes absolute inset-y-0 border-x border-gray-3/60 bg-gray-1/60"
                style={{ left: pct(f.left), width: pct(f.width) }}
              />
            ))}
            {peaks.map((p) => (
              <div
                key={p.id}
                className="absolute inset-y-0 border-l border-dashed border-gray-4"
                style={{ left: pct(p.left) }}
              />
            ))}
            {decisions.map((d) => (
              <div key={d.id} className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-highlight" style={{ left: pct(d.left) }} />
            ))}
            {todayLeft != null ? (
              <div className="absolute inset-y-0 w-px -translate-x-1/2 bg-ink" style={{ left: pct(todayLeft) }} />
            ) : null}
          </div>

          {/* Encabezado: meses, semanas y calendario. */}
          <div className="relative border-b">
            <HeaderRow label="Mes" columns={months} widthPx={widthPx} strong />
            {weeks ? <HeaderRow label="Semana (lunes)" columns={weeks} widthPx={widthPx} /> : null}
            <div className="flex">
              <div
                className="sticky left-0 z-20 flex shrink-0 items-center border-r bg-paper px-3 text-xs font-medium text-soft"
                style={{ width: LABEL_W, height: CAL_H }}
              >
                Calendario
              </div>
              <div className="relative" style={{ width: widthPx, height: CAL_H }}>
                {freezes.map((f) => (
                  <EventChip
                    key={f.id}
                    event={f}
                    label={`Congelamiento: ${f.name}`}
                    top={4}
                    icon={<Snowflake aria-hidden className="size-3 shrink-0" />}
                  />
                ))}
                {peaks.map((p) => (
                  <EventChip
                    key={p.id}
                    event={p}
                    label={`Pico: ${p.name}`}
                    top={28}
                    icon={<Flag aria-hidden className="size-3 shrink-0" />}
                    marker
                  />
                ))}
                {decisions.map((d) => (
                  <span
                    key={d.id}
                    title={`Punto de decisión: ${d.name} (${d.range})`}
                    className="absolute top-[52px] z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded bg-highlight px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-[#1f1f1f]"
                    style={{ left: pct(d.left) }}
                  >
                    Punto de decisión
                    <span className="sr-only">
                      : {d.name}, {d.range}
                    </span>
                  </span>
                ))}
                {todayLeft != null ? (
                  <span
                    className="absolute top-[52px] z-10 -translate-x-1/2 rounded border border-ink bg-paper px-1 text-[11px] font-semibold"
                    style={{ left: pct(todayLeft), marginLeft: decisions.some((d) => Math.abs(d.left - todayLeft) < 3) ? 64 : 0 }}
                  >
                    Hoy
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Filas por línea. */}
          {groups.map((g) => (
            <div key={g.lineId} role="group" aria-label={`Línea ${g.lineName}`}>
              <div className="flex border-b bg-wash/80">
                <div
                  className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r bg-wash px-3 py-1.5 text-sm font-semibold"
                  style={{ width: LABEL_W }}
                >
                  <span className="truncate">{g.lineName}</span>
                  <span className="text-xs font-normal text-soft">
                    {g.items.length} ejercicio{g.items.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div style={{ width: widthPx }} />
              </div>
              {g.items.length === 0 ? (
                <div className="flex border-b">
                  <div
                    className="sticky left-0 z-20 shrink-0 border-r bg-paper px-3 py-3 text-xs text-soft"
                    style={{ width: LABEL_W }}
                  >
                    Esta línea no tiene ejercicios con los filtros actuales.
                  </div>
                  <div style={{ width: widthPx }} />
                </div>
              ) : (
                g.items.map((item) => <GanttRow key={item.id} item={item} programId={programId} widthPx={widthPx} />)
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeaderRow({
  label,
  columns,
  widthPx,
  strong,
}: {
  label: string;
  columns: GanttColumn[];
  widthPx: number;
  strong?: boolean;
}) {
  return (
    <div className="flex border-b">
      <div
        className="sticky left-0 z-20 flex h-7 shrink-0 items-center border-r bg-paper px-3 text-xs font-medium text-soft"
        style={{ width: LABEL_W }}
      >
        {label}
      </div>
      <div className="relative h-7" style={{ width: widthPx }}>
        {columns.map((c) => (
          <div
            key={c.key}
            className={cn(
              "absolute inset-y-0 flex items-center overflow-hidden border-l border-line px-1 text-[11px] whitespace-nowrap",
              strong ? "font-semibold capitalize" : "text-soft",
            )}
            style={{ left: pct(c.left), width: pct(c.width) }}
          >
            {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function EventChip({
  event,
  label,
  top,
  icon,
  marker,
}: {
  event: GanttEvent;
  label: string;
  top: number;
  icon: ReactNode;
  marker?: boolean;
}) {
  return (
    <span
      title={`${label} (${event.range})`}
      className={cn(
        "absolute flex h-6 items-center gap-1 overflow-hidden px-1 text-[11px] whitespace-nowrap",
        marker ? "border-t-2 border-ink font-medium" : "rounded border border-gray-3 bg-paper/90 text-soft",
      )}
      style={{ left: pct(event.left), width: `max(${pct(event.width)}, 1.5rem)`, top }}
    >
      {icon}
      <span className="truncate">{label}</span>
      <span className="sr-only">, {event.range}</span>
    </span>
  );
}

function GanttRow({ item, programId, widthPx }: { item: GanttItem; programId: string; widthPx: number }) {
  const href = `/programas/${programId}/ejercicios/${item.id}`;
  const fill = STATUS_FILL[item.status];
  const Icon = fill.icon;
  const freezeText = item.freezes.length
    ? `Se cruza con ${item.freezes.length === 1 ? "el congelamiento" : "los congelamientos"} ${item.freezes
        .map((f) => `"${f}"`)
        .join(", ")}. En congelamiento no se lanzan ejercicios.`
    : null;
  const status = STATUS_LABEL[item.status];

  return (
    <div className="flex border-b last:border-b-0 hover:bg-wash/40">
      <div
        className="sticky left-0 z-20 flex shrink-0 flex-col justify-center gap-1 border-r bg-paper px-3"
        style={{ width: LABEL_W, height: ROW_H }}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {freezeText ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center rounded bg-highlight p-0.5 text-[#1f1f1f]"
                  aria-label={`Alerta: ${freezeText}`}
                >
                  <TriangleAlert aria-hidden className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{freezeText}</TooltipContent>
            </Tooltip>
          ) : null}
          <Link href={href} className="truncate text-sm font-medium hover:underline" title={item.title}>
            {item.title}
          </Link>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <StatusBadge status={item.status} className="h-5 px-1.5 text-[11px]" />
          <span className="truncate text-xs text-soft">{item.ownerName ?? "Sin responsable"}</span>
        </div>
      </div>
      <div className="relative" style={{ width: widthPx, height: ROW_H }}>
        {item.planned ? (
          <Link
            href={href}
            aria-label={`${item.title}. Planeado: ${item.planned.range}. Estado: ${status}.${freezeText ? ` ${freezeText}` : ""} Abrir detalle.`}
            title={`Planeado: ${item.planned.range}`}
            className="absolute top-2 z-10 flex h-4 items-center overflow-hidden rounded-sm border-2 border-dashed border-gray-4 bg-paper/60 px-1 text-[10px] leading-none whitespace-nowrap text-soft hover:border-ink"
            style={{ left: pct(item.planned.left), width: pct(item.planned.width) }}
          >
            {(item.planned.width / 100) * widthPx > 60 ? "Plan" : null}
          </Link>
        ) : null}
        {item.actual ? (
          <Link
            href={href}
            aria-label={`${item.title}. Real: ${item.actual.range}${item.actual.ongoing ? " (en curso)" : ""}. Estado: ${status}.${freezeText ? ` ${freezeText}` : ""} Abrir detalle.`}
            title={`Real: ${item.actual.range}${item.actual.ongoing ? " (en curso)" : ""} · ${status}`}
            className={cn(
              "absolute top-7 z-10 flex h-5 items-center gap-1 overflow-hidden rounded-sm px-1 text-[11px] font-medium whitespace-nowrap shadow-sm hover:ring-2 hover:ring-ink",
              fill.className,
              item.actual.ongoing && "rounded-r-none border-r-4 border-r-ink",
              freezeText && "outline-2 outline-offset-1 outline-highlight",
            )}
            style={{ left: pct(item.actual.left), width: pct(item.actual.width) }}
          >
            <Icon aria-hidden className="size-3 shrink-0" />
            {(item.actual.width / 100) * widthPx > 90 ? <span className="truncate">{status}</span> : null}
          </Link>
        ) : null}
        {!item.planned && !item.actual ? (
          <span className="absolute top-1/2 -translate-y-1/2 px-2 text-xs text-soft" style={{ left: 0 }}>
            {item.noDates ? "Sin fechas planeadas ni reales" : "Fechas fuera del rango del programa"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function GanttLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5 text-xs text-soft" aria-label="Leyenda">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-8 rounded-sm border-2 border-dashed border-gray-4" /> Planeado
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-8 rounded-sm bg-gray-4" /> Real (relleno según estado)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-8 rounded-sm bg-highlight" /> En prueba
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-8 rounded-sm border-r-4 border-r-ink bg-gray-2" /> En curso (sin fin real)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="freeze-stripes h-3 w-8 rounded-sm border border-gray-3" /> Congelamiento
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Flag aria-hidden className="size-3.5 text-ink" /> Pico comercial
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3.5 w-0.5 bg-highlight" /> Punto de decisión
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3.5 w-px bg-ink" /> Hoy
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-flex rounded bg-highlight p-0.5 text-[#1f1f1f]">
          <TriangleAlert className="size-3" />
        </span>
        Cruza un congelamiento
      </span>
    </div>
  );
}
