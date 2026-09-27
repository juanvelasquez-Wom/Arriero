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

/**
 * Contenedor del asistente de pilotos: 5 pasos con avance, contenido y panel
 * "¿Qué es esto?". Mismo lenguaje visual que el asistente de programas.
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
  const index = PILOT_STEPS.findIndex((s) => s.key === current);
  const step = PILOT_STEPS[index];
  const progress = wizardProgress(done);
  const help = PILOT_STEP_HELP[current];

  const nav = (
    <nav aria-label="Pasos del diseño del piloto">
      <ol className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {PILOT_STEPS.map((s, i) => {
          const isCurrent = s.key === current;
          const isDone = done[s.key];
          const reachable = isStepReachable(s.key, done, pilotId !== null);
          const content = (
            <>
              <span
                aria-hidden
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums",
                  isCurrent && "border-[#1f1f1f] bg-paper text-[#1f1f1f]",
                  isDone && !isCurrent && "border-ink bg-ink text-paper",
                )}
              >
                {isDone && !isCurrent ? <Check className="pop-in size-3.5" strokeWidth={3} /> : !reachable && !isCurrent ? <Lock className="size-3" /> : i + 1}
              </span>
              <span className="whitespace-nowrap lg:truncate lg:whitespace-normal">{s.title}</span>
              {isDone && !isCurrent ? <span className="sr-only"> (listo)</span> : null}
            </>
          );
          const cls = cn(
            "flex min-h-11 items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors",
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
  );

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-soft">
        {pilotId ? (
          <Link href={`/pilotos/${pilotId}`} className="inline-flex min-h-11 items-center gap-1 hover:underline sm:min-h-0">
            <ArrowLeft aria-hidden className="size-3.5" /> {pilotTitle ?? "Volver al piloto"}
          </Link>
        ) : (
          <Link href="/pilotos" className="inline-flex min-h-11 items-center gap-1 hover:underline sm:min-h-0">
            <ArrowLeft aria-hidden className="size-3.5" /> Pilotos de medios
          </Link>
        )}
      </div>

      <div className="mb-6 rounded-2xl border bg-paper px-4 py-3 shadow-card">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
          <span className="font-semibold text-ink">
            Paso {index + 1} de {PILOT_STEPS.length}
          </span>
          <span className="text-soft">
            <span className="font-heading font-bold text-ink tabular-nums">{progress}%</span> del diseño · Se guarda cada vez que avanza
          </span>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-gray-1"
          role="progressbar"
          aria-label="Avance del diseño del piloto"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="fill-in h-full rounded-full bg-highlight transition-all duration-500" style={{ width: `${Math.max(progress, 2)}%` }} />
        </div>
        <div className="mt-3 lg:hidden">{nav}</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_280px]">
        <div className="hidden lg:block">
          <div className="sticky top-16">{nav}</div>
        </div>

        <div className="min-w-0">
          <div key={current} className="slide-in">
            <header className="mb-5">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{step.title}</h1>
              <p className="mt-1 text-sm text-soft">{step.covers}</p>
            </header>

            <Collapsible className="mb-4 xl:hidden">
              <CollapsibleTrigger className="group inline-flex min-h-11 items-center gap-1 text-sm underline underline-offset-4">
                ¿Qué es esto? <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <HelpPanel help={help} />
              </CollapsibleContent>
            </Collapsible>

            {children}
          </div>
        </div>

        <div className="hidden xl:block">
          <div key={current} className="slide-in sticky top-16">
            <HelpPanel help={help} />
          </div>
        </div>
      </div>
    </div>
  );
}
