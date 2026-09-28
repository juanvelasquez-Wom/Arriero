"use client";

import { ChevronDown, ChevronLeft, ChevronRight, CornerDownRight, Flag, LocateFixed, Snowflake, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { BoardColumnKey } from "@/domain/boards";
import {
  estimateLabelPx,
  GANTT_ZOOMS,
  labelPlacement,
  scrollTargetFor,
  stepScroll,
  type Band,
  type GanttZoom,
  type HeaderCell,
} from "@/domain/gantt";
import type { CalendarEventType } from "@/domain/types";
import { cn } from "@/lib/utils";
import { OwnerInitials } from "./owner-initials";
import { COLUMN_TONE } from "./tones";

// Gantt de los tableros (ejercicios de un programa o tablero general): una barra
// por ítem, color por estado, etiquetas que nunca se cortan, encabezado y columna
// de títulos fijos, y navegación con botones, arrastre, teclado y minimapa.
// Las posiciones llegan en % del ancho desde `src/domain/gantt.ts`.

export interface TimelineBar {
  left: number;
  width: number;
  /** Rango legible, p. ej. "1 oct – 20 oct 2026". */
  range: string;
  /** `planned` = todavía no arranca (contorno punteado). */
  mode: "actual" | "planned";
  ongoing: boolean;
  /** En curso con fin planeado futuro: % de la barra ya recorrido (hasta hoy). */
  progress?: number | null;
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

export type TimelineColumn = HeaderCell;

export interface TimelineGanttProps {
  /** Ancho mínimo de la pista en px; si sobra espacio, se estira. */
  widthPx: number;
  zoom: GanttZoom;
  /** Enlaces de cada zoom (conservan los filtros de la URL). */
  zoomHrefs?: Partial<Record<GanttZoom, string>>;
  months: HeaderCell[];
  weeks?: HeaderCell[] | null;
  quarters?: HeaderCell[] | null;
  bands?: Band[];
  /** null = sin franja de calendario (p. ej. varios programas mezclados). */
  events: TimelineEvent[] | null;
  todayLeft: number | null;
  groups: TimelineGroup[];
  ariaLabel?: string;
}

const ROW_H = 44;
const pct = (n: number) => `${n}%`;
const LABEL_VAR = "var(--gantt-label)";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function TimelineGantt({
  widthPx,
  zoom,
  zoomHrefs,
  months,
  weeks,
  quarters,
  bands = [],
  events,
  todayLeft,
  groups,
  ariaLabel,
}: TimelineGanttProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const labelCell = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(widthPx);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const helpId = useId();

  // La pista llena el ancho disponible: nunca queda un hueco a la derecha.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const fit = () => {
      const label = labelCell.current?.offsetWidth ?? 0;
      setTrackW(Math.max(widthPx, Math.floor(el.clientWidth - label)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [widthPx]);

  const scrollTo = useCallback((left: number, smooth = true) => {
    scroller.current?.scrollTo({ left, behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto" });
  }, []);

  const viewport = useCallback(() => {
    const el = scroller.current;
    return el ? el.clientWidth - (labelCell.current?.offsetWidth ?? 0) : 0;
  }, []);

  const goToday = useCallback(
    (smooth = true) => {
      if (todayLeft == null) return;
      scrollTo(scrollTargetFor(todayLeft, trackW, viewport(), 0.4), smooth);
    },
    [todayLeft, trackW, viewport, scrollTo],
  );

  // Al abrir (y al cambiar de zoom), "hoy" queda a un cuarto de la vista.
  const opened = useRef<number | null>(null);
  useEffect(() => {
    if (opened.current === widthPx || trackW < widthPx) return;
    opened.current = widthPx;
    goToday(false);
  }, [widthPx, trackW, goToday]);

  const monthLefts = months.map((m) => m.left);
  const step = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) scrollTo(stepScroll(monthLefts, trackW, el.scrollLeft, dir));
  };

  // Arrastrar para desplazarse (solo con el mouse y nunca sobre una barra o botón).
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const justDragged = useRef(false);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("a,button,summary,input")) return;
    drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 4) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    e.currentTarget.scrollLeft = d.left - dx;
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.moved) {
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 0);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const el = e.currentTarget;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      if (e.shiftKey) step(dir);
      else scrollTo(el.scrollLeft + dir * 120);
    } else if (e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault();
      step(e.key === "PageDown" ? 1 : -1);
    } else if (e.key === "Home") {
      e.preventDefault();
      scrollTo(0);
    } else if (e.key === "End") {
      e.preventDefault();
      scrollTo(el.scrollWidth);
    } else if (e.key.toLowerCase() === "h") {
      e.preventDefault();
      goToday();
    }
  };

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const freezes = (events ?? []).filter((e) => e.type === "freeze");
  const peaks = (events ?? []).filter((e) => e.type === "peak");
  const decisions = (events ?? []).filter((e) => e.type === "decision");
  // Líneas verticales: la columna menor (semana o mes) suave; la mayor (mes o trimestre) más marcada.
  const minor = weeks ?? (quarters ? months : null);
  const major = quarters ?? months;
  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="overflow-hidden rounded-2xl border bg-paper shadow-card [--gantt-label:9.5rem] sm:[--gantt-label:15.5rem] lg:[--gantt-label:17rem]">
      <Toolbar
        scroller={scroller}
        labelCell={labelCell}
        months={months}
        trackW={trackW}
        todayLeft={todayLeft}
        decisions={decisions}
        zoom={zoom}
        zoomHrefs={zoomHrefs}
        onStep={step}
        onToday={() => goToday()}
        onJump={(p) => scrollTo(scrollTargetFor(p, trackW, viewport(), 0.5))}
      />
      <p id={helpId} className="sr-only">
        Use las flechas para moverse, Mayúscula más flecha o Re Pág y Av Pág para saltar un mes, Inicio y Fin para ir a los bordes y la letra H para volver a hoy.
      </p>
      <div
        ref={scroller}
        className={cn(
          "relative max-h-[min(72vh,760px)] overflow-auto overscroll-x-contain tabular-nums focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink",
          dragging ? "cursor-grabbing select-none" : "cursor-grab",
        )}
        role="region"
        aria-label={ariaLabel ?? "Línea de tiempo"}
        aria-describedby={helpId}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => {
          // Un arrastre no debe terminar abriendo una barra.
          if (justDragged.current) e.preventDefault();
        }}
        onKeyDown={onKeyDown}
      >
        <div className="relative" style={{ width: `calc(${LABEL_VAR} + ${trackW}px)` }}>
          {/* Encabezado fijo arriba: trimestres o meses, semanas si aplica, y la franja de hoy y calendario. */}
          <div className="sticky top-0 z-30 border-b bg-paper">
            {quarters ? <HeaderRow cells={quarters} strong /> : null}
            <HeaderRow cells={months} strong={!quarters} labelRef={quarters ? undefined : labelCell} caption={quarters ? undefined : "Mes"} />
            {weeks ? <HeaderRow cells={weeks} caption="Semana del" compact /> : null}
            <div className="flex">
              <div
                ref={quarters ? labelCell : undefined}
                className="sticky left-0 z-20 flex h-8 shrink-0 items-center border-r bg-paper px-3 text-[11px] font-medium text-soft"
                style={{ width: LABEL_VAR }}
              >
                {events ? "Calendario" : null}
                <span className="ml-auto text-[10px] font-normal tabular-nums">{total} en total</span>
              </div>
              <div className="relative h-8" style={{ width: trackW }}>
                {freezes.map((f) => {
                  const px = (f.width / 100) * trackW;
                  // Si un pico cae al inicio del congelamiento, el nombre se esconde (queda en el title) para no montarse.
                  const crowded = peaks.some((p) => {
                    const dx = ((p.left - f.left) / 100) * trackW;
                    return dx >= -8 && dx <= 90;
                  });
                  return (
                    <span
                      key={f.id}
                      title={`Congelamiento: ${f.name} (${f.range}). No se lanzan ejercicios.`}
                      className="freeze-stripes absolute top-1.5 flex h-5 cursor-help items-center gap-1 overflow-hidden rounded-md border border-gray-3 bg-paper px-1 text-[10px] font-medium whitespace-nowrap text-soft"
                      style={{ left: pct(f.left), width: pct(f.width) }}
                    >
                      <Snowflake aria-hidden className="size-3 shrink-0" />
                      {px > 64 && !crowded ? <span className="truncate">{f.name}</span> : null}
                      <span className="sr-only">
                        Congelamiento {f.name}, {f.range}
                      </span>
                    </span>
                  );
                })}
                {peaks.map((p) => (
                  <span
                    key={p.id}
                    title={`Pico: ${p.name} (${p.range})`}
                    className="absolute top-1.5 z-10 flex h-5 cursor-help items-center border-l-2 border-ink pl-0.5"
                    style={{ left: pct(p.left) }}
                  >
                    <Flag aria-hidden className="size-3" />
                    <span className="sr-only">
                      Pico {p.name}, {p.range}
                    </span>
                  </span>
                ))}
                {decisions.map((d) => (
                  <span
                    key={d.id}
                    title={`Punto de decisión: ${d.name} (${d.range})`}
                    className="absolute top-1.5 z-10 flex h-5 -translate-x-1/2 cursor-help items-center"
                    style={{ left: pct(d.left) }}
                  >
                    <span aria-hidden className="size-3 rotate-45 rounded-[2px] border border-[#1f1f1f]/30 bg-highlight shadow-sm" />
                    <span className="sr-only">
                      Punto de decisión: {d.name}, {d.range}
                    </span>
                  </span>
                ))}
                {todayLeft != null ? (
                  <span
                    className="absolute top-1.5 z-20 flex h-5 -translate-x-1/2 items-center rounded-full bg-ink px-2 text-[10px] font-bold tracking-wide text-paper shadow-sm"
                    style={{ left: pct(todayLeft) }}
                  >
                    Hoy
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Fondo que cruza todas las filas: franjas, grilla, congelamientos, decisión y hoy. */}
          <div className="relative">
            <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: LABEL_VAR, width: trackW }}>
              {bands.map((b) => (
                <div key={b.key} className="absolute inset-y-0 bg-wash/70" style={{ left: pct(b.left), width: pct(b.width) }} />
              ))}
              {minor?.map((c) => (
                <div key={`m-${c.key}`} className="absolute inset-y-0 border-l border-line/50" style={{ left: pct(c.left) }} />
              ))}
              {major.map((c) => (
                <div key={`M-${c.key}`} className={cn("absolute inset-y-0 border-l", c.yearStart ? "border-gray-3" : "border-line")} style={{ left: pct(c.left) }} />
              ))}
              {freezes.map((f) => (
                <div key={f.id} className="freeze-stripes absolute inset-y-0 opacity-70" style={{ left: pct(f.left), width: pct(f.width) }} />
              ))}
              {decisions.map((d) => (
                <div key={d.id} className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-highlight" style={{ left: pct(d.left) }} />
              ))}
              {todayLeft != null ? <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-ink/80" style={{ left: pct(todayLeft) }} /> : null}
            </div>

            {groups.map((g) => {
              const isCollapsed = collapsed.has(g.key);
              return (
                <div key={g.key} role="group" aria-label={`${g.label}, ${g.rows.length}`}>
                  <GroupHeader group={g} collapsed={isCollapsed} onToggle={() => toggle(g.key)} trackW={trackW} />
                  {isCollapsed ? null : g.rows.length === 0 ? (
                    <div className="flex border-b">
                      <div className="sticky left-0 z-20 shrink-0 border-r bg-paper px-3 py-2.5 text-xs text-soft" style={{ width: LABEL_VAR }}>
                        {g.emptyText ?? "Nada por aquí con estos filtros."}
                      </div>
                      <div style={{ width: trackW }} />
                    </div>
                  ) : (
                    g.rows.map((row) => <Row key={row.id} row={row} trackW={trackW} />)
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <Legend withCalendar={events != null} />
    </div>
  );
}

function HeaderRow({
  cells,
  strong,
  caption,
  compact,
  labelRef,
}: {
  cells: HeaderCell[];
  strong?: boolean;
  caption?: string;
  compact?: boolean;
  labelRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex border-b">
      <div
        ref={labelRef}
        className={cn("sticky left-0 z-20 flex shrink-0 items-center border-r bg-paper px-3 text-[11px] font-medium text-soft", compact ? "h-6" : "h-8")}
        style={{ width: LABEL_VAR }}
      >
        {caption}
      </div>
      <div className={cn("relative flex-1", compact ? "h-6" : "h-8")}>
        {cells.map((c) => (
          <div
            key={c.key}
            title={c.title}
            className={cn(
              "absolute inset-y-0 flex items-center overflow-clip border-l whitespace-nowrap",
              c.yearStart ? "border-gray-3" : "border-line",
              strong ? "px-2 text-xs font-semibold" : "px-1 text-[10px] text-soft",
            )}
            style={{ left: pct(c.left), width: pct(c.width) }}
          >
            {/* El nombre del mes se queda pegado a la izquierda mientras el mes se ve. */}
            <span className={cn("sticky", strong && "first-letter:uppercase")} style={{ left: `calc(${LABEL_VAR} + 0.5rem)` }}>
              {c.label}
            </span>
            <span className="sr-only">{c.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupHeader({ group, collapsed, onToggle, trackW }: { group: TimelineGroup; collapsed: boolean; onToggle: () => void; trackW: number }) {
  // Resumen del grupo: desde la primera barra hasta la última.
  const bars = group.rows.map((r) => r.bar).filter((b) => b != null);
  const from = bars.length ? Math.min(...bars.map((b) => b.left)) : null;
  const to = bars.length ? Math.max(...bars.map((b) => b.left + b.width)) : null;
  return (
    <div className="group/grp flex border-b bg-wash">
      <div className="sticky left-0 z-20 flex h-9 shrink-0 items-center gap-1 border-r bg-wash pr-2 pl-1.5" style={{ width: LABEL_VAR }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left text-xs font-semibold hover:bg-gray-1 focus-visible:outline-2 focus-visible:outline-ink"
        >
          <ChevronDown aria-hidden className={cn("size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none", collapsed && "-rotate-90")} />
          <span className="truncate" title={group.label}>
            {group.label}
          </span>
          <span className="ml-auto shrink-0 rounded-full border bg-paper px-1.5 text-[10px] font-semibold text-soft tabular-nums">{group.rows.length}</span>
          <span className="sr-only">{collapsed ? "(plegado, clic para abrir)" : "(clic para plegar)"}</span>
        </button>
        {group.href ? (
          <Link
            href={group.href}
            title={`Abrir ${group.label}`}
            className="shrink-0 rounded-md p-1 text-soft opacity-70 hover:bg-gray-1 hover:text-ink hover:opacity-100 focus-visible:opacity-100"
          >
            <CornerDownRight aria-hidden className="size-3.5" />
            <span className="sr-only">Abrir {group.label}</span>
          </Link>
        ) : null}
      </div>
      <div className="relative h-9" style={{ width: trackW }}>
        {from != null && to != null ? (
          <span
            aria-hidden
            className={cn("absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gray-3/70 transition-opacity", collapsed ? "opacity-100" : "opacity-45")}
            style={{ left: pct(from), width: pct(Math.max(to - from, 0.4)) }}
          />
        ) : null}
      </div>
    </div>
  );
}

const Row = memo(function Row({ row, trackW }: { row: TimelineRow; trackW: number }) {
  const tone = COLUMN_TONE[row.tone];
  const Icon = tone.icon;
  const bar = row.bar;
  const barPx = bar ? (bar.width / 100) * trackW : 0;
  const labelPx = estimateLabelPx(row.statusLabel) + 18; // + ícono
  const place = bar ? labelPlacement(bar, labelPx, trackW) : "none";
  const progress = bar?.progress ?? null;
  const when = bar
    ? `${bar.mode === "planned" ? "Planeado" : "Real"}: ${bar.range}${bar.ongoing ? (progress != null ? `, en curso (va en ${Math.round(progress)} %)` : ", en curso") : ""}`
    : "";
  const tooltip = `${row.title}\n${row.statusLabel} · ${when}${row.ownerName ? `\nResponsable: ${row.ownerName}` : ""}${row.warning ? `\n⚠ ${row.warning}` : ""}`;

  const outside = (
    <span className="inline-flex items-center gap-1 rounded-md bg-paper/85 px-1 text-[11px] font-medium whitespace-nowrap text-soft">
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {row.statusLabel}
    </span>
  );

  return (
    <div className="group/row flex border-b last:border-b-0">
      <div
        className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r bg-paper px-3 transition-colors group-hover/row:bg-wash"
        style={{ width: LABEL_VAR, height: ROW_H }}
      >
        <OwnerInitials name={row.ownerName} className="hidden sm:inline-flex" />
        <div className="min-w-0 flex-1 leading-tight">
          <Link href={row.href} className="block truncate text-[13px] font-medium hover:underline" title={row.title}>
            {row.title}
          </Link>
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-soft">
            <span className="truncate">{row.ownerName ?? "Sin responsable"}</span>
            {row.badge ? <span className="hidden shrink-0 rounded border px-1 text-[9px] font-medium uppercase sm:inline">{row.badge}</span> : null}
          </span>
        </div>
        {row.warning ? (
          <span title={row.warning} className="inline-flex shrink-0 rounded bg-highlight p-0.5 text-[#1f1f1f]">
            <TriangleAlert aria-hidden className="size-3" />
            <span className="sr-only">Alerta: {row.warning}</span>
          </span>
        ) : null}
      </div>
      <div className="relative transition-colors group-hover/row:bg-ink/[0.035]" style={{ width: trackW, height: ROW_H }}>
        {bar ? (
          <>
            <Link
              href={row.href}
              title={tooltip}
              aria-label={`${row.title}. ${row.statusLabel}. ${when}.${row.ownerName ? ` Responsable: ${row.ownerName}.` : ""}${row.warning ? ` ${row.warning}` : ""} Abrir detalle.`}
              className={cn(
                "absolute top-2.5 z-10 flex h-6 origin-left items-center gap-1 overflow-clip rounded-lg px-2 text-[11px] font-semibold whitespace-nowrap shadow-xs",
                "transition-[box-shadow,translate] duration-150 hover:-translate-y-px hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2 motion-safe:duration-500",
                bar.mode === "planned" ? "border-2 border-dashed border-gray-4 bg-paper text-soft" : tone.bar,
              )}
              style={{
                left: pct(bar.left),
                width: `max(${pct(bar.width)}, 6px)`,
                backgroundImage:
                  bar.mode === "planned"
                    ? "repeating-linear-gradient(135deg, color-mix(in oklab, var(--gray-2) 55%, transparent) 0 4px, transparent 4px 9px)"
                    : "linear-gradient(180deg, rgb(255 255 255 / 0.22), rgb(255 255 255 / 0) 55%, rgb(0 0 0 / 0.06))",
              }}
            >
              {progress != null ? (
                // Lo que falta del plan, más tenue; el borde marca hasta dónde va hoy.
                <span
                  aria-hidden
                  className="absolute inset-y-0 right-0 border-l-2 border-ink/70 bg-paper/55"
                  style={{ left: pct(progress) }}
                />
              ) : null}
              {bar.ongoing && progress == null ? (
                <span aria-hidden className="absolute inset-y-1 right-1 w-1 rounded-full bg-ink/70 motion-safe:animate-pulse" />
              ) : null}
              {place === "inside" ? (
                // La etiqueta se queda a la vista aunque el inicio de la barra quede detrás de la columna fija.
                <span className="sticky flex min-w-0 items-center gap-1" style={{ left: `calc(${LABEL_VAR} + 0.5rem)` }}>
                  <Icon aria-hidden className="size-3.5 shrink-0" />
                  <span className="truncate">{row.statusLabel}</span>
                </span>
              ) : barPx >= 22 ? (
                <Icon aria-hidden className="relative size-3.5 shrink-0" />
              ) : null}
            </Link>
            {place === "right" ? (
              <span
                aria-hidden
                className="pointer-events-none absolute top-2.5 z-10 flex h-6 items-center pl-2"
                style={{ left: `max(calc(${pct(bar.left)} + 6px), ${pct(bar.left + bar.width)})` }}
              >
                {outside}
              </span>
            ) : place === "left" ? (
              <span
                aria-hidden
                className="pointer-events-none absolute top-2.5 z-10 flex h-6 -translate-x-full items-center pr-2"
                style={{ left: pct(bar.left) }}
              >
                {outside}
              </span>
            ) : null}
          </>
        ) : (
          <div className="flex h-full w-full items-center">
            <span className="sticky rounded-md border border-dashed px-2 py-0.5 text-xs text-soft" style={{ left: `calc(${LABEL_VAR} + 0.5rem)` }}>
              {row.emptyText ?? "Sin fechas"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

function Toolbar({
  scroller,
  labelCell,
  months,
  trackW,
  todayLeft,
  decisions,
  zoom,
  zoomHrefs,
  onStep,
  onToday,
  onJump,
}: {
  scroller: RefObject<HTMLDivElement | null>;
  labelCell: RefObject<HTMLDivElement | null>;
  months: HeaderCell[];
  trackW: number;
  todayLeft: number | null;
  decisions: TimelineEvent[];
  zoom: GanttZoom;
  zoomHrefs?: Partial<Record<GanttZoom, string>>;
  onStep: (dir: 1 | -1) => void;
  onToday: () => void;
  onJump: (pct: number) => void;
}) {
  // Ventana visible en % de la pista (para el minimapa y el rango en palabras).
  const [view, setView] = useState({ from: 0, to: 100 });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const label = labelCell.current?.offsetWidth ?? 0;
      const visible = Math.max(1, el.clientWidth - label);
      setView({ from: (el.scrollLeft / trackW) * 100, to: Math.min(100, ((el.scrollLeft + visible) / trackW) * 100) });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scroller, labelCell, trackW]);

  const inView = months.filter((m) => m.left + m.width > view.from + 0.3 && m.left < view.to - 0.3);
  const first = inView[0];
  const last = inView[inView.length - 1];
  const rangeText = first && last ? (first === last ? first.title : `${first.title.replace(" de ", " ")} – ${last.title.replace(" de ", " ")}`) : "";
  const todayVisible = todayLeft != null && todayLeft >= view.from && todayLeft <= view.to;
  const atStart = view.from <= 0.2;
  const atEnd = view.to >= 99.8;

  const navBtn =
    "inline-flex size-8 items-center justify-center rounded-lg text-ink transition-colors hover:bg-gray-1 disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-ink";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2">
      <div className="flex items-center gap-0.5 rounded-xl border bg-paper p-0.5">
        <button type="button" className={navBtn} onClick={() => onStep(-1)} disabled={atStart} aria-label="Mes anterior" title="Mes anterior (Mayús + ←)">
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          onClick={onToday}
          disabled={todayLeft == null}
          title="Volver a hoy (H)"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors hover:bg-gray-1 disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-ink",
            !todayVisible && todayLeft != null && "bg-highlight text-[#1f1f1f] hover:bg-highlight/85",
          )}
        >
          <LocateFixed aria-hidden className="size-3.5" />
          Hoy
        </button>
        <button type="button" className={navBtn} onClick={() => onStep(1)} disabled={atEnd} aria-label="Mes siguiente" title="Mes siguiente (Mayús + →)">
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>

      <p className="min-w-0 text-sm font-semibold first-letter:uppercase" aria-live="polite">
        {rangeText}
      </p>

      <div className="order-last flex w-full items-center gap-3 sm:order-none sm:ml-auto sm:w-auto">
        <Minimap view={view} todayLeft={todayLeft} decisions={decisions} onJump={onJump} />
        {zoomHrefs ? (
          <div role="group" aria-label="Escala de la línea de tiempo" className="inline-flex shrink-0 rounded-xl border bg-paper p-0.5">
            {GANTT_ZOOMS.map(({ zoom: z, label }) => {
              const href = zoomHrefs[z];
              const active = z === zoom;
              return href ? (
                <Link
                  key={z}
                  href={href}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] transition-colors hover:bg-gray-1 focus-visible:outline-2 focus-visible:outline-ink",
                    active ? "bg-gray-1 font-semibold text-ink" : "text-soft",
                  )}
                >
                  {label}
                </Link>
              ) : null;
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** "Usted está aquí": toda la línea de tiempo en miniatura con la ventana visible. Clic para saltar. */
function Minimap({
  view,
  todayLeft,
  decisions,
  onJump,
}: {
  view: { from: number; to: number };
  todayLeft: number | null;
  decisions: TimelineEvent[];
  onJump: (pct: number) => void;
}) {
  const full = view.from <= 0.2 && view.to >= 99.8;
  return (
    <button
      type="button"
      title="Usted está aquí. Haga clic para saltar a otra parte de la línea de tiempo."
      aria-label={full ? "Se ve toda la línea de tiempo" : `Se ve del ${Math.round(view.from)} % al ${Math.round(view.to)} % de la línea de tiempo. Clic para saltar.`}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onJump(((e.clientX - r.left) / r.width) * 100);
      }}
      className="relative h-6 min-w-0 flex-1 cursor-pointer overflow-hidden rounded-md border bg-wash sm:w-44 sm:flex-none focus-visible:outline-2 focus-visible:outline-ink"
    >
      {decisions.map((d) => (
        <span key={d.id} aria-hidden className="absolute inset-y-0 w-0.5 bg-highlight" style={{ left: pct(d.left) }} />
      ))}
      {todayLeft != null ? <span aria-hidden className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: pct(todayLeft) }} /> : null}
      <span
        aria-hidden
        className="absolute inset-y-0.5 rounded-[4px] border-2 border-ink/70 bg-ink/10 transition-[left,width] duration-150 motion-reduce:transition-none"
        style={{ left: pct(view.from), width: pct(Math.max(view.to - view.from, 2)) }}
      />
    </button>
  );
}

function Legend({ withCalendar }: { withCalendar: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t bg-wash/60 px-4 py-2 text-[11px] text-soft" aria-label="Leyenda">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-5 rounded-sm bg-gray-3" /> Real
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-2.5 w-5 rounded-sm border border-dashed border-gray-4"
          style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--gray-2) 0 2px, transparent 2px 5px)" }}
        />{" "}
        Planeado
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="relative h-2.5 w-5 overflow-hidden rounded-sm bg-highlight">
          <span className="absolute inset-y-0 right-0 left-1/2 border-l border-ink/70 bg-paper/55" />
        </span>{" "}
        En prueba (avance a hoy)
      </span>
      {withCalendar ? (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="freeze-stripes h-2.5 w-5 rounded-sm border border-gray-3" /> Congelamiento
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Flag aria-hidden className="size-3 text-ink" /> Pico
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rotate-45 rounded-[2px] bg-highlight" /> Decisión
          </span>
        </>
      ) : null}
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-0.5 bg-ink" /> Hoy
      </span>
      <span className="ml-auto hidden md:inline">Arrastre para moverse · Mayús + rueda también sirve</span>
    </div>
  );
}
