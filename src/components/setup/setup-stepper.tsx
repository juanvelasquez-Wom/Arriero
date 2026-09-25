import { Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const SETUP_STEPS = [
  { n: 1, label: "Datos y horizontes" },
  { n: 2, label: "Líneas de negocio" },
  { n: 3, label: "Calendario" },
  { n: 4, label: "Miembros" },
  { n: 5, label: "Puntaje" },
] as const;

export function SetupStepper({
  current,
  reached,
  baseHref,
}: {
  current: number;
  /** Último paso guardado (setup_step). */
  reached: number;
  /** null cuando el programa aún no existe (paso 1 de creación). */
  baseHref: string | null;
}) {
  return (
    <nav aria-label="Pasos de la configuración" className="mb-6">
      <ol className="flex flex-wrap gap-2">
        {SETUP_STEPS.map((s) => {
          const done = s.n <= reached && s.n !== current;
          const active = s.n === current;
          const reachable = baseHref !== null && s.n <= Math.max(reached + 1, 1);
          const content = (
            <>
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums",
                  active && "border-highlight bg-highlight text-[#1f1f1f]",
                  done && "border-ink bg-ink text-paper",
                )}
              >
                {done ? <Check className="size-3" aria-hidden /> : s.n}
              </span>
              <span>{s.label}</span>
            </>
          );
          const className = cn(
            "inline-flex items-center gap-2 rounded-full border bg-paper px-3 py-1.5 text-sm",
            active && "border-ink font-medium",
            !reachable && !active && "opacity-60",
          );
          return (
            <li key={s.n}>
              {reachable && !active ? (
                <Link href={`${baseHref}?paso=${s.n}`} className={cn(className, "hover:border-ink/40")}>
                  {content}
                </Link>
              ) : (
                <span className={className} aria-current={active ? "step" : undefined}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
