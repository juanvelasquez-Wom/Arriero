"use client";

import {
  BookOpenCheck,
  CalendarRange,
  ChartColumn,
  ClipboardList,
  Columns3,
  Grid3x3,
  LayoutDashboard,
  ListOrdered,
  Settings2,
  Trash2,
  Waypoints,
  CalendarPlus,
  Menu,
  FileText,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SLOGAN } from "@/components/brand/phrases";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export interface ProgramNavProps {
  programId: string;
  lines: { id: string; name: string }[];
  showTrash: boolean;
  showSettings: boolean;
}

function useGroups({ programId, lines, showTrash, showSettings }: ProgramNavProps) {
  const base = `/programas/${programId}`;
  const groups: { title?: string; items: NavItem[] }[] = [
    {
      items: [
        { href: base, label: "Resumen", icon: LayoutDashboard, exact: true },
        { href: `${base}/informe`, label: "Informe para el comité", icon: FileText },
        ...(showSettings ? [{ href: `${base}/configuracion`, label: "Configuración", icon: Settings2 }] : []),
      ],
    },
    {
      title: "Líneas",
      items: lines.map((l) => ({ href: `${base}/lineas/${l.id}`, label: l.name, icon: Waypoints })),
    },
    {
      title: "Operación",
      items: [
        { href: `${base}/carga`, label: "Carga semanal", icon: CalendarPlus },
        { href: `${base}/problemas`, label: "Problemas", icon: ClipboardList },
        { href: `${base}/ejercicios`, label: "Backlog de ejercicios", icon: ListOrdered },
        { href: `${base}/aprendizajes`, label: "Aprendizajes", icon: BookOpenCheck },
        { href: `${base}/equipo`, label: "Equipo y carga", icon: UsersRound },
      ],
    },
    {
      title: "Tableros",
      items: [
        { href: `${base}/tableros/gantt`, label: "Gantt", icon: CalendarRange },
        { href: `${base}/tableros/kanban`, label: "Kanban", icon: Columns3 },
        { href: `${base}/tableros/resultados`, label: "Resultados", icon: ChartColumn },
        { href: `${base}/tableros/portafolio`, label: "Portafolio y velocidad", icon: Grid3x3 },
      ],
    },
  ];
  if (showTrash) groups.push({ items: [{ href: `${base}/papelera`, label: "Papelera", icon: Trash2 }] });
  return groups;
}

function NavList(props: ProgramNavProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = useGroups(props);
  return (
    <nav aria-label="Navegación del programa" className="flex flex-col gap-4 text-sm">
      {groups.map((g, i) => (
        <div key={g.title ?? i}>
          {g.title ? <div className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft">{g.title}</div> : null}
          {g.title === "Líneas" && g.items.length === 0 ? (
            <p className="px-2.5 text-xs text-soft">Sin líneas todavía.</p>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => {
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={props.onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-ink/80 transition-colors hover:bg-wash hover:text-ink",
                      active && "bg-highlight font-semibold text-[#111111] hover:bg-highlight hover:text-[#111111]",
                    )}
                  >
                    <Icon aria-hidden className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function ProgramSidebar(props: ProgramNavProps) {
  return (
    <aside className="hidden w-64 shrink-0 border-r bg-paper px-3 py-5 lg:block">
      <div className="sticky top-20 flex max-h-[calc(100vh-6rem)] flex-col gap-6 overflow-y-auto">
        <NavList {...props} />
        <p className="mt-auto px-2.5 font-heading text-xs font-semibold text-soft">{SLOGAN}</p>
      </div>
    </aside>
  );
}

export function ProgramMobileNav(props: ProgramNavProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Abrir navegación">
          <Menu aria-hidden className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 overflow-y-auto bg-paper p-4">
        <SheetHeader className="p-0 pb-3">
          <SheetTitle>Programa</SheetTitle>
        </SheetHeader>
        <NavList {...props} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
