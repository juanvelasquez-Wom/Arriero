"use client";

import { BookOpen, CalendarRange, LayoutGrid, Library, Megaphone, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS: { href: string; label: string; icon: LucideIcon; approverOnly?: boolean }[] = [
  { href: "/pilotos", label: "Portafolio", icon: LayoutGrid },
  { href: "/pilotos/calendario", label: "Calendario", icon: CalendarRange },
  { href: "/pilotos/campanas", label: "Campañas", icon: Megaphone },
  { href: "/pilotos/aprendizajes", label: "Aprendizajes", icon: BookOpen },
  { href: "/pilotos/catalogos", label: "Catálogos", icon: Library },
  { href: "/pilotos/roles", label: "Roles", icon: ShieldCheck, approverOnly: true },
];

/** Pestañas del módulo de pilotos. El detalle de un piloto marca "Portafolio". */
export function PilotsNav({ isApprover }: { isApprover: boolean }) {
  const pathname = usePathname();
  const activeHref =
    ITEMS.slice(1).find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))?.href ?? (pathname.startsWith("/pilotos") ? "/pilotos" : "");
  return (
    <nav aria-label="Secciones de pilotos" className="-mx-1 mb-6 overflow-x-auto px-1">
      <ul className="flex w-max gap-1 border-b">
        {ITEMS.filter((i) => !i.approverOnly || isApprover).map(({ href, label, icon: Icon }) => {
          const isActive = href === activeHref;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group relative -mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-soft transition-colors hover:text-ink",
                  isActive && "border-highlight font-semibold text-ink",
                )}
              >
                <Icon aria-hidden className="wiggle-on-hover size-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
