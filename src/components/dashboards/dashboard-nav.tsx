import { CalendarRange, ChartColumn, Columns3, Grid3x3, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type DashboardKey = "gantt" | "kanban" | "resultados" | "portafolio";

const ITEMS: { key: DashboardKey; label: string; icon: LucideIcon }[] = [
  { key: "gantt", label: "Gantt", icon: CalendarRange },
  { key: "kanban", label: "Kanban", icon: Columns3 },
  { key: "resultados", label: "Resultados", icon: ChartColumn },
  { key: "portafolio", label: "Portafolio y velocidad", icon: Grid3x3 },
];

/** Pestañas entre tableros; `query` lleva los filtros globales para conservarlos. */
export function DashboardNav({ programId, active, query }: { programId: string; active: DashboardKey; query: string }) {
  return (
    <nav aria-label="Tableros" className="-mx-1 overflow-x-auto px-1">
      <ul className="flex w-max gap-1 border-b">
        {ITEMS.map(({ key, label, icon: Icon }) => {
          const isActive = key === active;
          return (
            <li key={key}>
              <Link
                href={`/programas/${programId}/tableros/${key}${query}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative -mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-soft transition-colors hover:text-ink",
                  isActive && "border-highlight font-semibold text-ink",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
