import { Filter, Network, Star, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const LINE_TABS = ["norte", "arbol", "embudo"] as const;
export type LineTab = (typeof LINE_TABS)[number];

const TABS: { id: LineTab; label: string; icon: LucideIcon }[] = [
  { id: "norte", label: "Métrica norte", icon: Star },
  { id: "arbol", label: "Árbol de métricas", icon: Network },
  { id: "embudo", label: "Embudo", icon: Filter },
];

export function parseLineTab(value: string | string[] | undefined): LineTab {
  const v = Array.isArray(value) ? value[0] : value;
  return (LINE_TABS as readonly string[]).includes(v ?? "") ? (v as LineTab) : "norte";
}

/** Pestañas de la vista de línea, manejadas por `?tab=` (se pueden enlazar). */
export function LineTabs({ baseHref, active }: { baseHref: string; active: LineTab }) {
  return (
    <nav aria-label="Secciones de la línea" className="mb-6 overflow-x-auto border-b">
      <ul className="flex min-w-max gap-1">
        {TABS.map((t) => {
          const isActive = t.id === active;
          const Icon = t.icon;
          return (
            <li key={t.id}>
              <Link
                href={`${baseHref}?tab=${t.id}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-10 items-center gap-1.5 rounded-t-md px-3 text-sm font-semibold text-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-ink",
                  isActive && "text-ink",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {t.label}
                {isActive ? (
                  <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-highlight" />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
