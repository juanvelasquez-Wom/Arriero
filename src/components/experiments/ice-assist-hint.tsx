"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { iceSuggestionLabel, type IceSuggestion } from "@/domain/ice-assist";
import { cn } from "@/lib/utils";

/**
 * "Arriero sugiere I 7 · C 6 — por qué", con un clic para usar la sugerencia.
 * La calificación manual sigue siendo la que decide.
 */
export function IceAssistHint({
  suggestion,
  onUse,
  disabled,
  className,
}: {
  suggestion: IceSuggestion;
  onUse?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const nothing = suggestion.impact == null && suggestion.confidence == null;
  return (
    <div className={cn("rounded-xl border bg-wash px-3 py-2 text-sm", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Sparkles className="size-4" aria-hidden />
        <span>
          Arriero sugiere <strong className="tabular-nums">{iceSuggestionLabel(suggestion)}</strong>
        </span>
        <span aria-hidden className="text-soft">
          —
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 text-soft underline underline-offset-2 hover:text-ink"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          por qué <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        {onUse ? (
          <Button type="button" size="xs" variant="outline" className="ml-auto" onClick={onUse} disabled={disabled || nothing}>
            Usar sugerencia
          </Button>
        ) : null}
      </div>
      {open ? (
        <div id={panelId} className="mt-2 space-y-1.5 text-xs text-soft">
          <p>
            <span className="font-medium text-ink">Impacto:</span> {suggestion.why.impact}
          </p>
          <div>
            <span className="font-medium text-ink">Confianza:</span>
            <ul className="mt-0.5 list-disc pl-4">
              {suggestion.why.confidence.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
          <p>Es una ayuda: la calificación la pone el equipo y la Facilidad la sabe quien la va a lanzar.</p>
        </div>
      ) : null}
    </div>
  );
}
