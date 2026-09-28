import { Eye, Lightbulb } from "lucide-react";
import { problemPrefillFromInsight } from "@/domain/insights";
import { getInsight } from "@/server/queries/insights";
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

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewPilotPage({ searchParams }: PageProps<"/pilotos/nuevo">) {
  const sp = await searchParams;
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

  const insightParam = typeof sp.insight === "string" && uuidRe.test(sp.insight) ? sp.insight : null;
  const [linkOptions, members, insight] = await Promise.all([
    loadLinkOptions(),
    listPilotMembers(),
    insightParam ? getInsight(insightParam, user.id) : Promise.resolve(null),
  ]);
  // Desde el carriel de insights: el problema y la evidencia salen del insight.
  const draft = insight ? problemPrefillFromInsight(insight) : null;
  const initial = insight && draft ? { ...EMPTY_PROBLEM, problem: insight.title, problem_evidence: draft.evidencia } : EMPTY_PROBLEM;

  return (
    <PilotWizardShell pilotId={null} current="problema" done={stepsDone(EMPTY_PROGRESS)}>
      {insight ? (
        <p className="mb-4 flex gap-2 rounded-2xl border-l-4 border-highlight bg-paper px-4 py-3 text-sm">
          <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Este piloto nace del insight «{insight.title}», de {insight.author_name}. Le dejamos el problema y la evidencia; complete la hipótesis y
            siga. Al crearlo, el insight queda sembrado aquí.
          </span>
        </p>
      ) : null}
      <StepProblem
        pilotId={null}
        insightId={insight?.id}
        initial={initial}
        links={{ owner_id: user.id, program_id: null, experiment_id: null, tree_metric_id: null }}
        linkOptions={linkOptions}
        members={members}
      />
    </PilotWizardShell>
  );
}
