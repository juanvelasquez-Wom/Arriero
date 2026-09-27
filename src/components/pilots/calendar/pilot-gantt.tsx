"use client";

import {
  Ban,
  CircleDashed,
  FlaskConical,
  Gavel,
  Lock,
  PencilLine,
  ScanSearch,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { PilotStatusBadge } from "@/components/pilots/pilot-badges";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PILOT_STATUS_LABEL } from "@/domain/pilots/labels";
import type { PilotStatus } from "@/domain/pilots/types";
import { cn } from "@/lib/utils";

// Mismo criterio que PilotStatusBadge y el Gantt de ejercicios: grises por
// intensidad y amarillo solo para En prueba. Siempre con ícono y etiqueta.
const FILL: Record<PilotStatus, { icon: LucideIcon; className: string }> = {
  draft: { icon: PencilLine, className: "bg-paper text-soft border border-gray-3" },
  in_review: { icon: CircleDashed, className: "bg-gray-1 text-ink border border-gray-3" },
  approved: { icon: Lock, className: "bg-gray-2 text-ink border border-gray-3" },
  in_test: { icon: FlaskConical, className: "bg-highlight text-[#1f1f1f] border border-highlight" },
  in_reading: { icon: ScanSearch, className: "bg-gray-3 text-[#1f1f1f] border border-gray-3 dark:text-paper" },
  decided: { icon: Gavel, className: "bg-gray-4 text-paper border border-gray-4" },
  cancelled: { icon: Ban, className: "bg-paper text-soft border border-dashed border-gray-3 line-through" },
};

export interface PilotGanttBar {
  left: number;
  width: number;
  range: string;
  ongoing?: boolean;
}

export interface PilotGanttItem {
  id: string;
  title: string;
  status: PilotStatus;
  ownerName: string | null;
  planned: PilotGanttBar | null;
  actual: PilotGanttBar | null;
  /** Frases de los cruces con otros pilotos. */
  crossings: string[];
  isExample: boolean;
}

export interface PilotGanttColumn {
  key: string;
  label: string;
  left: number;
  width: number;
}

const LABEL_W = 248;
const ROW_H = 56;
const pct = (n: number) => `${n}%`;

export function PilotGantt({
  widthPx,
  months,
  weeks,
  todayLeft,
  items,
}: {
  widthPx: number;
  months: PilotGanttColumn[];
  weeks: PilotGanttColumn[] | null;
  todayLeft: number | null;
  items: PilotGanttItem[];
}) {
  const scroller = useRef<HTMLDivElement>(null);

  // Al abrir, lleva la vista cerca de hoy.
  useEffect(() => {
    const el = scroller.current;
    if (!el || todayLeft == null) return;
    const x = (todayLeft / 100) * widthPx;
    el.scrollLeft = Math.max(0, x - (el.clientWidth - LABEL_W) / 3);
  }, [todayLeft, widthPx]);

  const grid = weeks ?? months;

  return (
    <div className="overflow-hidden rounded-2xl border bg-paper shadow-card">
      <Legend />
      <div
        ref={scroller}
        className="relative overflow-x-auto tabular-nums"
        role="region"
        aria-label="Línea de tiempo de pilotos (desplácese horizontalmente)"
        tabIndex={0}
      >
        <div className="relative" style={{ width: LABEL_W + widthPx }}>
          <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: LABEL_W, width: widthPx }}>
            {grid.map((c) => (
              <div key={c.key} className="absolute inset-y-0 border-l border-line/70" style={{ left: pct(c.left) }} />
            ))}
            {todayLeft != null ? <div className="absolute inset-y-0 w-px -translate-x-1/2 bg-ink" style={{ left: pct(todayLeft) }} /> : null}
          </div>

          <div className="relative border-b">
            <HeaderRow label="Mes" columns={months} widthPx={widthPx} strong />
            {weeks ? <HeaderRow label="Semana (lunes)" columns={weeks} widthPx={widthPx} /> : null}
            <div className="flex">
              <div className="sticky left-0 z-20 flex h-7 shrink-0 items-center border-r bg-paper px-3 text-xs font-medium text-soft" style={{ width: LABEL_W }}>
                Hoy
              </div>
              <div className="relative h-7" style={{ width: widthPx }}>
                {todayLeft != null ? (
                  <span
                    className="absolute top-1 z-10 -translate-x-1/2 rounded border border-ink bg-paper px-1 text-[11px] font-semibold"
                    style={{ left: pct(todayLeft) }}
                  >
                    Hoy
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {items.map((item) => (
            <Row key={item.id} item={item} widthPx={widthPx} />
          ))}
        </div>
      </div>
    </div>
  );
}

function HeaderRow({ label, columns, widthPx, strong }: { label: string; columns: PilotGanttColumn[]; widthPx: number; strong?: boolean }) {
  return (
    <div className="flex border-b">
      <div className="sticky left-0 z-20 flex h-7 shrink-0 items-center border-r bg-paper px-3 text-xs font-medium text-soft" style={{ width: LABEL_W }}>
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

function Row({ item, widthPx }: { item: PilotGanttItem; widthPx: number }) {
  const href = `/pilotos/${item.id}`;
  const fill = FILL[item.status];
  const Icon = fill.icon;
  const status = PILOT_STATUS_LABEL[item.status];
  const crossText = item.crossings.length ? `Ojo: se cruza con ${item.crossings.join(" · ")}.` : null;

  return (
    <div className="flex border-b last:border-b-0 hover:bg-wash/40">
      <div className="sticky left-0 z-20 flex shrink-0 flex-col justify-center gap-1 border-r bg-paper px-3" style={{ width: LABEL_W, height: ROW_H }}>
        <div className="flex min-w-0 items-center gap-1.5">
          {crossText ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="inline-flex shrink-0 items-center rounded bg-highlight p-0.5 text-[#1f1f1f]" aria-label={`Alerta: ${crossText}`}>
                  <TriangleAlert aria-hidden className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-72">
                {crossText}
              </TooltipContent>
            </Tooltip>
          ) : null}
          <Link href={href} className="truncate text-sm font-medium hover:underline" title={item.title}>
            {item.title}
          </Link>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <PilotStatusBadge status={item.status} className="h-5 px-1.5 text-[11px]" />
          <span className="truncate text-xs text-soft">{item.isExample ? "Ejemplo · " : ""}{item.ownerName ?? "Sin responsable"}</span>
        </div>
      </div>
      <div className="relative" style={{ width: widthPx, height: ROW_H }}>
        {item.planned ? (
          <Link
            href={href}
            aria-label={`${item.title}. Planeado: ${item.planned.range}. Estado: ${status}.${crossText ? ` ${crossText}` : ""} Abrir piloto.`}
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
            aria-label={`${item.title}. Real: ${item.actual.range}${item.actual.ongoing ? " (en curso)" : ""}. Estado: ${status}.${crossText ? ` ${crossText}` : ""} Abrir piloto.`}
            title={`Real: ${item.actual.range}${item.actual.ongoing ? " (en curso)" : ""} · ${status}`}
            className={cn(
              "absolute top-7 z-10 flex h-5 items-center gap-1 overflow-hidden rounded-sm px-1 text-[11px] font-medium whitespace-nowrap shadow-sm hover:ring-2 hover:ring-ink",
              fill.className,
              item.actual.ongoing && "rounded-r-none border-r-4 border-r-ink",
              crossText && "outline-2 outline-offset-1 outline-highlight",
            )}
            style={{ left: pct(item.actual.left), width: pct(item.actual.width) }}
          >
            <Icon aria-hidden className="size-3 shrink-0" />
            {(item.actual.width / 100) * widthPx > 90 ? <span className="truncate">{status}</span> : null}
          </Link>
        ) : null}
        {!item.planned && !item.actual ? (
          <span className="absolute top-1/2 left-0 -translate-y-1/2 px-2 text-xs text-soft">Sin fechas planeadas ni reales</span>
        ) : null}
      </div>
    </div>
  );
}

function Legend() {
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
        <span aria-hidden className="h-3.5 w-px bg-ink" /> Hoy
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-flex rounded bg-highlight p-0.5 text-[#1f1f1f]">
          <TriangleAlert className="size-3" />
        </span>
        Se cruza con otro piloto
      </span>
    </div>
  );
}
