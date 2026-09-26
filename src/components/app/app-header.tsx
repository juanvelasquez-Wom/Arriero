import { LogOut, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { LogoLockup } from "@/components/brand/logo";
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
import { ThemeToggle } from "./theme-toggle";

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

export function AppHeader({ user, children }: { user: SessionUser; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-paper/85 backdrop-blur-md supports-[backdrop-filter]:bg-paper/70">
      <div className="flex h-14 items-center gap-3 px-4">
        <Link href="/programas" aria-label="Arriero, ir a Mis programas" className="rounded-md transition-opacity hover:opacity-80">
          <LogoLockup />
        </Link>
        <div className="min-w-0 flex-1">{children}</div>
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
    </header>
  );
}
