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
import { ArrowRightLeft, Eye, EyeOff, GripVertical, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type KeyboardEventHandler, type MouseEventHandler, type ReactNode, type TouchEventHandler } from "react";
import { toast } from "sonner";
import { BoardCard, BoardColumnFrame } from "@/components/boards/board-parts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import {
  BOARD_COLUMN_LABEL,
  BOARD_COLUMNS,
  dropOptions,
  EXPERIMENT_COLUMN_STATUSES,
  experimentColumn,
  isAging,
  wipState,
  type BoardColumnKey,
} from "@/domain/boards";
import { formatScore } from "@/domain/format";
import { STATUS_LABEL } from "@/domain/labels";
import { TRANSITIONS } from "@/domain/lifecycle";
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

/**
 * Kanban del programa: cinco columnas (Por hacer, En diseño, En prueba, En
 * lectura, Cerrado) con límites WIP; Descartado queda detrás de un botón. Las
 * reglas de transición y permisos son las de `domain/lifecycle` y `permissions`.
 */
export function Kanban({ programId, cards, actor }: { programId: string; cards: KanbanCardData[]; actor: Actor }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showDiscarded, setShowDiscarded] = useState(false);
  // Soltar en una columna con más de un destino posible: se pregunta cuál.
  const [choice, setChoice] = useState<{ card: KanbanCardData; options: ExperimentStatus[] } | null>(null);
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
  const active = activeId ? (byId.get(activeId) ?? null) : null;
  const activeTargets = active ? allowedTargets(actor, active) : [];
  const detailHref = (id: string) => `/programas/${programId}/ejercicios/${id}`;
  const discardedCount = cards.filter((c) => c.status === "discarded").length;
  const columns: BoardColumnKey[] = showDiscarded ? [...BOARD_COLUMNS, "discarded"] : [...BOARD_COLUMNS];

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const card = byId.get(String(e.active.id));
    const column = e.over?.id as BoardColumnKey | undefined;
    if (!card || !column || column === experimentColumn(card.status)) return;
    const options = dropOptions(TRANSITIONS[card.status], column);
    if (options.length === 0) {
      const allowed = TRANSITIONS[card.status].map((s) => STATUS_LABEL[s]);
      toast.error(
        `No se puede pasar de ${STATUS_LABEL[card.status]} a ${BOARD_COLUMN_LABEL[column]}.` +
          (allowed.length ? ` Desde ${STATUS_LABEL[card.status]} solo puede pasar a ${allowed.join(" o ")}.` : ""),
      );
      return;
    }
    if (options.length > 1) {
      setChoice({ card, options });
      return;
    }
    await move(card, options[0]);
  }

  /** Mismo flujo para arrastrar, para el menú «Mover a…» y para la elección al soltar. */
  async function move(card: KanbanCardData, to: ExperimentStatus) {
    if (!TRANSITIONS[card.status].includes(to)) {
      toast.error(`No se puede pasar de ${STATUS_LABEL[card.status]} a ${STATUS_LABEL[to]}.`);
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
      toast.error("No se pudo mover el ejercicio. Revise su conexión e intente de nuevo.");
    }
  }

  const pendingTo = (c: KanbanCardData) => (pending[c.id]?.since === c.statusChangedAt ? pending[c.id].to : null);
  const colLabel = (id: unknown) => BOARD_COLUMN_LABEL[id as BoardColumnKey] ?? "la columna";

  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `Tomó «${byId.get(String(a.id))?.title ?? "el ejercicio"}».`,
    onDragOver: ({ over }) => (over ? `Sobre la columna ${colLabel(over.id)}.` : "Fuera de las columnas."),
    onDragEnd: ({ over }) => (over ? `Soltó en ${colLabel(over.id)}. Validando la transición…` : "Soltó fuera de las columnas; no se movió."),
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
      <div className="mb-2 flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowDiscarded((v) => !v)} aria-pressed={showDiscarded}>
          {showDiscarded ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          {showDiscarded ? "Ocultar descartados" : `Ver descartados (${discardedCount})`}
        </Button>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 pb-3 lg:mx-0 lg:px-0">
        <div className="flex w-max gap-3">
          {columns.map((column) => {
            const inColumn = cards.filter((c) => experimentColumn(c.status) === column);
            const validTarget = !!active && dropOptions(activeTargets, column).length > 0;
            return (
              <DroppableColumn
                key={column}
                column={column}
                count={inColumn.length}
                dragging={!!active}
                isValidTarget={validTarget}
                isSource={!!active && experimentColumn(active.status) === column}
              >
                {inColumn.map((c) => {
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
              </DroppableColumn>
            );
          })}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>{active ? <CardView card={active} overlay /> : null}</DragOverlay>

      <Dialog open={!!choice} onOpenChange={(open) => !open && setChoice(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿A qué estado lo pasa?</DialogTitle>
            <DialogDescription>{choice ? `«${choice.card.title}» puede quedar en cualquiera de estos.` : null}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {choice?.options.map((to) => {
              const Icon = STATUS_FILL[to].icon;
              return (
                <Button
                  key={to}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const card = choice.card;
                    setChoice(null);
                    void move(card, to);
                  }}
                >
                  <Icon aria-hidden /> {STATUS_LABEL[to]}
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}

function DroppableColumn({
  column,
  count,
  dragging,
  isValidTarget,
  isSource,
  children,
}: {
  column: BoardColumnKey;
  count: number;
  dragging: boolean;
  isValidTarget: boolean;
  isSource: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  return (
    <BoardColumnFrame
      column={column}
      wip={wipState(column, count)}
      containerRef={setNodeRef}
      isEmpty={count === 0}
      emptyText={dragging && isValidTarget ? "Suéltelo aquí para moverlo" : "Por aquí no hay ejercicios"}
      className={cn(
        dragging && isValidTarget && "border-dashed border-ink/60 bg-paper",
        dragging && !isValidTarget && !isSource && "opacity-60",
        isOver && isValidTarget && "ring-2 ring-ink",
        isOver && !isValidTarget && !isSource && "ring-2 ring-gray-3",
      )}
      headerExtra={
        dragging && isValidTarget && column === "closed" ? (
          <p className="mt-1 rounded bg-highlight/15 px-1.5 py-1 text-[11px]">Pide veredicto, decisión y aprendizaje registrados en el detalle.</p>
        ) : null
      }
    >
      {children}
    </BoardColumnFrame>
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
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useDraggable({ id: card.id, disabled: !draggable });
  return (
    <div
      ref={setNodeRef}
      onMouseDown={listeners?.onMouseDown as MouseEventHandler<HTMLDivElement> | undefined}
      onTouchStart={listeners?.onTouchStart as TouchEventHandler<HTMLDivElement> | undefined}
      className={cn("relative", hidden && "opacity-40", draggable && "cursor-grab active:cursor-grabbing")}
    >
      <CardView
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

/** Alternativa al arrastre (táctil, teclado o preferencia): lista los destinos permitidos. */
function MoveMenu({ card, targets, onMove }: { card: KanbanCardData; targets: ExperimentStatus[]; onMove: (to: ExperimentStatus) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="mt-1.5 -ml-1 text-soft"
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

function CardView({
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
  const column = experimentColumn(card.status);
  const grouped = EXPERIMENT_COLUMN_STATUSES[column].length > 1;
  // En Por hacer el puntaje ayuda a escoger qué sigue.
  const score = column === "todo" && card.finalScore != null ? ` · Puntaje ${formatScore(card.finalScore)}` : "";
  return (
    <BoardCard
      title={card.title}
      href={href}
      chip={card.lineName || "Sin línea"}
      ownerName={card.ownerName}
      days={card.days}
      aging={isAging(column, card.days)}
      statusLabel={grouped || score ? `${grouped ? STATUS_LABEL[card.status] : ""}${score}`.replace(/^ · /, "") : null}
      highlight={card.status === "in_test"}
      overlay={overlay}
      handle={handle}
      footer={footer}
      status={
        pendingTo ? (
          <div role="status" className="mt-2 flex items-center gap-1.5 rounded bg-wash px-2 py-1 text-xs">
            <Spinner className="size-3.5" /> Moviendo a {STATUS_LABEL[pendingTo]}…
          </div>
        ) : null
      }
    />
  );
}
