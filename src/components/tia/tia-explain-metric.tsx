"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { TIA_LINES } from "@/domain/tia";
import { cn } from "@/lib/utils";
import { explainMetric } from "@/server/actions/tia-insights";
import { TiaAvatar, TiaCard, TiaDisclaimer, TiaText, TiaThinking } from "./tia-ui";

type State = { kind: "idle" } | { kind: "error"; message: string } | { kind: "done"; text: string };

/**
 * "La Tía le explica los números": por qué se movió la métrica en las últimas
 * semanas y un siguiente paso. Bajo demanda. `configured` es opcional: si no se
 * conoce (p. ej. dentro de un componente de cliente), la acción responde con el
 * aviso de que La Tía no está conectada.
 */
export function TiaExplainMetric({
  programId,
  metricId,
  configured,
  className,
}: {
  programId: string;
  metricId: string;
  configured?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  function ask() {
    startTransition(async () => {
      const r = await explainMetric(programId, metricId);
      setState(r.ok ? { kind: "done", text: r.data } : { kind: "error", message: r.error });
    });
  }

  if (configured === false) {
    return (
      <p className={cn("flex items-center gap-2 text-xs text-soft", className)}>
        <TiaAvatar className="size-6 opacity-60" />
        {TIA_LINES.notConfigured}
      </p>
    );
  }

  if (pending) {
    return (
      <div className={cn("rounded-2xl border border-highlight/60 bg-highlight/10 px-4 py-3", className)}>
        <TiaThinking seed={metricId} />
      </div>
    );
  }

  if (state.kind === "done") {
    return (
      <div className={cn("space-y-1.5", className)}>
        <TiaCard
          title="La Tía le explica los números"
          actions={
            <Button type="button" variant="ghost" size="sm" onClick={ask}>
              <RefreshCw aria-hidden /> Explicar otra vez
            </Button>
          }
        >
          <TiaText text={state.text} />
        </TiaCard>
        <TiaDisclaimer />
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Button type="button" variant="outline" size="sm" onClick={ask}>
        <TiaAvatar className="size-5 ring-0" /> La Tía le explica los números
      </Button>
      {state.kind === "error" ? <p className="text-xs text-soft">{state.message}</p> : null}
    </div>
  );
}
