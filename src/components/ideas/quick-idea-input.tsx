"use client";

import { CloudRain, EyeOff, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IDEA_EXAMPLES, IDEA_TITLE_MAX, IDEA_TITLE_MIN } from "@/domain/ideas";
import { cn } from "@/lib/utils";
import { addIdea } from "@/server/actions/ideas";

/** Lo que dice la mula según la racha de ideas seguidas. */
function burstLine(n: number) {
  if (n >= 10) return `${n} seguidas. Esto ya no es aguacero, es el diluvio. Noé le manda saludos.`;
  if (n >= 5) return `${n} seguidas. ¡Está diluviando!`;
  if (n >= 2) return `${n} seguidas. Siga, que va lloviendo.`;
  return "Enter para anotar y seguir con la otra. Sin filtro: la votación viene después.";
}

/**
 * Captura en cinco segundos: se escribe, Enter, y el campo queda listo para la
 * siguiente. «Anónima» solo cambia cómo se muestra; el autor queda guardado.
 */
export function QuickIdeaInput({ sessionId, exampleKey = 0 }: { sessionId: string; exampleKey?: number }) {
  const router = useRouter();
  const ids = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [burst, setBurst] = useState(0);
  const [error, setError] = useState<string>();
  const [, start] = useTransition();
  const example = IDEA_EXAMPLES[Math.abs(exampleKey) % IDEA_EXAMPLES.length];

  function submit() {
    const text = title.trim();
    // Sin esperar a la anterior: en un aguacero las gotas no hacen fila.
    if (text.length < IDEA_TITLE_MIN) return;
    setError(undefined);
    setTitle("");
    start(async () => {
      const r = await addIdea(sessionId, { title: text, anonymous });
      if (!r.ok) {
        setTitle((cur) => cur || text);
        setError(r.fieldErrors ? (Object.values(r.fieldErrors)[0]?.[0] ?? r.error) : r.error);
        return;
      }
      setBurst((b) => b + 1);
      toast.success(r.message, { duration: 1800 });
      router.refresh();
      ref.current?.focus();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-2"
    >
      <label htmlFor={`${ids}-idea`} className="flex items-center gap-1.5 text-sm font-semibold">
        <CloudRain aria-hidden className="size-4" /> Suelte la idea
      </label>
      <div className="flex gap-2">
        <Input
          ref={ref}
          id={`${ids}-idea`}
          value={title}
          maxLength={IDEA_TITLE_MAX}
          autoFocus
          autoComplete="off"
          enterKeyHint="send"
          placeholder={`Ej.: ${example}`}
          onChange={(e) => setTitle(e.target.value)}
          className="h-12 min-w-0 flex-1 text-base"
        />
        <Button type="submit" size="lg" disabled={title.trim().length < IDEA_TITLE_MIN} className="h-12 shrink-0" aria-label="Anotar la idea">
          <Plus aria-hidden className="size-4" />
          <span className="hidden sm:inline">Anotar</span>
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-soft" aria-live="polite">
          {burstLine(burst)}
        </p>
        <button
          type="button"
          aria-pressed={anonymous}
          onClick={() => {
            setAnonymous((a) => !a);
            ref.current?.focus();
          }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            anonymous ? "border-transparent bg-ink text-paper" : "text-soft hover:bg-wash hover:text-ink",
          )}
          title="Los demás verán «Un arriero tímido». Usted y la base sí saben que fue usted."
        >
          <EyeOff aria-hidden className="size-3.5" />
          {anonymous ? "En anónimo" : "Anotar en anónimo"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl bg-wash px-3 py-2 text-sm font-medium">
          {error}
        </p>
      ) : null}
    </form>
  );
}
