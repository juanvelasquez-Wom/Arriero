"use client";

import { Flag, Snowflake, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { BoardColumnKey } from "@/domain/boards";
import type { CalendarEventType } from "@/domain/types";
import { cn } from "@/lib/utils";
import { OwnerInitials } from "./owner-initials";
import { COLUMN_TONE } from "./tones";

// Gantt simplificado y genérico (ejercicios de un programa o tablero general):
// una barra por ítem, color por estado, etiqueta sobre la barra si cabe y el
// calendario en una sola franja arriba. Las posiciones llegan en % del ancho.

export interface TimelineBar {
  left: number;
  width: number;
  /** Rango legible, p. ej. "1 oct – 20 oct 2026". */
  range: string;
  /** `planned` = todavía no arranca (contorno punteado). */
  mode: "actual" | "planned";
  ongoing: boolean;
}

export interface TimelineRow {
  id: string;
  title: string;
  href: string;
  ownerName: string | null;
  statusLabel: string;
  tone: BoardColumnKey;
  bar: TimelineBar | null;
  /** Texto cuando no hay barra ("Sin fechas", "Fuera del rango"). */
  emptyText?: string;
  /** Aviso corto (p. ej. cruce con un congelamiento). */
  warning?: string | null;
  badge?: string | null;
}

export interface TimelineGroup {
  key: string;
  label: string;
  href?: string;
  rows: TimelineRow[];
  emptyText?: string;
}

export interface TimelineEvent {
  id: string;
  type: CalendarEventType;
  name: string;
  left: number;
  width: number;
  range: string;
}

export interface TimelineColumn {
  key: string;
  label: string;
  left: number;
  width: number;
}

export interface TimelineGanttProps {
  widthPx: number;
  months: TimelineColumn[];
  weeks?: TimelineColumn[] | null;
  /** null = sin franja de calendario (p. ej. varios programas mezclados). */
  events: TimelineEvent[] | null;
  todayLeft: number | null;
  groups: TimelineGroup[];
  ariaLabel?: string;
}

const LABEL_W = 232;
const ROW_H = 40;
const pct = (n: number) => `${n}%`;

export function TimelineGantt({ widthPx, months, weeks, events, todayLeft, groups, ariaLabel }: TimelineGanttProps) {
  const scroller = useRef<HTMLDivElement>(null);

  // Al abrir, deja "hoy" a un tercio de la vista.
  useEffect(() => {
    const el = scroller.current;
    if (!el || todayLeft == null) return;
    const x = (todayLeft / 100) * widthPx;
    el.scrollLeft = Math.max(0, x - (el.clientWidth - LABEL_W) / 3);
  }, [todayLeft, widthPx]);

  const freezes = (events ?? []).filter((e) => e.type === "freeze");
  const peaks = (events ?? []).filter((e) => e.type === "peak");
  const decisions = (events ?? []).filter((e) => e.type === "decision");
  const grid = weeks ?? months;

  return (
    <div className="overflow-hidden rounded-2xl border bg-paper shadow-card">
      <Legend withCalendar={events != null} />
      <div
        ref={scroller}
        className="relative overflow-x-auto tabular-nums"
        role="region"
        aria-label={ariaLabel ?? "Línea de tiempo (desplácese horizontalmente)"}
        tabIndex={0}
      >
        <div className="relative" style={{ width: LABEL_W + widthPx }}>
          {/* Fondo que cruza todas las filas: grilla, congelamientos, decisión y hoy. */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: LABEL_W, width: widthPx }}>
            {grid.map((c) => (
              <div key={c.key} className="absolute inset-y-0 border-l border-line/60" style={{ left: pct(c.left) }} />
            ))}
            {freezes.map((f) => (
              <div key={f.id} className="freeze-stripes absolute inset-y-0 opacity-60" style={{ left: pct(f.left), width: pct(f.width) }} />
            ))}
            {decisions.map((d) => (
              <div key={d.id} className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-highlight" style={{ left: pct(d.left) }} />
            ))}
            {todayLeft != null ? <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-ink" style={{ left: pct(todayLeft) }} /> : null}
          </div>

          {/* Encabezado: meses (y semanas si se pidió) y la franja de calendario. */}
          <div className="relative border-b">
            <HeaderRow label="" columns={months} widthPx={widthPx} strong />
            {weeks ? <HeaderRow label="Semana" columns={weeks} widthPx={widthPx} /> : null}
            <div className="flex">
              <div className="sticky left-0 z-20 flex h-7 shrink-0 items-center border-r bg-paper px-3 text-[11px] font-medium text-soft" style={{ width: LABEL_W }}>
                {events ? "Calendario" : ""}
              </div>
              <div className="relative h-7" style={{ width: widthPx }}>
                {freezes.map((f) => {
                  const px = (f.width / 100) * widthPx;
                  return (
                    <span
                      key={f.id}
                      title={`Congelamiento: ${f.name} (${f.range})`}
                      className="freeze-stripes absolute top-1 flex h-5 items-center gap-1 overflow-hidden rounded border border-gray-3 px-1 text-[10px] whitespace-nowrap text-soft"
                      style={{ left: pct(f.left), width: pct(f.width) }}
                    >
                      <Snowflake aria-hidden className="size-3 shrink-0" />
                      {px > 70 ? <span className="truncate">{f.name}</span> : null}
                      <span className="sr-only">Congelamiento {f.name}, {f.range}</span>
                    </span>
                  );
                })}
                {peaks.map((p) => (
                  <span
                    key={p.id}
                    title={`Pico: ${p.name} (${p.range})`}
                    className="absolute top-1 z-10 flex h-5 items-center border-l-2 border-ink pl-0.5"
                    style={{ left: pct(p.left) }}
                  >
                    <Flag aria-hidden className="size-3" />
                    <span className="sr-only">Pico {p.name}, {p.range}</span>
                  </span>
                ))}
                {decisions.map((d) => (
                  <span
                    key={d.id}
                    title={`Punto de decisión: ${d.name} (${d.range})`}
                    className="absolute top-1 z-10 -translate-x-1/2 rounded bg-highlight px-1 text-[10px] leading-5 font-semibold whitespace-nowrap text-[#1f1f1f]"
                    style={{ left: pct(d.left) }}
                  >
                    Decisión
                    <span className="sr-only">: {d.name}, {d.range}</span>
                  </span>
                ))}
                {todayLeft != null ? (
                  <span
                    className="absolute top-1 z-10 -translate-x-1/2 rounded bg-ink px-1 text-[10px] leading-5 font-semibold text-paper"
                    style={{
                      left: pct(todayLeft),
                      marginLeft: decisions.some((d) => Math.abs(((d.left - todayLeft) / 100) * widthPx) < 60) ? 56 : 0,
                    }}
                  >
                    Hoy
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {groups.map((g) => (
            <div key={g.key} role="group" aria-label={g.label}>
              <div className="flex border-b bg-wash">
                <div className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r bg-wash px-3 py-1 text-xs font-semibold" style={{ width: LABEL_W }}>
                  {g.href ? (
                    <Link href={g.href} className="truncate hover:underline">
                      {g.label}
                    </Link>
                  ) : (
                    <span className="truncate">{g.label}</span>
                  )}
                  <span className="ml-auto font-normal text-soft">{g.rows.length}</span>
                </div>
                <div style={{ width: widthPx }} />
              </div>
              {g.rows.length === 0 ? (
                <div className="flex border-b">
                  <div className="sticky left-0 z-20 shrink-0 border-r bg-paper px-3 py-2 text-xs text-soft" style={{ width: LABEL_W }}>
                    {g.emptyText ?? "Nada por aquí con estos filtros."}
                  </div>
                  <div style={{ width: widthPx }} />
                </div>
              ) : (
                g.rows.map((row) => <Row key={row.id} row={row} widthPx={widthPx} />)
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeaderRow({ label, columns, widthPx, strong }: { label: string; columns: TimelineColumn[]; widthPx: number; strong?: boolean }) {
  return (
    <div className="flex border-b">
      <div className="sticky left-0 z-20 flex h-7 shrink-0 items-center border-r bg-paper px-3 text-[11px] font-medium text-soft" style={{ width: LABEL_W }}>
        {label}
      </div>
      <div className="relative h-7" style={{ width: widthPx }}>
        {columns.map((c) => (
          <div
            key={c.key}
            className={cn(
              "absolute inset-y-0 flex items-center overflow-hidden border-l border-line px-1.5 text-[11px] whitespace-nowrap",
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

function Row({ row, widthPx }: { row: TimelineRow; widthPx: number }) {
  const tone = COLUMN_TONE[row.tone];
  const Icon = tone.icon;
  const bar = row.bar;
  const barPx = bar ? (bar.width / 100) * widthPx : 0;
  const fits = barPx >= 96;
  const iconFits = barPx >= 22;
  const when = bar ? `${bar.mode === "planned" ? "Planeado" : "Real"}: ${bar.range}${bar.ongoing ? " (en curso)" : ""}` : "";

  return (
    <div className="flex border-b last:border-b-0 hover:bg-wash/50">
      <div className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r bg-paper px-3" style={{ width: LABEL_W, height: ROW_H }}>
        <OwnerInitials name={row.ownerName} />
        <Link href={row.href} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline" title={row.title}>
          {row.title}
        </Link>
        {row.badge ? <span className="shrink-0 rounded border px-1 text-[10px] text-soft">{row.badge}</span> : null}
        {row.warning ? (
          <span title={row.warning} className="inline-flex shrink-0 rounded bg-highlight p-0.5 text-[#1f1f1f]">
            <TriangleAlert aria-hidden className="size-3" />
            <span className="sr-only">Alerta: {row.warning}</span>
          </span>
        ) : null}
      </div>
      <div className="relative" style={{ width: widthPx, height: ROW_H }}>
        {bar ? (
          <>
            <Link
              href={row.href}
              title={`${row.title} · ${row.statusLabel} · ${when}`}
              aria-label={`${row.title}. ${row.statusLabel}. ${when}.${row.warning ? ` ${row.warning}` : ""} Abrir detalle.`}
              className={cn(
                "absolute top-2 z-10 flex h-6 items-center gap-1 overflow-hidden rounded-md px-1.5 text-[11px] font-semibold whitespace-nowrap hover:ring-2 hover:ring-ink",
                bar.mode === "planned" ? "border-2 border-dashed border-gray-4 bg-paper/80 text-soft" : tone.bar,
                bar.ongoing && "rounded-r-none border-r-4 border-r-ink",
              )}
              style={{ left: pct(bar.left), width: pct(bar.width) }}
            >
              {iconFits ? <Icon aria-hidden className="size-3.5 shrink-0" /> : null}
              {fits ? <span className="truncate">{row.statusLabel}</span> : null}
            </Link>
            {!fits ? (
              <span
                aria-hidden
                className="pointer-events-none absolute top-2 z-10 flex h-6 items-center pl-1.5 text-[11px] whitespace-nowrap text-soft"
                style={{ left: pct(bar.left + bar.width) }}
              >
                {row.statusLabel}
              </span>
            ) : null}
          </>
        ) : (
          <span className="absolute inset-y-0 left-2 flex items-center text-xs text-soft">{row.emptyText ?? "Sin fechas"}</span>
        )}
      </div>
    </div>
  );
}

function Legend({ withCalendar }: { withCalendar: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-4 py-2 text-xs text-soft" aria-label="Leyenda">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-6 rounded-sm bg-gray-3" /> Real
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-6 rounded-sm border-2 border-dashed border-gray-4" /> Planeado (no ha arrancado)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-6 rounded-sm bg-highlight" /> En prueba
      </span>
      {withCalendar ? (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="freeze-stripes h-3 w-6 rounded-sm border border-gray-3" /> Congelamiento
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Flag aria-hidden className="size-3.5 text-ink" /> Pico
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-3.5 w-0.5 bg-highlight" /> Decisión
          </span>
        </>
      ) : null}
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3.5 w-0.5 bg-ink" /> Hoy
      </span>
    </div>
  );
}
