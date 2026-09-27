import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page";
import { StatusBadge } from "@/components/app/status-badge";
import { ExperimentWizard } from "@/components/experiments/experiment-wizard";
import type { WizardValues } from "@/components/experiments/wizard-values";
import { inferCalendarFit, isCalendarOverride } from "@/domain/experiment-inference";
import { can } from "@/domain/permissions";
import { getProgramContext } from "@/server/auth";
import { getExperiment, listVariants } from "@/server/queries/experiments";
import { getExperimentVersion, loadWizardData } from "@/server/queries/wizard";

export const metadata: Metadata = { title: "Editar ejercicio" };

export default async function EditExperimentPage({
  params,
  searchParams,
}: PageProps<"/programas/[programId]/ejercicios/[experimentId]/editar">) {
  const { programId, experimentId } = await params;
  const sp = await searchParams;
  const ctx = await getProgramContext(programId);
  const experiment = await getExperiment(experimentId);
  if (!experiment || experiment.program_id !== programId) notFound();
  const base = `/programas/${programId}/ejercicios/${experimentId}`;
  if (!can.editExperiment(ctx.actor, experiment)) redirect(base);

  const [data, variants, version] = await Promise.all([
    loadWizardData(ctx),
    listVariants({ experimentId }),
    getExperimentVersion(experimentId),
  ]);
  const fit = inferCalendarFit(experiment, data.calendar);
  const initial: WizardValues = {
    problem_id: experiment.problem_id,
    metric_id: experiment.metric_id,
    title: experiment.title,
    derived_from_learning_id: experiment.derived_from_learning_id,
    hypothesis_if: experiment.hypothesis_if ?? "",
    hypothesis_then: experiment.hypothesis_then ?? "",
    hypothesis_because: experiment.hypothesis_because ?? "",
    impact: experiment.impact,
    confidence: experiment.confidence,
    ease: experiment.ease,
    fits_calendar: experiment.fits_calendar,
    fits_calendar_override: isCalendarOverride(experiment.fits_calendar, fit.fits),
    control: experiment.control,
    test_type: experiment.test_type,
    primary_metric: experiment.primary_metric ?? "",
    control_metrics: experiment.control_metrics,
    min_duration_days: experiment.min_duration_days,
    decision_rule: experiment.decision_rule ?? "",
    owner_id: experiment.owner_id,
    owner_type: experiment.owner_type,
    planned_start: experiment.planned_start ?? "",
    planned_end: experiment.planned_end ?? "",
    variants: variants.map((v) => ({ id: v.id, name: v.name, is_control: v.is_control, description: v.description ?? "" })),
  };
  const requested = Number(sp.paso);
  const step = Number.isInteger(requested) && requested >= 1 && requested <= 5 ? requested : 1;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow={
          <Link href={base} className="hover:underline">
            Volver al ejercicio
          </Link>
        }
        title={experiment.title}
        actions={<StatusBadge status={experiment.status} />}
      />
      <ExperimentWizard
        data={data}
        initial={initial}
        experimentId={experimentId}
        initialUpdatedAt={version}
        initialStep={step}
        designLocked={!!experiment.design_locked_at}
      />
    </div>
  );
}
