import { Clock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode, Ref } from "react";
import { BOARD_COLUMN_HINT, BOARD_COLUMN_LABEL, type BoardColumnKey, type Health, type WipState } from "@/domain/boards";
import { cn } from "@/lib/utils";
import { HealthBadge } from "./health-badge";
import { OwnerInitials } from "./owner-initials";
import { COLUMN_TONE } from "./tones";

// Piezas de presentación compartidas por el Kanban del programa (con arrastre)
// y los tableros generales (solo lectura). Sin estado ni efectos.

export function BoardColumnFrame({
  column,
  title,
  hint,
  wip,
  containerRef,
  className,
  headerExtra,
  emptyText = "Por aquí no hay nada",
  isEmpty,
  children,
}: {
  column: BoardColumnKey;
  /** Por defecto, la etiqueta de la columna. */
  title?: string;
  hint?: string;
  wip: WipState;
  containerRef?: Ref<HTMLElement>;
  className?: string;
  headerExtra?: ReactNode;
  emptyText?: ReactNode;
  isEmpty: boolean;
  children?: ReactNode;
}) {
  const Icon = COLUMN_TONE[column].icon;
  const headingId = `board-col-${column}`;
  const label = title ?? BOARD_COLUMN_LABEL[column];
  return (
    <section
      ref={containerRef}
      aria-labelledby={headingId}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-2xl border bg-wash/60 transition-colors",
        column === "test" && "border-t-4 border-t-highlight",
        className,
      )}
    >
      <header className="border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon aria-hidden className="size-4 shrink-0" />
          <h2 id={headingId} className="text-sm font-bold">
            {label}
          </h2>
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-full border bg-paper px-2 text-xs tabular-nums",
              wip.over && "border-highlight bg-highlight font-semibold text-[#1f1f1f]",
            )}
            title={wip.limit != null ? `Límite de trabajo en curso: ${wip.limit}` : undefined}
          >
            {wip.over ? <TriangleAlert aria-hidden className="size-3" /> : null}
            {wip.text}
            <span className="sr-only">
              {wip.limit != null ? ` de un límite de ${wip.limit}${wip.over ? ", se pasó del límite" : ""}` : " tarjetas"}
            </span>
          </span>
        </div>
        <p data-explain className="mt-0.5 text-[11px] text-soft">
          {hint ?? BOARD_COLUMN_HINT[column]}
        </p>
        {wip.over ? (
          <p className="mt-1 text-[11px] font-medium">Muchas cosas a la vez: cierre antes de abrir otra.</p>
        ) : null}
        {headerExtra}
      </header>
      <div className="flex min-h-28 flex-1 flex-col gap-2 p-2">
        {isEmpty ? <p className="px-1 py-4 text-center text-xs text-soft">{emptyText}</p> : children}
      </div>
    </section>
  );
}

export function BoardCard({
  title,
  href,
  chip,
  secondaryChip,
  ownerName,
  days,
  aging,
  statusLabel,
  health,
  reasons,
  highlight,
  handle,
  footer,
  status,
  overlay,
}: {
  title: string;
  href?: string;
  /** Línea del ejercicio o "Piloto de medios". */
  chip: string;
  secondaryChip?: string | null;
  ownerName: string | null;
  days: number;
  aging: boolean;
  /** Subestado dentro de una columna agrupada (p. ej. Idea o Priorizado). */
  statusLabel?: string | null;
  health?: Health | null;
  /** Mostrar las razones del semáforo debajo. */
  reasons?: boolean;
  highlight?: boolean;
  handle?: ReactNode;
  footer?: ReactNode;
  status?: ReactNode;
  overlay?: boolean;
}) {
  return (
    <article
      className={cn(
        "rounded-xl border bg-paper p-2.5 text-sm shadow-card transition-shadow hover:shadow-md",
        highlight && "border-l-4 border-l-highlight",
        overlay && "w-68 rotate-1 cursor-grabbing shadow-lg ring-2 ring-ink",
      )}
    >
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 leading-snug font-medium">
          {href ? (
            <Link href={href} draggable={false} className="hover:underline">
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>
        {handle}
      </div>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px]">
        <span className="max-w-40 truncate rounded-full border bg-wash px-1.5 text-soft" title={chip}>
          {chip}
        </span>
        {secondaryChip ? (
          <span className="max-w-32 truncate rounded-full border px-1.5 text-soft" title={secondaryChip}>
            {secondaryChip}
          </span>
        ) : null}
        {statusLabel ? <span className="text-soft">{statusLabel}</span> : null}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs tabular-nums">
        <OwnerInitials name={ownerName} />
        <span
          className={cn("inline-flex items-center gap-1", aging ? "rounded bg-highlight px-1 font-semibold text-[#1f1f1f]" : "text-soft")}
          title={aging ? "Lleva mucho en esta columna" : "Días en el estado actual"}
        >
          {aging ? <TriangleAlert aria-hidden className="size-3" /> : <Clock aria-hidden className="size-3" />}
          {days} d<span className="sr-only">ías en el estado actual{aging ? ", se está quedando quieto" : ""}</span>
        </span>
        {health ? <HealthBadge health={health} className="ml-auto" /> : null}
      </div>
      {reasons && health?.reasons.length ? (
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-soft">
          {health.reasons.map((r) => (
            <li key={r}>· {r}</li>
          ))}
        </ul>
      ) : null}
      {status}
      {footer}
    </article>
  );
}
