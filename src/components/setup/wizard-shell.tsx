import { Check, ChevronDown, FlagTriangleRight, Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  canFinishEarly,
  isOptionalStep,
  isReachable,
  isStepDone,
  MAIN_STEPS,
  OPTIONAL_STEPS,
  sameStep,
  setupProgress,
  stepHref,
  stepSequence,
  type SetupState,
  type StepRef,
} from "@/domain/setup-flow";
import { cn } from "@/lib/utils";
import { HelpPanel } from "./help";
import type { StepHelp } from "./help-content";

interface ShellProps {
  programId: string | null;
  current: StepRef;
  state: SetupState;
  lines: { id: string; name: string }[];
  help: StepHelp;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}

function StepLink({
  programId,
  step,
  state,
  current,
  children,
  done,
}: {
  programId: string | null;
  step: StepRef;
  state: SetupState;
  current: boolean;
  done: boolean;
  children: ReactNode;
}) {
  const reachable = programId !== null && isReachable(step, state);
  const content = (
    <>
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
          current && "border-[#1f1f1f] bg-paper text-[#1f1f1f]",
          done && !current && "border-ink bg-ink text-paper",
        )}
        aria-hidden
      >
        {done && !current ? (
          <Check className="pop-in size-3" strokeWidth={3} />
        ) : !reachable && !current ? (
          <Lock className="size-2.5" />
        ) : current ? (
          <span className="size-1.5 rounded-full bg-[#1f1f1f]" />
        ) : null}
      </span>
      <span className="truncate">{children}</span>
      {done && !current ? <span className="sr-only"> (listo)</span> : null}
    </>
  );
  const cls = cn(
    "flex items-center gap-2 rounded-full px-2.5 py-1.5 text-sm transition-colors",
    current ? "bg-highlight font-semibold text-[#1f1f1f] shadow-card" : "text-ink/85",
  );
  if (!reachable || current) {
    return (
      <span className={cn(cls, !reachable && !current && "opacity-50")} aria-current={current ? "step" : undefined}>
        {content}
      </span>
    );
  }
  return (
    <Link href={stepHref(programId!, step)} className={cn(cls, "hover:bg-gray-1")}>
      {content}
    </Link>
  );
}

/**
 * Contenedor del asistente: pasos, avance, contenido y panel "¿Qué es esto?".
 * El contenido va con `key` del paso para que entre con `.slide-in` cada vez que
 * cambia de pantalla.
 */
export function WizardShell({ programId, current, state, lines, help, title, subtitle, children }: ShellProps) {
  const seq = stepSequence(lines);
  const optional = isOptionalStep(current.key);
  const index = seq.findIndex((s) => sameStep(s, current));
  const progress = setupProgress(state);
  const lineIndex = current.key === "linea" ? lines.findIndex((l) => l.id === current.lineId) : -1;
  const counter = optional
    ? "Opcional · vuelve al resumen cuando quiera"
    : `Paso ${Math.max(index, 0) + 1} de ${seq.length}${lineIndex >= 0 ? ` · Línea ${lineIndex + 1} de ${lines.length}` : ""}`;
  const showFinishLater = programId !== null && canFinishEarly(state) && current.key !== "resumen" && !optional;
  const stepKey = `${current.key}:${current.lineId ?? ""}`;

  const nav = (
    <nav aria-label="Pasos del asistente">
      <ol className="space-y-0.5">
        {MAIN_STEPS.map((s) => (
          <li key={s.key}>
            <StepLink programId={programId} step={{ key: s.key }} state={state} current={current.key === s.key} done={isStepDone({ key: s.key }, state)}>
              {s.label}
            </StepLink>
            {s.key === "lineas" && lines.length ? (
              <ol className="mt-0.5 ml-4 space-y-0.5 border-l pl-2">
                {lines.map((l) => {
                  const step: StepRef = { key: "linea", lineId: l.id };
                  return (
                    <li key={l.id}>
                      <StepLink programId={programId} step={step} state={state} current={sameStep(current, step)} done={isStepDone(step, state)}>
                        {l.name}
                      </StepLink>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="mt-4 border-t pt-3">
        <div className="px-2.5 pb-1 text-xs font-semibold uppercase tracking-wide text-soft">Opcional</div>
        <ol className="space-y-0.5">
          {OPTIONAL_STEPS.map((s) => (
            <li key={s.key}>
              <StepLink programId={programId} step={{ key: s.key }} state={state} current={current.key === s.key} done={false}>
                {s.label}
              </StepLink>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 rounded-2xl border bg-paper px-4 py-3 shadow-card">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
          <span className="font-semibold text-ink">{counter}</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-soft">
            <span>
              <span className="font-heading font-bold text-ink tabular-nums">{progress}%</span> · Se guarda solo cada vez que avanza
            </span>
            {showFinishLater ? (
              <Link href={stepHref(programId!, { key: "resumen" })} className="inline-flex items-center gap-1 font-medium text-ink underline underline-offset-4">
                <FlagTriangleRight className="size-3.5" aria-hidden /> {state.completed ? "Ir al resumen" : "Terminar después · ir al resumen"}
              </Link>
            ) : null}
          </span>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-gray-1"
          role="progressbar"
          aria-label="Avance de la configuración"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="fill-in h-full rounded-full bg-highlight transition-all duration-500" style={{ width: `${Math.max(progress, 2)}%` }} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_280px]">
        <div className="hidden lg:block">
          <div className="sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto">{nav}</div>
        </div>

        <div className="min-w-0">
          <Collapsible className="mb-4 rounded-2xl border bg-paper shadow-card lg:hidden">
            <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-sm font-medium">
              Ver todos los pasos <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 pb-3">{nav}</CollapsibleContent>
          </Collapsible>

          <div key={stepKey} className="slide-in">
            <header className="mb-5">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
              {subtitle ? <div className="mt-1 text-sm text-soft">{subtitle}</div> : null}
            </header>

            <Collapsible className="mb-4 xl:hidden">
              <CollapsibleTrigger className="group inline-flex items-center gap-1 text-sm underline underline-offset-4">
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
          <div key={stepKey} className="slide-in sticky top-16">
            <HelpPanel help={help} />
          </div>
        </div>
      </div>
    </div>
  );
}
