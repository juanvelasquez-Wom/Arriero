"use client";

import { TIA_ENABLED } from "@/domain/tia";
import { RotateCcw, X } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { TiaAvatar, TiaCard, TiaDisclaimer, TiaThinking } from "./tia-ui";

/**
 * Widget reutilizable de "La Tía tiene una recomendación": un botón compacto
 * que, al usarse, abre la tarjeta de La Tía (pensando → resultado o error).
 * El resultado lo pinta `render`, que recibe `close` para cerrar la tarjeta
 * (p. ej. después de "Usar esta"). Nada se guarda solo.
 */
function TiaSuggestInner<T>({
  label,
  title,
  run,
  render,
  disabled,
  disabledReason,
  seed,
  className,
}: {
  /** Texto del botón ("Pídale hipótesis a la Tía"). */
  label: string;
  /** Título de la tarjeta, en la voz de La Tía. */
  title: ReactNode;
  run: () => Promise<ActionResult<T>>;
  render: (data: T, close: () => void) => ReactNode;
  disabled?: boolean;
  /** Por qué el botón está deshabilitado (se muestra como ayuda). */
  disabledReason?: string;
  seed?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function ask() {
    setOpen(true);
    setError(undefined);
    setData(null);
    startTransition(async () => {
      try {
        const r = await run();
        if (r.ok) setData(r.data);
        else setError(r.error);
      } catch {
        setError("La Tía no pudo responder. Intente de nuevo en un momentico.");
      }
    });
  }

  const close = () => {
    setOpen(false);
    setData(null);
    setError(undefined);
  };

  if (!open) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <Button type="button" size="sm" variant="outline" onClick={ask} disabled={disabled} className="gap-1.5">
          <TiaAvatar className="size-5! ring-0!" />
          {label}
        </Button>
        {disabled && disabledReason ? <span className="text-xs text-soft">{disabledReason}</span> : null}
      </div>
    );
  }

  return (
    <TiaCard
      className={className}
      title={
        <span className="flex items-start justify-between gap-2">
          <span>{title}</span>
          <Button type="button" size="icon-xs" variant="ghost" aria-label="Cerrar la recomendación de la Tía" onClick={close}>
            <X aria-hidden />
          </Button>
        </span>
      }
      actions={
        !pending ? (
          <Button type="button" size="sm" variant="ghost" onClick={ask}>
            <RotateCcw aria-hidden /> {error ? "Intentar de nuevo" : "Pedirle otra"}
          </Button>
        ) : null
      }
    >
      <div aria-live="polite" className="space-y-3">
        {pending ? <TiaThinking seed={seed ?? label} /> : null}
        {!pending && error ? <p className="text-sm">{error}</p> : null}
        {!pending && data != null ? render(data, close) : null}
        <TiaDisclaimer />
      </div>
    </TiaCard>
  );
}

/** Se muestra solo si La Tía está prendida (NEXT_PUBLIC_TIA_ENABLED). */
export function TiaSuggest<T>(props: Parameters<typeof TiaSuggestInner<T>>[0]) {
  return TIA_ENABLED ? <TiaSuggestInner<T> {...props} /> : null;
}
