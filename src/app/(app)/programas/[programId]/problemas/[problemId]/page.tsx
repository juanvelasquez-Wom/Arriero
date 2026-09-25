import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttachmentList } from "@/components/app/attachments";
import { DeleteButton } from "@/components/app/delete-button";
import { PageHeader, Section } from "@/components/app/page";
import { ImpactBadge, ProblemStatusBadge, StatusBadge } from "@/components/app/status-badge";
import { EditProblem } from "@/components/problems/edit-problem";
import { Button } from "@/components/ui/button";
import { CONTROL_LABEL } from "@/domain/labels";
import { formatScore } from "@/domain/format";
import { can } from "@/domain/permissions";
import { getProgramContext } from "@/server/auth";
import { listAttachments, listExperiments } from "@/server/queries/experiments";
import { listLines } from "@/server/queries/programs";
import { listProblems, listStages } from "@/server/queries/structure";

export const metadata: Metadata = { title: "Problema" };

export default async function ProblemDetailPage({ params }: PageProps<"/programas/[programId]/problemas/[problemId]">) {
  const { programId, problemId } = await params;
  const ctx = await getProgramContext(programId);
  const [[problem], allProblems, lines, stages, attachments, experiments] = await Promise.all([
    listProblems(programId, { problemId }),
    listProblems(programId),
    listLines(programId),
    listStages({ programId }),
    listAttachments("problem", problemId),
    listExperiments(programId),
  ]);
  if (!problem) notFound();
  const linked = experiments.filter((e) => e.problem_id === problem.id);
  const base = `/programas/${programId}`;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={
          <Link href={`${base}/problemas`} className="hover:underline">
            Problemas
          </Link>
        }
        title={problem.title}
        description={`${problem.line_name} · ${problem.stage_name}${problem.channel ? ` · ${problem.channel}` : ""}`}
        actions={
          <>
            {can.createExperiment(ctx.actor) && problem.status !== "discarded" ? (
              <Button asChild>
                <Link href={`${base}/ejercicios/nuevo?problema=${problem.id}`}>
                  <Sparkles aria-hidden /> Crear ejercicio desde este problema
                </Link>
              </Button>
            ) : null}
            {can.editProblem(ctx.actor) ? (
              <EditProblem
                programId={programId}
                problemId={problem.id}
                lines={lines}
                stages={stages}
                defaults={{
                  stage_id: problem.stage_id,
                  channel: problem.channel ?? "",
                  title: problem.title,
                  evidence: problem.evidence,
                  root_cause: problem.root_cause ?? "",
                  impact: problem.impact,
                  control: problem.control,
                  status: problem.status,
                }}
              />
            ) : null}
            {can.deleteStructure(ctx.actor) ? (
              <DeleteButton
                entity="problem"
                id={problem.id}
                programId={programId}
                name={problem.title}
                redirectTo={`${base}/problemas`}
                reassignOptions={allProblems
                  .filter((o) => o.id !== problem.id && o.line_id === problem.line_id)
                  .map((o) => ({ id: o.id, label: o.title }))}
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Section title="Evidencia">
            <p className="whitespace-pre-line text-sm">{problem.evidence}</p>
          </Section>
          <Section title="Causa raíz hipotética">
            <p className="whitespace-pre-line text-sm">{problem.root_cause || <span className="text-soft">Sin definir.</span>}</p>
          </Section>
          <Section title={`Ejercicios vinculados (${linked.length})`}>
            {linked.length ? (
              <ul className="divide-y">
                {linked.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <Link href={`${base}/ejercicios/${e.id}`} className="font-medium hover:underline">
                      {e.title}
                    </Link>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums text-soft">Puntaje {formatScore(e.final_score)}</span>
                      <StatusBadge status={e.status} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-soft">Todavía no hay ejercicios para este problema.</p>
            )}
          </Section>
        </div>
        <div className="space-y-6">
          <Section title="Clasificación">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-soft">Estado</dt>
              <dd>
                <ProblemStatusBadge status={problem.status} />
              </dd>
              <dt className="text-soft">Impacto</dt>
              <dd>
                <ImpactBadge impact={problem.impact} />
              </dd>
              <dt className="text-soft">Control</dt>
              <dd>{CONTROL_LABEL[problem.control]}</dd>
            </dl>
          </Section>
          <Section title="Adjuntos">
            <AttachmentList
              programId={programId}
              entityType="problem"
              entityId={problem.id}
              items={attachments}
              canUpload={can.uploadProblemAttachment(ctx.actor)}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
