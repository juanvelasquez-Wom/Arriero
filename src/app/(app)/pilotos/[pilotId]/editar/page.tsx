import { ArrowLeft, Eye, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Callout, EmptyState } from "@/components/app/page";
import { PilotStatusBadge } from "@/components/pilots/pilot-badges";
import { PilotWizardShell } from "@/components/pilots/wizard/pilot-wizard-shell";
import { StepDesign } from "@/components/pilots/wizard/step-design";
import { StepMeasurement } from "@/components/pilots/wizard/step-measurement";
import { StepMetrics } from "@/components/pilots/wizard/step-metrics";
import { StepProblem } from "@/components/pilots/wizard/step-problem";
import { pilotReviewRows } from "@/components/pilots/wizard/review-summary";
import { StepRules } from "@/components/pilots/wizard/step-rules";
import {
  activeCatalogs,
  checklistValues,
  designValues,
  linksValues,
  metricsValues,
  problemValues,
  progressOf,
  rulesValues,
} from "@/components/pilots/wizard/wizard-values";
import { Button } from "@/components/ui/button";
import { canEditDesign, canWritePilots, missingForReview, parsePilotStep } from "@/domain/pilots/flow";
import { PILOT_STATUS_LABEL, PILOT_TERMS } from "@/domain/pilots/labels";
import { DEFAULT_DECISION_RULES } from "@/domain/pilots/types";
import { readinessFrom } from "@/domain/pilots/wizard";
import { getPilotContext, isPilotsReady } from "@/server/pilot-auth";
import { PilotTiaDraft } from "@/components/pilots/pilot-tia-drafts";
import { listPilotMembers, listPilots, loadLinkOptions, loadPilotCatalogs, loadPilotDetail, loadPilotDrafts } from "@/server/queries/pilots";

export const metadata: Metadata = { title: "Diseño del piloto" };

export default async function EditPilotPage({ params, searchParams }: PageProps<"/pilotos/[pilotId]/editar">) {
  const { actor } = await getPilotContext();
  if (!actor.role || !(await isPilotsReady())) return null;
  const { pilotId } = await params;
  const { paso } = await searchParams;
  const step = parsePilotStep(paso);

  const detail = await loadPilotDetail(pilotId);
  if (!detail) notFound();
  const { pilot } = detail;
  const back = (
    <Button variant="outline" asChild>
      <Link href={`/pilotos/${pilotId}`}>
        <ArrowLeft aria-hidden /> Volver al piloto
      </Link>
    </Button>
  );

  if (!canWritePilots(actor)) {
    return (
      <EmptyState
        art="mula-sombrero"
        icon={Eye}
        title="Su rol en Pilotos es de lectura"
        description="Puede ver el diseño en la ficha del piloto. Para editarlo, pídale a un aprobador el rol de Creador."
        action={back}
      />
    );
  }

  if (pilot.deleted_at || !canEditDesign(actor, pilot.status)) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{pilot.title}</h1>
        <Callout icon={Lock} title={pilot.deleted_at ? "El piloto está borrado" : `${PILOT_TERMS.designLock.label} · el piloto está ${PILOT_STATUS_LABEL[pilot.status].toLowerCase()}`}>
          {pilot.deleted_at ? (
            "Un aprobador lo puede restaurar desde la ficha del piloto."
          ) : pilot.status === "in_review" ? (
            <>El piloto está en revisión: pídale al aprobador que lo devuelva a borrador para editarlo.</>
          ) : (
            <>{PILOT_TERMS.designLock.simple}</>
          )}
          <div className="mt-2">
            <PilotStatusBadge status={pilot.status} />
          </div>
        </Callout>
        {back}
      </div>
    );
  }

  const [catalogs, drafts] = await Promise.all([loadPilotCatalogs(), loadPilotDrafts(pilotId)]);
  const active = activeCatalogs(catalogs, detail);
  const done = progressOf(detail);

  let content: React.ReactNode;
  switch (step) {
    case "problema": {
      const [linkOptions, members] = await Promise.all([loadLinkOptions(), listPilotMembers()]);
      content = <StepProblem pilotId={pilotId} initial={problemValues(detail)} links={linksValues(detail)} linkOptions={linkOptions} members={members} />;
      break;
    }
    case "prueba": {
      const all = await listPilots();
      content = (
        <StepDesign
          pilotId={pilotId}
          pilotTitle={pilot.title}
          initial={designValues(detail)}
          variables={active.variables}
          media={active.media}
          others={all.filter((p) => p.id !== pilotId).map((p) => p.summary)}
        />
      );
      break;
    }
    case "metricas":
      content = (
        <StepMetrics
          pilotId={pilotId}
          metrics={active.metrics}
          initial={metricsValues(detail, catalogs)}
          expectedPct={pilot.hypothesis_expected_pct}
          arms={detail.arms.length}
          budgetCop={pilot.planned_budget_cop}
        />
      );
      break;
    case "reglas":
      content = <StepRules pilotId={pilotId} initial={rulesValues(detail)} saved={pilot.decision_rules != null} />;
      break;
    case "medicion": {
      const providers = new Map(catalogs.media.map((m) => [m.id, m.provider]));
      content = (
        <StepMeasurement
          pilotId={pilotId}
          initial={checklistValues(detail)}
          media={detail.media.map((m) => ({ name: m.media_name, provider: providers.get(m.media_id) ?? null }))}
          missing={missingForReview(readinessFrom(detail, catalogs.variables))}
          serverMissing={detail.missing}
          summary={pilotReviewRows(
            detail,
            {
              variables: Object.fromEntries(catalogs.variables.map((v) => [v.id, v.name])),
              metrics: Object.fromEntries(catalogs.metrics.map((m) => [m.id, m.name])),
            },
            DEFAULT_DECISION_RULES,
          )}
        />
      );
      break;
    }
  }

  return (
    <PilotWizardShell pilotId={pilotId} pilotTitle={pilot.title} current={step} done={done}>
      {content}
      {step === "problema" || step === "prueba" ? (
        <PilotTiaDraft
          pilotId={pilotId}
          kind={step === "problema" ? "diagnosis" : "design"}
          draft={drafts.find((d) => d.kind === (step === "problema" ? "diagnosis" : "design")) ?? null}
          canWrite
        />
      ) : null}
    </PilotWizardShell>
  );
}
