import {
  BOARD_COLUMNS,
  isAging,
  ROADMAP_BUCKETS,
  ROADMAP_HINT,
  ROADMAP_LABEL,
  roadmapBucket,
  wipState,
  type BoardItem,
  type HealthLevel,
} from "@/domain/boards";
import { BoardCard, BoardColumnFrame } from "./board-parts";

// Vistas de solo lectura del tablero general: Kanban unificado y hoja de ruta.

const secondChip = (i: BoardItem) => (i.kind === "experiment" ? i.programName : null);

/** Kanban de solo lectura: ejercicios y pilotos en las mismas cinco columnas. */
export function ReadOnlyKanban({ items, withWip }: { items: BoardItem[]; withWip: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-3 lg:mx-0 lg:px-0">
      <div className="flex w-max gap-3">
        {BOARD_COLUMNS.map((column) => {
          const inColumn = items.filter((i) => i.column === column).sort((a, b) => b.days - a.days);
          return (
            <BoardColumnFrame
              key={column}
              column={column}
              // Los límites WIP son por programa: solo aplican con un programa filtrado.
              wip={wipState(column, inColumn.length, withWip ? undefined : {})}
              hint={column === "design" ? "Ejercicios en diseño y pilotos aprobados, listos para arrancar." : undefined}
              isEmpty={inColumn.length === 0}
            >
              {inColumn.map((i) => (
                <BoardCard
                  key={`${i.kind}-${i.id}`}
                  title={i.title}
                  href={i.href}
                  chip={i.chip}
                  secondaryChip={secondChip(i)}
                  ownerName={i.ownerName}
                  days={i.days}
                  aging={isAging(column, i.days)}
                  statusLabel={i.statusLabel}
                  highlight={column === "test"}
                />
              ))}
            </BoardColumnFrame>
          );
        })}
      </div>
    </div>
  );
}

const HEALTH_ORDER: Record<HealthLevel, number> = { red: 0, yellow: 1, green: 2 };

/** Hoja de ruta Ahora / Siguiente / Después con semáforo de salud por tarjeta. */
export function Roadmap({ items }: { items: BoardItem[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {ROADMAP_BUCKETS.map((bucket) => {
        const inBucket = items
          .filter((i) => roadmapBucket(i.column, i.status) === bucket)
          .sort((a, b) => HEALTH_ORDER[a.health.level] - HEALTH_ORDER[b.health.level] || b.days - a.days);
        const risky = inBucket.filter((i) => i.health.level !== "green").length;
        return (
          <section key={bucket} aria-labelledby={`ruta-${bucket}`} className={`flex flex-col rounded-2xl border bg-wash/60 ${bucket === "now" ? "border-t-4 border-t-highlight" : ""}`}>
            <header className="border-b px-3 py-2">
              <div className="flex items-center gap-2">
                <h2 id={`ruta-${bucket}`} className="font-heading text-lg font-extrabold">
                  {ROADMAP_LABEL[bucket]}
                </h2>
                <span className="ml-auto rounded-full border bg-paper px-2 text-xs tabular-nums">{inBucket.length}</span>
              </div>
              <p className="text-[11px] text-soft">
                {ROADMAP_HINT[bucket]}
                {risky ? ` ${risky} con alerta.` : ""}
              </p>
            </header>
            <div className="flex min-h-28 flex-col gap-2 p-2">
              {inBucket.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-soft">Nada por aquí.</p>
              ) : (
                inBucket.map((i) => (
                  <BoardCard
                    key={`${i.kind}-${i.id}`}
                    title={i.title}
                    href={i.href}
                    chip={i.chip}
                    secondaryChip={secondChip(i)}
                    ownerName={i.ownerName}
                    days={i.days}
                    aging={false}
                    statusLabel={i.statusLabel}
                    health={i.health}
                    reasons
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
