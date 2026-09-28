import { ArrowLeft, Check, ChevronDown, Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { HelpPanel } from "@/components/setup/help";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PILOT_STEPS, type PilotStepKey } from "@/domain/pilots/flow";
import { isStepReachable, wizardProgress } from "@/domain/pilots/wizard";
import { cn } from "@/lib/utils";
import { PILOT_STEP_HELP } from "./help-content";
import { pilotStepHref } from "./wizard-links";

/** Nombres cortos para las fichas (el título completo va en la barra de avance). */
const SHORT_TITLE: Record<PilotStepKey, string> = {
  problema: "Problema",
  prueba: "Prueba",
  metricas: "Métricas",
  reglas: "Reglas",
  medicion: "Medición",
};

/**
 * Contenedor del asistente de pilotos: los 5 pasos como fichas arriba, la
 * ayuda "¿Qué es esto?" plegada y, debajo, el paso con sus pantallas cortas
 * (cada paso trae su barra de avance con la mula y su pie Atrás / Siga).
 */
export function PilotWizardShell({
  pilotId,
  pilotTitle,
  current,
  done,
  children,
}: {
  /** null = piloto nuevo (solo el primer paso). */
  pilotId: string | null;
  pilotTitle?: string;
  current: PilotStepKey;
  done: Record<PilotStepKey, boolean>;
  children: ReactNode;
}) {
  const progress = wizardProgress(done);
  const help = PILOT_STEP_HELP[current];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        {pilotId ? (
          <Link href={`/pilotos/${pilotId}`} className="inline-flex min-h-11 items-center gap-1 font-semibold uppercase tracking-[0.12em] text-soft hover:underline sm:min-h-0">
            <ArrowLeft aria-hidden className="size-3.5" /> {pilotTitle ?? "Volver al piloto"}
          </Link>
        ) : (
          <Link href="/pilotos" className="inline-flex min-h-11 items-center gap-1 font-semibold uppercase tracking-[0.12em] text-soft hover:underline sm:min-h-0">
            <ArrowLeft aria-hidden className="size-3.5" /> Pilotos de medios
          </Link>
        )}
        <span className="text-soft">
          <span className="font-heading font-bold text-ink tabular-nums">{progress}%</span> del diseño · se guarda al terminar cada paso
        </span>
      </div>

      <nav aria-label="Pasos del diseño del piloto" className="mb-3">
        <ol className="flex gap-1 overflow-x-auto pb-1">
          {PILOT_STEPS.map((s, i) => {
            const isCurrent = s.key === current;
            const isDone = done[s.key];
            const reachable = isStepReachable(s.key, done, pilotId !== null);
            const content = (
              <>
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums",
                    isCurrent && "border-[#1f1f1f] bg-paper text-[#1f1f1f]",
                    isDone && !isCurrent && "border-ink bg-ink text-paper",
                  )}
                >
                  {isDone && !isCurrent ? <Check className="pop-in size-3" strokeWidth={3} /> : !reachable && !isCurrent ? <Lock className="size-2.5" /> : i + 1}
                </span>
                <span className={cn("whitespace-nowrap", !isCurrent && "hidden sm:inline")}>{SHORT_TITLE[s.key]}</span>
                {!isCurrent ? <span className="sr-only sm:hidden">{SHORT_TITLE[s.key]}</span> : null}
                {isDone && !isCurrent ? <span className="sr-only"> (listo)</span> : null}
              </>
            );
            const cls = cn(
              "flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors sm:min-h-9",
              isCurrent ? "bg-highlight font-semibold text-[#1f1f1f] shadow-card" : "text-ink/85",
            );
            return (
              <li key={s.key} className="shrink-0">
                {reachable && !isCurrent && pilotId ? (
                  <Link href={pilotStepHref(pilotId, s.key)} className={cn(cls, "hover:bg-gray-1")}>
                    {content}
                  </Link>
                ) : (
                  <span className={cn(cls, !reachable && !isCurrent && "opacity-50")} aria-current={isCurrent ? "step" : undefined}>
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <Collapsible className="mb-4">
        <CollapsibleTrigger className="group inline-flex min-h-11 items-center gap-1 text-sm text-soft underline underline-offset-4 hover:text-ink">
          ¿Qué es esto? <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <HelpPanel help={help} />
        </CollapsibleContent>
      </Collapsible>

      <h1 className="sr-only">{PILOT_STEPS.find((s) => s.key === current)?.title}</h1>
      <div key={current}>{children}</div>
    </div>
  );
}
