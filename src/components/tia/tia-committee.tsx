"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { CopySummaryButton } from "@/components/app/report-actions";
import { Button } from "@/components/ui/button";
import { TIA_LINES } from "@/domain/tia";
import { prepareCommittee } from "@/server/actions/tia-insights";
import { TiaAvatar, TiaCard, TiaDisclaimer, TiaText, TiaThinking } from "./tia-ui";

type State = { kind: "idle" } | { kind: "error"; message: string } | { kind: "done"; text: string };

/** Quita el formato mínimo (negritas y viñetas) para copiar texto limpio al correo o al chat. */
function plain(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/^#+\s*/gm, "");
}

/** "La Tía le prepara el comité": narrativa lista para leer, desde el resumen ejecutivo. */
export function TiaCommittee({ briefText, configured }: { briefText: string; configured: boolean }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  function ask() {
    startTransition(async () => {
      const r = await prepareCommittee(briefText);
      setState(r.ok ? { kind: "done", text: r.data } : { kind: "error", message: r.error });
    });
  }

  if (!configured) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed px-4 py-3 text-sm text-soft">
        <TiaAvatar className="size-7 opacity-60" />
        {TIA_LINES.notConfigured}
      </div>
    );
  }

  if (pending) {
    return (
      <div className="rounded-2xl border border-highlight/60 bg-highlight/10 px-4 py-3">
        <TiaThinking seed="comite" />
      </div>
    );
  }

  if (state.kind === "done") {
    return (
      <div className="space-y-1.5">
        <TiaCard
          title="La Tía le prepara el comité"
          actions={
            <>
              <CopySummaryButton text={plain(state.text)} />
              <Button type="button" variant="ghost" onClick={ask}>
                <RefreshCw aria-hidden /> Otra versión
              </Button>
            </>
          }
        >
          <TiaText text={state.text} />
        </TiaCard>
        <TiaDisclaimer />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-highlight/60 bg-highlight/10 px-4 py-3">
      <TiaAvatar />
      <div className="min-w-0 flex-1 text-sm">
        <p>¿Tiene comité? La Tía le arma la narrativa con este resumen, lista para leer en voz alta.</p>
        {state.kind === "error" ? <p className="mt-1 text-xs text-soft">{state.message}</p> : null}
      </div>
      <Button type="button" onClick={ask}>
        La Tía le prepara el comité
      </Button>
    </div>
  );
}
