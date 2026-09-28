"use client";

import { Save } from "lucide-react";
import type { ReactNode } from "react";
import { useStepper, WizardDots, WizardFooter as StepFooter, WizardProgress, WizardStage } from "@/components/app/step-wizard";
import { Button } from "@/components/ui/button";
import { PILOT_STEPS, type PilotStepKey } from "@/domain/pilots/flow";
import { firstScreenWithError, overallProgress, PILOT_SUB_SCREENS, subScreenKeys, type SubScreen } from "./sub-flow";

export type SaveThen = "stay" | "next";
export type Stepper = ReturnType<typeof useStepper<string>>;

/**
 * Pantallas de un paso: el stepper, la pantalla actual y cómo volver a la
 * primera pantalla con errores (de la validación o de la server action).
 */
export function useSubSteps(step: PilotStepKey) {
  const stepper = useStepper(subScreenKeys(step));
  const screen: SubScreen = PILOT_SUB_SCREENS[step][stepper.index];
  const jumpToError = (errorKeys: string[]) => {
    const i = firstScreenWithError(step, errorKeys);
    if (i != null && i !== stepper.index) stepper.goTo(i);
  };
  return { stepper, screen, jumpToError };
}

/**
 * Marco de una pantalla del asistente de pilotos: avance total con la mula,
 * puntos de las pantallas del paso y la pantalla con su pregunta.
 */
export function PilotStage({
  step,
  stepper,
  header,
  children,
  footer,
}: {
  step: PilotStepKey;
  stepper: Stepper;
  /** Avisos que se ven en todas las pantallas del paso (error, conflicto). */
  header?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  const main = PILOT_STEPS.findIndex((s) => s.key === step);
  const screens = PILOT_SUB_SCREENS[step];
  const screen = screens[stepper.index];
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-paper px-4 pt-3 pb-4 shadow-card sm:px-5">
        <WizardProgress
          value={overallProgress(main, PILOT_STEPS.length, stepper.index, screens.length)}
          label={`Paso ${main + 1} de ${PILOT_STEPS.length} · ${PILOT_STEPS[main].title}`}
          detail={screens.length > 1 ? `Pantalla ${stepper.index + 1} de ${screens.length}` : undefined}
        />
      </div>
      <div className="rounded-2xl border bg-paper p-4 shadow-card sm:p-6">
        <div className="mb-4 flex min-h-6 justify-end">
          <WizardDots count={screens.length} index={stepper.index} onPick={stepper.goTo} labels={screens.map((s) => s.label)} />
        </div>
        {header ? <div className="mb-4 space-y-3">{header}</div> : null}
        <WizardStage stepKey={`${step}-${screen.key}`} direction={stepper.direction} title={screen.title} subtitle={screen.subtitle}>
          <div className="space-y-5">{children}</div>
        </WizardStage>
        {footer}
      </div>
    </div>
  );
}

/**
 * Pie de cada pantalla: "Atrás" (a la pantalla anterior o al paso anterior),
 * "Guardar borrador" (guarda todo el paso y se queda) y la acción principal:
 * "Siga" entre pantallas; en la última, "Guardar y seguir" (guarda y pasa al
 * siguiente paso). La acción principal es submit: Enter también avanza.
 */
export function WizardFooter({
  stepper,
  prevHref,
  pending,
  onSave,
  nextLabel = "Guardar y seguir",
  showDraft = true,
  disabled,
  extra,
}: {
  stepper: Stepper;
  prevHref: string | null;
  pending: boolean;
  onSave: (then: SaveThen) => void;
  /** Texto de la acción principal en la última pantalla. */
  nextLabel?: string;
  showDraft?: boolean;
  disabled?: boolean;
  extra?: ReactNode;
}) {
  return (
    <StepFooter
      onBack={stepper.isFirst ? undefined : stepper.back}
      backHref={stepper.isFirst ? prevHref : null}
      backLabel={stepper.isFirst ? "Paso anterior" : "Atrás"}
      pending={pending}
      disabled={disabled}
      nextLabel={stepper.isLast ? nextLabel : "Siga"}
      extra={
        <>
          {extra}
          {showDraft ? (
            <Button type="button" variant="outline" size="lg" className="min-h-11 w-full sm:w-auto" disabled={pending || disabled} onClick={() => onSave("stay")}>
              <Save aria-hidden /> Guardar borrador
            </Button>
          ) : null}
        </>
      }
    />
  );
}
