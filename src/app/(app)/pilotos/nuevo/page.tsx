import { Eye } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/page";
import { PilotWizardShell } from "@/components/pilots/wizard/pilot-wizard-shell";
import { StepProblem } from "@/components/pilots/wizard/step-problem";
import { EMPTY_PROBLEM, EMPTY_PROGRESS } from "@/components/pilots/wizard/wizard-values";
import { Button } from "@/components/ui/button";
import { canWritePilots } from "@/domain/pilots/flow";
import { stepsDone } from "@/domain/pilots/wizard";
import { getPilotContext, isPilotsReady } from "@/server/pilot-auth";
import { listPilotMembers, loadLinkOptions } from "@/server/queries/pilots";

export const metadata: Metadata = { title: "Nuevo piloto" };

export default async function NewPilotPage() {
  const { user, actor } = await getPilotContext();
  if (!actor.role || !(await isPilotsReady())) return null;

  if (!canWritePilots(actor)) {
    return (
      <EmptyState
        art="mula-sombrero"
        icon={Eye}
        title="Su rol en Pilotos es de lectura"
        description="Puede ver los pilotos y sus resultados. Para crear uno, pídale a un aprobador que le dé el rol de Creador."
        action={
          <Button variant="outline" asChild>
            <Link href="/pilotos">Ver el portafolio</Link>
          </Button>
        }
      />
    );
  }

  const [linkOptions, members] = await Promise.all([loadLinkOptions(), listPilotMembers()]);

  return (
    <PilotWizardShell pilotId={null} current="problema" done={stepsDone(EMPTY_PROGRESS)}>
      <StepProblem
        pilotId={null}
        initial={EMPTY_PROBLEM}
        links={{ owner_id: user.id, program_id: null, experiment_id: null, tree_metric_id: null }}
        linkOptions={linkOptions}
        members={members}
      />
    </PilotWizardShell>
  );
}
