"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { iceSuggestionLabel, type IceSuggestion } from "@/domain/ice-assist";
import { updateIce } from "@/server/actions/experiments";
import { IceAssistHint } from "./ice-assist-hint";

type Key = "impact" | "confidence" | "ease";
const LABEL: Record<Key, string> = { impact: "Impacto", confidence: "Confianza", ease: "Facilidad" };

/** Edición rápida de ICE en el backlog: guarda al salir del campo. */
export function QuickIce({
  programId,
  experimentId,
  title,
  values,
  suggestion,
}: {
  programId: string;
  experimentId: string;
  title: string;
  values: Record<Key, number | null>;
  /** Sugerencia de Arriero (Impacto y Confianza); la calificación manual es la que cuenta. */
  suggestion?: IceSuggestion | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<Key, string>>({
    impact: values.impact?.toString() ?? "",
    confidence: values.confidence?.toString() ?? "",
    ease: values.ease?.toString() ?? "",
  });
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function commit(next: Record<Key, string> = draft) {
    const parsed = Object.fromEntries(
      (Object.keys(next) as Key[]).map((k) => [k, next[k].trim() === "" ? null : Number(next[k])]),
    ) as Record<Key, number | null>;
    const changed = (Object.keys(parsed) as Key[]).some((k) => parsed[k] !== values[k]);
    if (!changed) return;
    if ((Object.values(parsed) as (number | null)[]).some((n) => n != null && (!Number.isInteger(n) || n < 1 || n > 10))) {
      toast.error("Las calificaciones ICE van de 1 a 10. Ni más, ni menos.");
      return;
    }
    startTransition(async () => {
      const r = await updateIce(programId, experimentId, parsed);
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  }

  function applySuggestion() {
    if (!suggestion) return;
    const next = {
      ...draft,
      impact: suggestion.impact != null ? String(suggestion.impact) : draft.impact,
      confidence: suggestion.confidence != null ? String(suggestion.confidence) : draft.confidence,
    };
    setDraft(next);
    setOpen(false);
    commit(next);
  }

  const hasSuggestion = !!suggestion && (suggestion.impact != null || suggestion.confidence != null);

  return (
    <div className="flex items-center gap-1">
      {(Object.keys(LABEL) as Key[]).map((k) => (
        <input
          key={k}
          type="number"
          min={1}
          max={10}
          inputMode="numeric"
          aria-label={`${LABEL[k]} de ${title}`}
          title={`${LABEL[k]} (1 a 10)`}
          placeholder={LABEL[k][0]}
          value={draft[k]}
          onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
          onBlur={() => commit()}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-7 w-11 rounded-md border bg-paper px-1 text-center text-sm tabular-nums"
        />
      ))}
      {hasSuggestion ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-soft hover:bg-wash hover:text-ink"
              aria-label={`Arriero sugiere ${iceSuggestionLabel(suggestion!)} para ${title}`}
            >
              <Sparkles className="size-3.5" aria-hidden />
              <span className="tabular-nums">{iceSuggestionLabel(suggestion!)}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <IceAssistHint suggestion={suggestion!} onUse={applySuggestion} disabled={pending} className="border-0" />
          </PopoverContent>
        </Popover>
      ) : null}
      {pending ? <Spinner className="size-3.5" /> : null}
    </div>
  );
}
