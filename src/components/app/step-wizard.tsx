"use client";

// Armazón genérico de los asistentes paso a paso (programa y pilotos): barra de
// avance con la mula caminando, transición entre pantallas, pie con Atrás /
// Siga y Enter para avanzar. Solo presenta: qué se valida y qué se guarda lo
// decide cada asistente.
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Mule } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type StepDirection = 1 | -1;

/** Índice de pantalla + dirección del último movimiento (para la animación). */
export function useStepper<K extends string>(keys: readonly K[], initial: K | number = 0) {
  const start = typeof initial === "number" ? initial : Math.max(0, keys.indexOf(initial));
  const [state, setState] = useState<{ index: number; direction: StepDirection }>({ index: start, direction: 1 });
  const index = Math.min(state.index, keys.length - 1);
  const goTo = useCallback(
    (target: K | number) => {
      const i = typeof target === "number" ? target : keys.indexOf(target);
      if (i < 0 || i >= keys.length) return;
      setState((s) => ({ index: i, direction: i >= s.index ? 1 : -1 }));
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [keys],
  );
  return {
    index,
    key: keys[index],
    direction: state.direction,
    count: keys.length,
    isFirst: index === 0,
    isLast: index === keys.length - 1,
    next: () => goTo(index + 1),
    back: () => goTo(index - 1),
    goTo,
  };
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Barra de avance con la mula encima. `value` va de 0 a 1. La mula da unos
 * pasos cada vez que el valor cambia (y se queda quieta con "reducir movimiento").
 */
export function WizardProgress({ value, label, detail, className }: { value: number; label: ReactNode; detail?: ReactNode; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
        <span className="font-semibold text-ink">{label}</span>
        {detail ? <span className="text-soft">{detail}</span> : null}
      </div>
      <div className="relative pt-7">
        <span aria-hidden className="absolute top-0 -translate-x-1/2 transition-[left] duration-700 ease-out motion-reduce:transition-none" style={{ left: `${Math.min(97, Math.max(3, pct))}%` }}>
          <span key={pct} className="mule-walk block" style={{ animationIterationCount: 2 }}>
            <Mule className="w-7" />
          </span>
        </span>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-gray-1"
          role="progressbar"
          aria-label="Avance del asistente"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-highlight transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${Math.max(pct, 2)}%` }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Pantalla del asistente: entra deslizándose desde el lado hacia el que se
 * avanza y, al cambiar, deja el foco en el primer campo marcado con
 * `data-autofocus` (o en el título) para seguir con el teclado.
 */
export function WizardStage({
  stepKey,
  direction,
  eyebrow,
  title,
  subtitle,
  children,
  className,
}: {
  stepKey: string;
  direction: StepDirection;
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!reducedMotion() && typeof el.animate === "function") {
      el.animate(
        [
          { opacity: 0, transform: `translateX(${direction * 24}px)` },
          { opacity: 1, transform: "none" },
        ],
        { duration: 320, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
    }
    // En la primera pantalla manda el autoFocus de la página; después, el foco sigue al paso.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const target = el.querySelector<HTMLElement>("[data-autofocus]");
    (target ?? titleRef.current)?.focus({ preventScroll: true });
  }, [stepKey, direction]);

  return (
    <div ref={ref} className={cn("min-w-0", className)}>
      <header className="mb-5">
        {eyebrow ? <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-soft">{eyebrow}</div> : null}
        <h2 ref={titleRef} tabIndex={-1} className="font-heading text-2xl font-extrabold tracking-tight outline-none sm:text-3xl">
          {title}
        </h2>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-[15px] text-soft">{subtitle}</p> : null}
      </header>
      {children}
    </div>
  );
}

/** Puntos de las pantallas de un paso (● ● ○), para ubicarse sin leer. */
export function WizardDots({ count, index, onPick, labels }: { count: number; index: number; onPick?: (i: number) => void; labels?: string[] }) {
  if (count < 2) return null;
  return (
    <ol className="flex items-center gap-1.5" aria-label="Pantallas de este paso">
      {Array.from({ length: count }, (_, i) => {
        const cls = cn("block h-2 rounded-full transition-all duration-300", i === index ? "w-6 bg-ink" : i < index ? "w-2 bg-gray-4" : "w-2 bg-gray-2");
        const label = `${labels?.[i] ?? `Pantalla ${i + 1}`}${i === index ? " (actual)" : ""}`;
        return (
          <li key={i}>
            {onPick && i < index ? (
              <button type="button" className="flex min-h-6 items-center" onClick={() => onPick(i)} aria-label={`Volver a ${labels?.[i] ?? `la pantalla ${i + 1}`}`}>
                <span className={cls} />
              </button>
            ) : (
              <span className="flex min-h-6 items-center" aria-label={label} aria-current={i === index ? "step" : undefined}>
                <span className={cls} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Pie del asistente: "Atrás" (botón o enlace) a la izquierda y la acción
 * principal a la derecha, que es `submit`: Enter en un campo también avanza.
 */
export function WizardFooter({
  onBack,
  backHref,
  backLabel = "Atrás",
  nextLabel = "Siga",
  nextIcon,
  pending,
  disabled,
  extra,
  hint = true,
}: {
  onBack?: () => void;
  backHref?: string | null;
  backLabel?: string;
  nextLabel?: ReactNode;
  nextIcon?: ReactNode;
  pending?: boolean;
  disabled?: boolean;
  /** Acciones secundarias (p. ej. "Guardar borrador"), antes de la principal. */
  extra?: ReactNode;
  /** Muestra "o presione Enter" junto a la acción principal. */
  hint?: boolean;
}) {
  const backCls = "inline-flex min-h-11 items-center gap-1 self-start text-sm text-soft underline-offset-4 hover:text-ink hover:underline";
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      {onBack ? (
        <button type="button" onClick={onBack} className={backCls} disabled={pending}>
          <ArrowLeft className="size-4" aria-hidden /> {backLabel}
        </button>
      ) : backHref ? (
        <Link href={backHref} className={backCls}>
          <ArrowLeft className="size-4" aria-hidden /> {backLabel}
        </Link>
      ) : (
        <span />
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        {hint ? (
          <span className="hidden text-xs text-soft lg:inline" aria-hidden>
            o presione <kbd className="rounded border bg-wash px-1.5 py-0.5 font-sans text-[11px]">Enter</kbd>
          </span>
        ) : null}
        {extra}
        <Button type="submit" size="lg" className="group min-h-11 w-full sm:w-auto" disabled={pending || disabled}>
          {pending ? <Spinner /> : null}
          {nextLabel}
          {pending ? null : (nextIcon ?? <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden />)}
        </Button>
      </div>
    </div>
  );
}

/**
 * Enter avanza desde los campos de una línea y desde las tarjetas de elección
 * (checkbox, radio). En un área de texto, Enter sigue siendo salto de línea.
 */
export function advanceOnEnter(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.nativeEvent.isComposing) return;
  const t = e.target as HTMLElement;
  // Lo que viene de un portal (buscadores de menús y diálogos) no avanza el asistente.
  if (!e.currentTarget.contains(t)) return;
  // Tarjetas de elección: el navegador no envía el formulario con Enter en ellas
  // (y Radix marca el Enter como manejado en sus radios).
  const choice = t.matches("input[type=checkbox], input[type=radio], [role=radio], [role=checkbox], [role=switch]");
  // Campos de una línea (texto, número, fecha): se envía aquí mismo para que
  // funcione igual en todos los navegadores. Si el campo ya usó el Enter (p. ej.
  // agregar una ciudad), no se avanza.
  const field = t.matches("input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file])") && !e.defaultPrevented;
  if (choice || field) {
    e.preventDefault();
    e.currentTarget.requestSubmit();
  }
}

/** `onSubmit` que nunca recarga la página. */
export const onWizardSubmit = (fn: () => void) => (e: FormEvent) => {
  e.preventDefault();
  fn();
};

/** Tarjeta grande de elección (sí/no, plantillas, duración). */
export function ChoiceCard({
  active,
  children,
  className,
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "lift flex h-full cursor-pointer flex-col rounded-2xl border bg-paper p-4 text-left text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink",
        active ? "border-ink bg-wash ring-1 ring-ink" : "hover:bg-wash",
        className,
      )}
    >
      {children}
    </span>
  );
}
