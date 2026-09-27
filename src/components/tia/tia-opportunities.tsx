"use client";

import { TIA_ENABLED } from "@/domain/tia";
import { FilePlus2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { IMPACT_LABEL } from "@/domain/labels";
import { TIA_LINES } from "@/domain/tia";
import { detectOpportunities, type OpportunityCard } from "@/server/actions/tia-insights";
import { TiaAvatar, TiaCard, TiaDisclaimer, TiaText, TiaThinking } from "./tia-ui";

type State = { kind: "idle" } | { kind: "error"; message: string } | { kind: "done"; items: OpportunityCard[]; text: string | null };

/** "La Tía detectó una oportunidad": bajo demanda, para no gastar consultas en cada visita. */
function TiaOpportunitiesInner({ programId, configured, canCreateProblem }: { programId: string; configured: boolean; canCreateProblem: boolean }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  function ask() {
    startTransition(async () => {
      const r = await detectOpportunities(programId);
      setState(r.ok ? { kind: "done", items: r.data.items, text: r.data.text } : { kind: "error", message: r.error });
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

  return (
    <div className="space-y-3">
      {state.kind !== "done" && !pending ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-highlight/60 bg-highlight/10 px-4 py-3">
          <TiaAvatar />
          <p className="min-w-0 flex-1 text-sm">
            ¿Quiere que la Tía le eche un ojo al programa y le diga dónde ve plata sobre la mesa?
          </p>
          <Button type="button" onClick={ask}>
            Pregúntele a la Tía qué ve
          </Button>
        </div>
      ) : null}

      {pending ? (
        <div className="rounded-2xl border border-highlight/60 bg-highlight/10 px-4 py-3">
          <TiaThinking seed={programId} />
        </div>
      ) : null}

      {state.kind === "error" && !pending ? <p className="text-sm text-soft">{state.message}</p> : null}

      {state.kind === "done" && !pending ? (
        <>
          {state.items.map((o, i) => (
            <TiaCard
              key={`${i}-${o.title}`}
              title={i === 0 ? "La Tía detectó una oportunidad" : "…y otra más"}
              actions={
                canCreateProblem ? (
                  <Button asChild size="sm" variant={i === 0 ? "default" : "outline"}>
                    <Link href={o.href}>
                      <FilePlus2 aria-hidden /> Convertir en problema
                    </Link>
                  </Button>
                ) : null
              }
            >
              <p className="font-semibold">{o.title}</p>
              <p className="mt-0.5 text-xs text-soft">
                {[o.lineName, o.stageName, o.metricName].filter(Boolean).join(" · ") || "Sin línea identificada"} · Impacto{" "}
                {IMPACT_LABEL[o.impact].toLowerCase()}
              </p>
              {o.why ? <TiaText text={o.why} className="mt-2" /> : null}
              {o.evidence ? (
                <p className="mt-2 rounded-lg bg-paper/70 px-2.5 py-1.5 text-xs">
                  <span className="font-medium">Lo que muestran los datos: </span>
                  {o.evidence}
                </p>
              ) : null}
            </TiaCard>
          ))}
          {state.text ? (
            <TiaCard title="La Tía le cuenta lo que ve">
              <TiaText text={state.text} />
            </TiaCard>
          ) : null}
          {!state.items.length && !state.text ? (
            <TiaCard title="Por ahora la Tía no ve nada nuevo">
              <p className="text-sm">Con los datos cargados no encontró oportunidades con respaldo. Cargue la semana y vuelva a preguntarle.</p>
            </TiaCard>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TiaDisclaimer />
            <Button type="button" variant="ghost" size="sm" onClick={ask}>
              <RefreshCw aria-hidden /> Preguntarle otra vez
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Se muestra solo si La Tía está prendida (NEXT_PUBLIC_TIA_ENABLED). */
export function TiaOpportunities(props: Parameters<typeof TiaOpportunitiesInner>[0]) {
  return TIA_ENABLED ? <TiaOpportunitiesInner {...props} /> : null;
}
