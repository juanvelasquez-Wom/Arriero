"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/** Versión para el menú de usuario: la barra de arriba queda más limpia. */
export function ThemeMenuItem() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setTheme(dark ? "light" : "dark"); }}>
      <Sun className="hidden size-4 dark:block" aria-hidden />
      <Moon className="size-4 dark:hidden" aria-hidden />
      <span className="dark:hidden">Modo oscuro</span>
      <span className="hidden dark:inline">Modo claro</span>
    </DropdownMenuItem>
  );
}
