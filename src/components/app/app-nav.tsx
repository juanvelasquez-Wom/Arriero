"use client";

import { ArrowLeft, CloudRain, Columns3, Compass, Ellipsis, FolderKanban, House, Lightbulb, Megaphone, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { APP_SECTIONS, parentPath, sectionOf, type AppSection } from "@/domain/navigation";
import { cn } from "@/lib/utils";

const ICON: Record<AppSection, LucideIcon> = {
  inicio: House,
  programas: FolderKanban,
  insights: Lightbulb,
  ideas: CloudRain,
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

// En el celular solo caen cuatro abajo; el resto va en «Más».
const BOTTOM_MAIN: AppSection[] = ["inicio", "programas", "insights", "ideas"];

/** En el celular, las secciones van abajo, al alcance del pulgar: cuatro fijas y «Más». */
export function BottomSections({ showPilots }: { showPilots: boolean }) {
  const active = useActive();
  const [open, setOpen] = useState(false);
  const all = APP_SECTIONS.filter((s) => showPilots || s.key !== "pilotos");
  const main = all.filter((s) => BOTTOM_MAIN.includes(s.key));
  const more = all.filter((s) => !BOTTOM_MAIN.includes(s.key));
  const moreActive = more.some((s) => s.key === active);
  const tab = (on: boolean) => cn("flex w-full flex-col items-center gap-0.5 py-2 text-[11px] text-soft", on && "font-semibold text-ink");
  const pill = (on: boolean) => cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", on && "bg-highlight text-[#111111]");
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-paper/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md md:hidden"
    >
      <ul className="grid grid-cols-5">
        {main.map((s) => {
          const Icon = ICON[s.key];
          const on = s.key === active;
          return (
            <li key={s.key} className="min-w-0">
              <Link href={s.href} aria-current={on ? "page" : undefined} className={tab(on)}>
                <span className={pill(on)}>
                  <Icon aria-hidden className="size-[18px]" />
                </span>
                {s.label}
              </Link>
            </li>
          );
        })}
        <li className="min-w-0">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button type="button" className={tab(moreActive)} aria-label="Más secciones">
                <span className={pill(moreActive)}>
                  <Ellipsis aria-hidden className="size-[18px]" />
                </span>
                Más
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl bg-paper px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
              <SheetHeader className="p-0 pb-2">
                <SheetTitle>Más secciones</SheetTitle>
              </SheetHeader>
              <ul className="grid grid-cols-2 gap-2">
                {more.map((s) => {
                  const Icon = ICON[s.key];
                  const on = s.key === active;
                  return (
                    <li key={s.key}>
                      <Link
                        href={s.href}
                        onClick={() => setOpen(false)}
                        aria-current={on ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium",
                          on ? "border-transparent bg-highlight text-[#111111]" : "hover:bg-wash",
                        )}
                      >
                        <Icon aria-hidden className="size-5" /> {s.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
