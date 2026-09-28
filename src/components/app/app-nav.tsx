"use client";

import { ArrowLeft, Columns3, Compass, FolderKanban, House, Lightbulb, Megaphone, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { APP_SECTIONS, parentPath, sectionOf, type AppSection } from "@/domain/navigation";
import { cn } from "@/lib/utils";

const ICON: Record<AppSection, LucideIcon> = {
  inicio: House,
  programas: FolderKanban,
  insights: Lightbulb,
  pilotos: Megaphone,
  tableros: Columns3,
  direccion: Compass,
  recua: Trophy,
};

// Cuántas pantallas lleva la persona dentro de la app en esta pestaña. Vive en el
// módulo: sobrevive a la navegación del lado del cliente y se reinicia al recargar.
let visited = 0;
let lastPath: string | null = null;

/** "Volver": atrás en el historial si vino de otra pantalla de la app; si no, a la pantalla padre. */
export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (pathname !== lastPath) {
      visited += 1;
      lastPath = pathname;
    }
  }, [pathname]);

  const parent = parentPath(pathname);
  if (!parent) return null;
  return (
    <button
      type="button"
      onClick={() => (visited > 1 ? router.back() : router.push(parent))}
      aria-label="Volver"
      title="Volver"
      className="group inline-flex size-9 shrink-0 items-center justify-center rounded-full border bg-paper text-ink transition-colors hover:bg-wash"
    >
      <ArrowLeft aria-hidden className="size-4 transition-transform group-hover:-translate-x-0.5" />
    </button>
  );
}

function useActive() {
  return sectionOf(usePathname());
}

/** Secciones principales en escritorio: una sola fila de pastillas. */
export function TopSections({ showPilots }: { showPilots: boolean }) {
  const active = useActive();
  return (
    <nav aria-label="Secciones" className="hidden items-center gap-0.5 rounded-full border bg-wash/70 p-0.5 md:flex">
      {APP_SECTIONS.filter((s) => showPilots || s.key !== "pilotos").map((s) => {
        const Icon = ICON[s.key];
        const on = s.key === active;
        return (
          <Link
            key={s.key}
            href={s.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-soft transition-colors hover:text-ink",
              on && "bg-highlight font-semibold text-[#111111] hover:text-[#111111]",
            )}
          >
            <Icon aria-hidden className="size-4" />
            <span className="hidden xl:inline">{s.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** En el celular, las secciones van abajo, al alcance del pulgar. */
export function BottomSections({ showPilots }: { showPilots: boolean }) {
  const active = useActive();
  const items = APP_SECTIONS.filter((s) => showPilots || s.key !== "pilotos");
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-paper/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md md:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((s) => {
          const Icon = ICON[s.key];
          const on = s.key === active;
          return (
            <li key={s.key}>
              <Link
                href={s.href}
                aria-current={on ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px] text-soft", on && "font-semibold text-ink")}
              >
                <span className={cn("flex h-7 w-10 items-center justify-center rounded-full transition-colors", on && "bg-highlight text-[#111111]")}>
                  <Icon aria-hidden className="size-[18px]" />
                </span>
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
