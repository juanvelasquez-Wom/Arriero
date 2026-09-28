import { Compass, LogOut, Megaphone, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { LogoLockup, Mule } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/server/actions/auth";
import type { SessionUser } from "@/server/auth";
import { CommandSearch } from "./command-search";
import { ExplanationsMenuItem } from "./explanations-toggle";
import { NotificationsBell } from "./notifications-bell";
import { ThemeToggle } from "./theme-toggle";
import { WeeklyDigestMenuItem } from "./weekly-digest-menu-item";

function initials(name: string) {
  return (
    name
      .split(/\s+|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

/**
 * Encabezado global. `nav` = botón del menú móvil; `children` = contexto
 * (programa, insignias). En pantallas pequeñas el contexto baja a una segunda
 * fila para que no aprete la búsqueda, el tema ni el avatar.
 */
export function AppHeader({
  user,
  nav,
  programId,
  canCreateExperiment,
  children,
}: {
  user: SessionUser;
  nav?: React.ReactNode;
  programId?: string;
  canCreateExperiment?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-paper/85 backdrop-blur-md supports-[backdrop-filter]:bg-paper/70">
      <div className="flex h-14 items-center gap-2 px-4 sm:gap-3">
        <Link href="/programas" aria-label="Arriero, ir a Mis programas" className="shrink-0 rounded-md transition-opacity hover:opacity-80">
          <Mule className="size-8 w-8 sm:hidden" />
          <LogoLockup className="hidden sm:flex" />
        </Link>
        {nav}
        <div className="hidden min-w-0 flex-1 sm:block">{children}</div>
        <div className="flex-1 sm:hidden" />
        <CommandSearch programId={programId} canCreateExperiment={canCreateExperiment} />
        <Button asChild variant="ghost" size="sm" className="gap-1.5 px-2 sm:px-2.5">
          <Link href="/pilotos" aria-label="Pilotos de medios">
            <Megaphone className="size-4" aria-hidden />
            <span className="hidden lg:inline">Pilotos</span>
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="gap-1.5 px-2 sm:px-2.5">
          <Link href="/direccion" aria-label="Resumen ejecutivo">
            <Compass className="size-4" aria-hidden />
            <span className="hidden lg:inline">Resumen ejecutivo</span>
          </Link>
        </Button>
        <NotificationsBell userId={user.id} />
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2" aria-label="Menú de usuario">
              <span className="flex size-7 items-center justify-center rounded-full bg-highlight text-[11px] font-bold text-[#111111] ring-2 ring-paper">
                {initials(user.name || user.email)}
              </span>
              <span className="hidden max-w-40 truncate text-sm sm:inline">{user.name || user.email}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="truncate text-xs text-soft">{user.email}</div>
              {user.isAdmin ? (
                <div className="mt-1 inline-flex items-center gap-1 text-xs">
                  <ShieldCheck className="size-3.5" aria-hidden /> Admin global
                </div>
              ) : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/direccion">
                <Compass className="size-4" aria-hidden /> Vista de dirección
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/pilotos">
                <Megaphone className="size-4" aria-hidden /> Pilotos de medios
              </Link>
            </DropdownMenuItem>
            <ExplanationsMenuItem />
            <WeeklyDigestMenuItem userId={user.id} />
            <DropdownMenuSeparator />
            {user.isAdmin ? (
              <>
                <DropdownMenuItem asChild>
                  <Link href="/admin/usuarios">
                    <Users className="size-4" aria-hidden /> Usuarios
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <form action={signOut}>
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full">
                  <LogOut className="size-4" aria-hidden /> Cerrar sesión
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {children ? <div className="flex min-h-9 items-center border-t px-4 py-1 sm:hidden">{children}</div> : null}
    </header>
  );
}
