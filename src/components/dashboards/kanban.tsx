"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { ArrowRightLeft, Clock, GripVertical, Info, Lock, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type KeyboardEventHandler, type MouseEventHandler, type ReactNode, type TouchEventHandler } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatScore } from "@/domain/format";
import { STATUS_LABEL } from "@/domain/labels";
import { STATUS_ORDER, TRANSITIONS } from "@/domain/lifecycle";
import { canTransition } from "@/domain/permissions";
import type { Actor, ExperimentStatus } from "@/domain/types";
import { cn } from "@/lib/utils";
import { CELEBRATIONS, celebrate } from "@/components/brand/celebrate";
import { transitionExperiment } from "@/server/actions/experiments";
import { STATUS_FILL } from "./status-visual";

export interface KanbanCardData {
  id: string;
  title: string;
  status: ExperimentStatus;
  lineName: string;
  ownerId: string | null;
  ownerName: string | null;
  finalScore: number | null;
  /** Días en el estado actual (calculado en el servidor). */
  days: number;
  statusChangedAt: string;
}

/** Destinos a los que el actor puede intentar mover la tarjeta. */
function allowedTargets(actor: Actor, card: KanbanCardData): ExperimentStatus[] {
  return TRANSITIONS[card.status].filter((to) => canTransition(actor, { owner_id: card.ownerId, status: card.status }, to));
}

function lockReason(card: KanbanCardData): string {
  if (TRANSITIONS[card.status].length === 0) return `${STATUS_LABEL[card.status]} es un estado final.`;
  return "Usted no tiene permiso para mover este ejercicio de estado.";
}

/** Con teclado, las flechas saltan de columna en columna (no de a pocos píxeles). */
const columnCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const forward = event.code === "ArrowRight" || event.code === "ArrowDown";
  const backward = event.code === "ArrowLeft" || event.code === "ArrowUp";
  if (!forward && !backward) return undefined;
  event.preventDefault();
  const { collisionRect, droppableRects, droppableContainers, over } = context;
  if (!collisionRect) return undefined;
  const columns = droppableContainers
    .getEnabled()
    .map((c) => ({ id: c.id, rect: droppableRects.get(c.id) }))
    .filter((c): c is { id: typeof c.id; rect: NonNullable<typeof c.rect> } => !!c.rect)
    .sort((a, b) => a.rect.left - b.rect.left);
  if (!columns.length) return undefined;
  const centerX = collisionRect.left + collisionRect.width / 2;
  let index = over ? columns.findIndex((c) => c.id === over.id) : -1;
  if (index < 0) index = columns.findIndex((c) => centerX >= c.rect.left && centerX <= c.rect.left + c.rect.width);
  const next = columns[Math.min(columns.length - 1, Math.max(0, (index < 0 ? 0 : index) + (forward ? 1 : -1)))];
  return { x: next.rect.left + 8, y: next.rect.top + 48 };
};

const COLUMN_HINT: Partial<Record<ExperimentStatus, string>> = {
  decided: "El veredicto, la decisión y el aprendizaje se registran desde el detalle del ejercicio; sin ellos la transición se rechaza.",
  scaled: "Solo ejercicios decididos con la decisión «Escalar».",
  discarded: "Se puede descartar desde Idea, Priorizado o En diseño.",
};

export function Kanban({ programId, cards, actor }: { programId: string; cards: KanbanCardData[]; actor: Actor }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);
  // Tarjeta → destino mientras la transición está en curso. Tras un éxito se
  // mantiene hasta que llegan los datos nuevos (cambia `statusChangedAt`).
  const [pending, setPending] = useState<Record<string, { since: string; to: ExperimentStatus }>>({});
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // En pantallas táctiles hay que sostener un momento: así el dedo todavía puede desplazar el tablero.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates }),
  );

  const byId = new Map(cards.map((c) => [c.id, c]));
  const active = activeId ? byId.get(activeId) ?? null : null;
  const activeTargets = active ? allowedTargets(actor, active) : [];
  const detailHref = (id: string) => `/programas/${programId}/ejercicios/${id}`;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const card = byId.get(String(e.active.id));
    const to = e.over?.id as ExperimentStatus | undefined;
    if (!card || !to || to === card.status) return;
    await move(card, to);
  }

  /** Mismo flujo para arrastrar y para el menú «Mover a…». */
  async function move(card: KanbanCardData, to: ExperimentStatus) {

    if (!TRANSITIONS[card.status].includes(to)) {
      const allowed = TRANSITIONS[card.status].map((s) => STATUS_LABEL[s]);
      toast.error(
        `No se puede pasar de ${STATUS_LABEL[card.status]} a ${STATUS_LABEL[to]}.` +
          (allowed.length ? ` Desde ${STATUS_LABEL[card.status]} solo puede pasar a ${allowed.join(" o ")}.` : ""),
      );
      return;
    }
    if (!canTransition(actor, { owner_id: card.ownerId, status: card.status }, to)) {
      toast.error(
        to === "decided" || to === "scaled"
          ? "Solo el owner o un admin puede decidir un ejercicio."
          : "Usted no tiene permiso para mover este ejercicio.",
      );
      return;
    }

    const clear = () =>
      setPending((p) => {
        const next = { ...p };
        delete next[card.id];
        return next;
      });
    setPending((p) => ({ ...p, [card.id]: { since: card.statusChangedAt, to } }));
    try {
      const result = await transitionExperiment({ experimentId: card.id, programId, to });
      if (result.ok) {
        if (to === "scaled") celebrate(...CELEBRATIONS.scaled);
        else toast.success(`¡Eso! «${card.title}» pasó a ${STATUS_LABEL[to]}.`);
        router.refresh();
      } else {
        clear();
        toast.error(result.error, {
          description: to === "decided" ? "La decisión se registra desde el detalle del ejercicio." : undefined,
          action: { label: "Abrir detalle", onClick: () => router.push(detailHref(card.id)) },
        });
      }
    } catch {
      clear();
      toast.error("No se pudo mover el ejercicio. Revise su conexión e intente de nuevo. ¡Qué pena con usted!");
    }
  }

  const pendingTo = (c: KanbanCardData) => (pending[c.id]?.since === c.statusChangedAt ? pending[c.id].to : null);

  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `Tomó «${byId.get(String(a.id))?.title ?? "el ejercicio"}».`,
    onDragOver: ({ over }) => (over ? `Sobre la columna ${STATUS_LABEL[over.id as ExperimentStatus]}.` : "Fuera de las columnas."),
    onDragEnd: ({ over }) =>
      over ? `Soltó en ${STATUS_LABEL[over.id as ExperimentStatus]}. Validando la transición…` : "Soltó fuera de las columnas; no se movió.",
    onDragCancel: () => "Movimiento cancelado; la tarjeta no se movió.",
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "Para mover el ejercicio, pulse espacio o enter sobre el asa, use las flechas izquierda y derecha para cambiar de columna y vuelva a pulsar espacio o enter para soltar. Escape cancela.",
        },
      }}
    >
      <div className="-mx-4 overflow-x-auto px-4 pb-3 lg:mx-0 lg:px-0">
        <div className="flex w-max gap-3">
          {STATUS_ORDER.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              cards={cards.filter((c) => c.status === status)}
              dragging={!!active}
              isValidTarget={activeTargets.includes(status)}
              isSource={active?.status === status}
            >
              {cards
                .filter((c) => c.status === status)
                .map((c) => {
                  const targets = allowedTargets(actor, c);
                  const movingTo = pendingTo(c);
                  return (
                    <KanbanCard
                      key={c.id}
                      card={c}
                      href={detailHref(c.id)}
                      draggable={targets.length > 0 && !movingTo}
                      lockedReason={targets.length ? null : lockReason(c)}
                      pendingTo={movingTo}
                      hidden={activeId === c.id}
                      targets={movingTo ? [] : targets}
                      onMove={(to) => void move(c, to)}
                    />
                  );
                })}
            </KanbanColumn>
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>{active ? <CardBody card={active} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  status,
  cards,
  dragging,
  isValidTarget,
  isSource,
  children,
}: {
  status: ExperimentStatus;
  cards: KanbanCardData[];
  dragging: boolean;
  isValidTarget: boolean;
  isSource: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const { icon: Icon } = STATUS_FILL[status];
  const hint = COLUMN_HINT[status];
  const headingId = `kanban-col-${status}`;
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-2xl border bg-wash/60 transition-colors",
        status === "in_test" && "border-t-4 border-t-highlight",
        dragging && isValidTarget && "border-dashed border-ink/60 bg-paper",
        dragging && !isValidTarget && !isSource && "opacity-60",
        isOver && isValidTarget && "ring-2 ring-ink",
        isOver && !isValidTarget && !isSource && "ring-2 ring-gray-3",
      )}
    >
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Icon aria-hidden className="size-4 shrink-0" />
        <h2 id={headingId} className="text-sm font-bold">
          {STATUS_LABEL[status]}
        </h2>
        <span className="ml-auto rounded-full border bg-paper px-2 text-xs tabular-nums" aria-label={`${cards.length} ejercicios`}>
          {cards.length}
        </span>
        {hint ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="rounded p-0.5 text-soft hover:text-ink" aria-label={`Ayuda: ${hint}`}>
                <Info aria-hidden className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{hint}</TooltipContent>
          </Tooltip>
        ) : null}
      </header>
      {dragging && isValidTarget && status === "decided" ? (
        <p className="border-b bg-highlight/15 px-3 py-1.5 text-xs">
          Requiere veredicto, decisión y aprendizaje registrados en el detalle.
        </p>
      ) : null}
      <div className="flex min-h-32 flex-1 flex-col gap-2 p-2">
        {cards.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-soft">
            {dragging && isValidTarget ? "Suéltelo aquí para moverlo" : "Por aquí no hay ejercicios"}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function KanbanCard({
  card,
  href,
  draggable,
  lockedReason,
  pendingTo,
  hidden,
  targets,
  onMove,
}: {
  card: KanbanCardData;
  href: string;
  draggable: boolean;
  lockedReason: string | null;
  pendingTo: ExperimentStatus | null;
  hidden: boolean;
  targets: ExperimentStatus[];
  onMove: (to: ExperimentStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useDraggable({
    id: card.id,
    disabled: !draggable,
  });
  return (
    <div
      ref={setNodeRef}
      onMouseDown={listeners?.onMouseDown as MouseEventHandler<HTMLDivElement> | undefined}
      onTouchStart={listeners?.onTouchStart as TouchEventHandler<HTMLDivElement> | undefined}
      className={cn("relative", hidden && "opacity-40", draggable && "cursor-grab active:cursor-grabbing")}
    >
      <CardBody
        card={card}
        href={href}
        pendingTo={pendingTo}
        footer={targets.length ? <MoveMenu card={card} targets={targets} onMove={onMove} /> : null}
        handle={
          draggable ? (
            <button
              ref={setActivatorNodeRef}
              type="button"
              {...attributes}
              onKeyDown={listeners?.onKeyDown as KeyboardEventHandler<HTMLButtonElement> | undefined}
              aria-label={`Mover «${card.title}» a otro estado`}
              aria-roledescription="tarjeta arrastrable"
              className="rounded p-0.5 text-soft hover:bg-gray-1 hover:text-ink"
            >
              <GripVertical aria-hidden className="size-4" />
            </button>
          ) : lockedReason && !pendingTo ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="rounded p-0.5 text-soft" aria-label={`No se puede mover: ${lockedReason}`}>
                  <Lock aria-hidden className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{lockedReason}</TooltipContent>
            </Tooltip>
          ) : null
        }
      />
    </div>
  );
}

/** Alternativa al arrastre (táctil, teclado o simplemente preferencia): lista los destinos permitidos. */
function MoveMenu({
  card,
  targets,
  onMove,
}: {
  card: KanbanCardData;
  targets: ExperimentStatus[];
  onMove: (to: ExperimentStatus) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="mt-2 -ml-1 text-soft"
          aria-label={`Mover «${card.title}» a…`}
          // Que el menú no dispare el arrastre de la tarjeta.
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <ArrowRightLeft aria-hidden /> Mover a…
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="text-xs text-soft">Desde {STATUS_LABEL[card.status]}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {targets.map((to) => {
          const Icon = STATUS_FILL[to].icon;
          return (
            <DropdownMenuItem key={to} onSelect={() => onMove(to)}>
              <Icon aria-hidden className="size-4" /> {STATUS_LABEL[to]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CardBody({
  card,
  href,
  handle,
  footer,
  pendingTo,
  overlay,
}: {
  card: KanbanCardData;
  href?: string;
  handle?: ReactNode;
  footer?: ReactNode;
  pendingTo?: ExperimentStatus | null;
  overlay?: boolean;
}) {
  return (
    <article
      aria-busy={pendingTo ? true : undefined}
      className={cn(
        "rounded-xl border bg-paper p-3 text-sm shadow-card transition-shadow hover:shadow-md",
        card.status === "in_test" && "border-l-4 border-l-highlight",
        overlay && "w-68 rotate-1 cursor-grabbing shadow-lg ring-2 ring-ink",
      )}
    >
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 font-medium leading-snug">
          {href ? (
            <Link href={href} draggable={false} className="hover:underline">
              {card.title}
            </Link>
          ) : (
            card.title
          )}
        </h3>
        {handle}
      </div>
      <div className="mt-1 truncate text-xs text-soft">{card.lineName}</div>
      <dl className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
        <div className="flex min-w-0 items-center gap-1">
          <dt>
            <User aria-hidden className="size-3.5" />
            <span className="sr-only">Responsable</span>
          </dt>
          <dd className="truncate">{card.ownerName ?? "Sin responsable"}</dd>
        </div>
        <div className="flex items-center gap-1">
          <dt className="text-soft">Puntaje</dt>
          <dd className="font-semibold">{formatScore(card.finalScore)}</dd>
        </div>
        <div className="flex items-center gap-1" title="Días en el estado actual">
          <dt>
            <Clock aria-hidden className="size-3.5" />
            <span className="sr-only">Días en el estado actual</span>
          </dt>
          <dd>
            {card.days} día{card.days === 1 ? "" : "s"}
          </dd>
        </div>
      </dl>
      {pendingTo ? (
        <div role="status" className="mt-2 flex items-center gap-1.5 rounded bg-wash px-2 py-1 text-xs">
          <Spinner className="size-3.5" /> Moviendo a {STATUS_LABEL[pendingTo]}…
        </div>
      ) : null}
      {footer}
    </article>
  );
}
