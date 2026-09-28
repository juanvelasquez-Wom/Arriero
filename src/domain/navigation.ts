/**
 * Navegación global: secciones de la barra de arriba y a dónde lleva "Volver"
 * cuando no hay historial dentro de la app (enlace abierto directo, pestaña nueva).
 */

export type AppSection = "inicio" | "programas" | "pilotos" | "tableros" | "direccion" | "recua";

export const APP_SECTIONS: { key: AppSection; href: string; label: string }[] = [
  { key: "inicio", href: "/", label: "Inicio" },
  { key: "programas", href: "/programas", label: "Programas" },
  { key: "pilotos", href: "/pilotos", label: "Pilotos" },
  { key: "tableros", href: "/tableros", label: "Tableros" },
  { key: "direccion", href: "/direccion", label: "Dirección" },
  { key: "recua", href: "/recua", label: "Recua" },
];

/** Sección activa según la ruta. `null` fuera de las cinco (admin, aprender, guía). */
export function sectionOf(pathname: string): AppSection | null {
  const first = pathname.split("/").filter(Boolean)[0];
  if (!first) return "inicio";
  const hit = APP_SECTIONS.find((s) => s.href === `/${first}`);
  return hit?.key ?? null;
}

// Carpetas que no tienen página propia: "Volver" las salta.
const NO_PAGE = new Set(["lineas", "admin"]);
// Rutas que redirigen a su primera pestaña: volver desde ellas es volver al padre.
const REDIRECTS = [/^\/programas\/[^/]+\/tableros$/];

/** Ruta padre de `pathname` (sin query). En "/" devuelve null: no hay a dónde volver. */
export function parentPath(pathname: string): string | null {
  const parts = pathname.split("?")[0].split("/").filter(Boolean);
  if (parts.length === 0) return null;
  let rest = parts.slice(0, -1);
  while (rest.length) {
    const candidate = `/${rest.join("/")}`;
    if (!NO_PAGE.has(rest[rest.length - 1]) && !REDIRECTS.some((r) => r.test(candidate))) return candidate;
    rest = rest.slice(0, -1);
  }
  return "/";
}
