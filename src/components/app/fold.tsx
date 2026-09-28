import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Sección plegable (un `<details>` nativo: funciona sin JavaScript y con teclado).
 * Para lo secundario: se ve el título y, si se quiere, se abre.
 */
export function Fold({
  title,
  hint,
  badge,
  open,
  children,
  className,
  bare = false,
}: {
  title: ReactNode;
  /** Texto corto al lado del título (p. ej. "3 pendientes"). */
  hint?: ReactNode;
  badge?: ReactNode;
  open?: boolean;
  children: ReactNode;
  className?: string;
  /** Sin tarjeta: solo el enlace plegable, para meterlo dentro de otra sección. */
  bare?: boolean;
}) {
  return (
    <details open={open} className={cn("group", bare ? "" : "rounded-2xl border bg-paper shadow-card", className)}>
      <summary
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold marker:hidden [&::-webkit-details-marker]:hidden",
          bare ? "py-1 text-soft hover:text-ink" : "px-5 py-3",
        )}
      >
        <ChevronDown aria-hidden className="size-4 shrink-0 transition-transform group-open:rotate-180" />
        <span className="min-w-0 flex-1">
          {title}
          {hint ? <span className="ml-1.5 font-normal text-soft">· {hint}</span> : null}
        </span>
        {badge}
      </summary>
      <div className={bare ? "pt-2" : "border-t px-5 py-4"}>{children}</div>
    </details>
  );
}
