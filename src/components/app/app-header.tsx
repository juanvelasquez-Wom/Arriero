import { BookOpen, Bug, GraduationCap, LogOut, ShieldCheck, Users } from "lucide-react";
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
import { getPilotContext } from "@/server/pilot-auth";
import { QuickInsightButton } from "@/components/insights/quick-insight";
import { BackButton, BottomSections, TopSections } from "./app-nav";
import { CommandSearch } from "./command-search";
import { ExplanationsMenuItem } from "./explanations-toggle";
import { NotificationsBell } from "./notifications-bell";
import { ThemeMenuItem } from "./theme-toggle";
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
 * Encabezado global, una sola fila: volver · logo · secciones · buscar · avisos · usuario.
 * `nav` = botón del menú del programa (móvil); `children` = contexto (programa,
 * piloto), en una segunda fila delgada. En el celular las secciones van abajo.
 */
export async function AppHeader({
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
  const pilots = await getPilotContext().catch(() => null);
  const showPilots = !!pilots?.actor.role;
  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-paper/85 backdrop-blur-md supports-[backdrop-filter]:bg-paper/70">
        <div className="flex h-14 items-center gap-2 px-4 sm:gap-3">
          <BackButton />
          <Link href="/" aria-label="Arriero, ir al inicio" className="shrink-0 rounded-md transition-opacity hover:opacity-80">
            {/* Con ocho secciones en la barra, el logo completo solo cabe en pantallas muy anchas. */}
            <Mule className="size-8 w-8 2xl:hidden" />
            <LogoLockup className="hidden 2xl:flex" />
          </Link>
          {nav}
          <div className="flex min-w-0 flex-1 justify-center">
            <TopSections showPilots={showPilots} />
          </div>
          <CommandSearch programId={programId} canCreateExperiment={canCreateExperiment} />
          <QuickInsightButton />
          <NotificationsBell userId={user.id} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 rounded-full px-1" aria-label="Menú de usuario">
                <span className="flex size-7 items-center justify-center rounded-full bg-highlight text-[11px] font-bold text-[#111111] ring-2 ring-paper">
                  {initials(user.name || user.email)}
                </span>
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
              <ThemeMenuItem />
              <ExplanationsMenuItem />
              <WeeklyDigestMenuItem userId={user.id} />
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/guia">
                  <BookOpen className="size-4" aria-hidden /> Cómo se usa el Arriero
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/aprender">
                  <GraduationCap className="size-4" aria-hidden /> Aprender growth
                </Link>
              </DropdownMenuItem>
              {user.isAdmin ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/admin/usuarios">
                      <Users className="size-4" aria-hidden /> Usuarios
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/errores">
                      <Bug className="size-4" aria-hidden /> Errores del sistema
                    </Link>
                  </DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuSeparator />
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
        {children ? <div className="flex min-h-9 items-center border-t px-4 py-1">{children}</div> : null}
      </header>
      <BottomSections showPilots={showPilots} />
    </>
  );
}
