import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Callout, EmptyState, PageHeader } from "@/components/app/page";
import { ExperimentWizard } from "@/components/experiments/experiment-wizard";
import { emptyWizardValues, type WizardValues } from "@/components/experiments/wizard-values";
import { Button } from "@/components/ui/button";
import { hypothesisFromLearning, inferControl } from "@/domain/experiment-inference";
import { can } from "@/domain/permissions";
import { getProgramContext } from "@/server/auth";
import { listLearnings } from "@/server/queries/structure";
import { loadWizardData } from "@/server/queries/wizard";

export const metadata: Metadata = { title: "Nuevo ejercicio" };

export default async function NewExperimentPage({ params, searchParams }: PageProps<"/programas/[programId]/ejercicios/nuevo">) {
  const { programId } = await params;
  const sp = await searchParams;
  const ctx = await getProgramContext(programId);
  if (!can.createExperiment(ctx.actor)) redirect(`/programas/${programId}/ejercicios`);
  const data = await loadWizardData(ctx);
  const base = `/programas/${programId}`;

  if (!data.problems.some((p) => p.status !== "discarded")) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Nuevo ejercicio" />
        <EmptyState art="embudo"
          icon={ClipboardList}
          title="Primero, un problema con evidencia"
          description="Aquí no hay ejercicios sueltos: cada uno nace de un problema ubicado en el embudo y apunta a una métrica del árbol. ¿Y por dónde es? Por el problema."
          action={
            can.createProblem(ctx.actor) ? (
              <Button asChild>
                <Link href={`${base}/problemas/nuevo`}>Registrar un problema</Link>
              </Button>
            ) : null
          }
        />
      </div>
    );
  }

  const initial: WizardValues = emptyWizardValues();
  const problemId = typeof sp.problema === "string" ? sp.problema : undefined;
  if (problemId && data.problems.some((p) => p.id === problemId)) initial.problem_id = problemId;

  // "Crear ejercicio en otra línea desde este aprendizaje".
  const learningId = typeof sp.aprendizaje === "string" ? sp.aprendizaje : undefined;
  let learningNote: { text: string; source: string } | null = null;
  if (learningId) {
    const learning = (await listLearnings(programId)).find((l) => l.id === learningId);
    if (learning) {
      initial.derived_from_learning_id = learning.id;
      initial.title = (learning.suggested_hypothesis ?? "").slice(0, 200);
      // La hipótesis sugerida se separa en SI / ENTONCES / PORQUE; el aprendizaje queda como PORQUE si falta.
      Object.assign(initial, hypothesisFromLearning(initial, learning));
      learningNote = { text: learning.text, source: `${learning.experiment_title} (${learning.line_name})` };
      const targetLine = typeof sp.linea === "string" ? sp.linea : undefined;
      if (!initial.problem_id && targetLine) {
        const first = data.problems.find((p) => p.line_id === targetLine && p.status !== "discarded");
        if (first) initial.problem_id = first.id;
      }
    }
  }

  // El control parte del problema elegido (se puede cambiar en Priorización).
  const chosen = data.problems.find((p) => p.id === initial.problem_id);
  if (chosen) initial.control = inferControl(chosen.control);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow={
          <Link href={`${base}/ejercicios`} className="hover:underline">
            Backlog
          </Link>
        }
        title="Nuevo ejercicio"
        description="Un cambio que queremos probar antes de escalarlo. Puede guardarlo como borrador en cualquier paso, sin afán."
      />
      {learningNote ? (
        <Callout tone="neutral" className="mb-4" title={`Derivado del aprendizaje de “${learningNote.source}”`}>
          {learningNote.text}
        </Callout>
      ) : null}
      <ExperimentWizard data={data} initial={initial} />
    </div>
  );
}
