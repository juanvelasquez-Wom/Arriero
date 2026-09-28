import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface ViewTab {
  key: string;
  label: string;
  href: string;
  /** Número pequeño al lado (p. ej. adjuntos o comentarios). */
  count?: number;
  icon?: LucideIcon;
  /** Punto amarillo: hay algo que exige atención en esa pestaña. */
  attention?: boolean;
}

/**
 * Pestañas manejadas por la URL (`?tab=`, `?vista=`…): se pueden compartir y
 * sobreviven al recargar. En celular se desplazan de lado; cada una mide 44 px de alto.
 */
export function ViewTabs({ label, tabs, active, className }: { label: string; tabs: ViewTab[]; active: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("-mx-1 mb-5 overflow-x-auto px-1", className)}>
      <ul className="flex w-max min-w-full gap-1 border-b">
        {tabs.map((t) => {
          const isActive = t.key === active;
          const Icon = t.icon;
          return (
            <li key={t.key}>
              <Link
                href={t.href}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative -mb-px flex min-h-11 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm whitespace-nowrap text-soft transition-colors hover:text-ink",
                  isActive && "border-highlight font-semibold text-ink",
                )}
              >
                {Icon ? <Icon aria-hidden className="size-4" /> : null}
                {t.label}
                {t.count ? <span className="rounded-full bg-wash px-1.5 text-[11px] font-semibold tabular-nums">{t.count}</span> : null}
                {t.attention ? (
                  <span className="size-2 rounded-full bg-highlight" aria-label="Tiene algo pendiente" />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
