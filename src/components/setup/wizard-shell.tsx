import { Check, ChevronDown, Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  isReachable,
  LINE_SUBSTEPS,
  MAIN_STEPS,
  resumeStep,
  stepHref,
  stepSequence,
  SUBSTEP_LABEL,
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
          current && "border-highlight bg-highlight text-[#1f1f1f]",
          done && !current && "border-ink bg-ink text-paper",
        )}
        aria-hidden
      >
        {done && !current ? <Check className="size-3" /> : !reachable && !current ? <Lock className="size-2.5" /> : null}
      </span>
      <span className="truncate">{children}</span>
    </>
  );
  const cls = cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm", current ? "bg-paper font-medium shadow-sm" : "text-ink/85");
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

/** Contenedor del asistente: pasos, contenido y panel "¿Qué es esto?". */
export function WizardShell({ programId, current, state, lines, help, title, subtitle, children }: ShellProps) {
  const seq = stepSequence(lines);
  const index = seq.findIndex((s) => s.key === current.key && (s.lineId ?? null) === (current.lineId ?? null));
  const resume = resumeStep(state);
  const resumeIndex = seq.findIndex((s) => s.key === resume.key && (s.lineId ?? null) === (resume.lineId ?? null));
  const isDone = (s: StepRef) => {
    if (state.completed) return true;
    const i = seq.findIndex((x) => x.key === s.key && (x.lineId ?? null) === (s.lineId ?? null));
    return i >= 0 && i < resumeIndex;
  };
  const progress = Math.round(((Math.max(index, 0) + 1) / seq.length) * 100);
  // El contador muestra los pasos principales; los de cada línea cuentan dentro de "Líneas".
  const isLineStep = (LINE_SUBSTEPS as readonly string[]).includes(current.key);
  const mainIndex = MAIN_STEPS.findIndex((s) => s.key === (isLineStep ? "lineas" : current.key));
  const lineIndex = isLineStep ? lines.findIndex((l) => l.id === current.lineId) : -1;
  const counter = isLineStep
    ? `Paso ${mainIndex + 1} de ${MAIN_STEPS.length} · Línea ${lineIndex + 1} de ${lines.length}: ${SUBSTEP_LABEL[current.key as (typeof LINE_SUBSTEPS)[number]].toLowerCase()}`
    : `Paso ${mainIndex + 1} de ${MAIN_STEPS.length}`;

  const nav = (
    <nav aria-label="Pasos del asistente">
      <ol className="space-y-0.5">
        {MAIN_STEPS.map((s) => (
          <li key={s.key}>
            <StepLink programId={programId} step={{ key: s.key }} state={state} current={current.key === s.key} done={isDone({ key: s.key })}>
              {s.label}
            </StepLink>
            {s.key === "lineas" && lines.length ? (
              <ol className="mt-0.5 ml-4 space-y-0.5 border-l pl-2">
                {lines.map((l) => (
                  <li key={l.id}>
                    <div className="px-2 pt-1 text-xs font-medium text-soft">{l.name}</div>
                    <ol>
                      {LINE_SUBSTEPS.map((sub) => (
                        <li key={sub}>
                          <StepLink
                            programId={programId}
                            step={{ key: sub, lineId: l.id }}
                            state={state}
                            current={current.key === sub && current.lineId === l.id}
                            done={isDone({ key: sub, lineId: l.id })}
                          >
                            {SUBSTEP_LABEL[sub]}
                          </StepLink>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5">
        <div className="mb-1 flex items-center justify-between text-xs text-soft">
          <span>{counter}</span>
          <span>Se guarda automáticamente al avanzar</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-1" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-highlight transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)_320px]">
        <div className="hidden lg:block">
          <div className="sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto">{nav}</div>
        </div>

        <div className="min-w-0">
          <Collapsible className="mb-4 rounded-xl border bg-paper lg:hidden">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium">
              Ver todos los pasos <ChevronDown className="size-4" aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 pb-3">{nav}</CollapsibleContent>
          </Collapsible>

          <header className="mb-4">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? <div className="mt-1 text-sm text-soft">{subtitle}</div> : null}
          </header>

          <Collapsible className="mb-4 lg:hidden">
            <CollapsibleTrigger className="inline-flex items-center gap-1 text-sm underline underline-offset-4">
              ¿Qué es esto? <ChevronDown className="size-4" aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <HelpPanel help={help} />
            </CollapsibleContent>
          </Collapsible>

          {children}
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-16">
            <HelpPanel help={help} />
          </div>
        </div>
      </div>
    </div>
  );
}
