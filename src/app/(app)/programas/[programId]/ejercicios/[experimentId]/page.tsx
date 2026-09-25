import { BookOpenCheck, Pencil, Snowflake } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttachmentList } from "@/components/app/attachments";
import { DeleteButton } from "@/components/app/delete-button";
import { Callout, PageHeader, Section } from "@/components/app/page";
import { DecisionBadge, StatusBadge, VerdictBadge } from "@/components/app/status-badge";
import { DesignLock } from "@/components/experiments/design-lock";
import { LearningEditor } from "@/components/experiments/learning-editor";
import { ResultsEditor } from "@/components/experiments/results-editor";
import { TransitionBar, type TransitionOption } from "@/components/experiments/transition-bar";
import { Button } from "@/components/ui/button";
import { durationWarning, freezeWarning, plannedRange } from "@/domain/calendar";
import { formatDate, formatDateRange, formatDateTime, formatScore, formatSignedPercent } from "@/domain/format";
import { CONTROL_LABEL, OWNER_TYPE_LABEL, STATUS_LABEL, TEST_TYPE_LABEL } from "@/domain/labels";
import { availableTransitions, daysInStatus, isLaunched } from "@/domain/lifecycle";
import { can } from "@/domain/permissions";
import { computeVariantResults, hasCompleteResults, headlineDiff } from "@/domain/results";
import { cn } from "@/lib/utils";
import { getProgramContext } from "@/server/auth";
import { getExperiment, getLearning, listActivity, listAttachments, listVariants } from "@/server/queries/experiments";
import { listCalendar, listLines } from "@/server/queries/programs";

export const metadata: Metadata = { title: "Ejercicio" };

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "diseno", label: "Diseño" },
  { key: "resultados", label: "Resultados" },
  { key: "adjuntos", label: "Adjuntos" },
  { key: "aprendizaje", label: "Aprendizaje" },
  { key: "actividad", label: "Actividad" },
] as const;

export default async function ExperimentPage({ params, searchParams }: PageProps<"/programas/[programId]/ejercicios/[experimentId]">) {
  const { programId, experimentId } = await params;
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "resumen";
  const ctx = await getProgramContext(programId);
  const e = await getExperiment(experimentId);
  if (!e || e.program_id !== programId) notFound();

  const [variants, learning, attachments, activity, calendar, lines] = await Promise.all([
    listVariants({ experimentId }),
    getLearning(experimentId),
    listAttachments("experiment", experimentId),
    listActivity({ programId, entityId: experimentId }),
    listCalendar(programId),
    listLines(programId),
  ]);

  const tctx = { experiment: e, variants, hasLearning: !!learning, calendar };
  const options: TransitionOption[] = availableTransitions(tctx, ctx.actor).map(({ to, check }) => ({
    to,
    ok: check.ok,
    reasons: check.ok ? [] : check.reasons,
    canForce: !check.ok && check.canForce,
    freezeName: check.freeze?.name ?? null,
  }));
  const duration = durationWarning({
    actual_start: e.actual_start,
    actual_end: e.actual_end ?? (e.status === "in_test" ? new Date().toISOString().slice(0, 10) : null),
    min_duration_days: e.min_duration_days,
  });
  const freeze = freezeWarning(plannedRange(e), calendar);
  const results = computeVariantResults(variants);
  const diff = headlineDiff(results);
  const canEdit = can.editExperiment(ctx.actor, e);
  const base = `/programas/${programId}`;
  const href = (t: string) => `${base}/ejercicios/${experimentId}?tab=${t}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={
          <Link href={`${base}/ejercicios`} className="hover:underline">
            Backlog · {e.line_name}
          </Link>
        }
        title={e.title}
        description={
          <>
            Problema:{" "}
            <Link href={`${base}/problemas/${e.problem_id}`} className="underline underline-offset-4">
              {e.problem_title}
            </Link>{" "}
            · Métrica: {e.metric_name}
          </>
        }
        actions={
          <>
            {canEdit ? (
              <Button variant="outline" asChild>
                <Link href={`${base}/ejercicios/${experimentId}/editar`}>
                  <Pencil aria-hidden /> Editar
                </Link>
              </Button>
            ) : null}
            {can.deleteExperiment(ctx.actor, e) ? (
              <DeleteButton entity="experiment" id={e.id} programId={programId} name={e.title} redirectTo={`${base}/ejercicios`} />
            ) : null}
          </>
        }
      />

      <Section className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={e.status} className="h-7 text-sm" />
          <span className="text-xs text-soft">
            {daysInStatus(e.status_changed_at)} día(s) en {STATUS_LABEL[e.status]}
          </span>
          <span className="ml-auto text-sm">
            Puntaje final <strong className="text-lg tabular-nums">{formatScore(e.final_score)}</strong>
          </span>
        </div>
        <div className="mt-4">
          <TransitionBar
            programId={programId}
            experimentId={experimentId}
            status={e.status}
            options={options}
            durationWarning={duration}
            decide={
              e.status === "in_reading"
                ? {
                    programId,
                    experimentId,
                    decisionRule: e.decision_rule,
                    lines,
                    ownLineId: e.line_id,
                    canDecide: can.decide(ctx.actor),
                    missingResults: !hasCompleteResults(variants),
                    durationWarning: duration,
                  }
                : null
            }
          />
        </div>
      </Section>

      <nav aria-label="Secciones del ejercicio" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "relative -mb-px border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-soft hover:text-ink",
              tab === t.key && "border-highlight font-medium text-ink",
            )}
          >
            {t.label}
            {t.key === "adjuntos" && attachments.length ? <span className="ml-1 tabular-nums">({attachments.length})</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "resumen" ? (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Section title="Hipótesis">
            <dl className="space-y-3 text-sm">
              {(
                [
                  ["SI", e.hypothesis_if],
                  ["ENTONCES", e.hypothesis_then],
                  ["PORQUE", e.hypothesis_because],
                ] as const
              ).map(([k, val]) => (
                <div key={k} className="grid grid-cols-[90px_1fr] gap-2">
                  <dt className="text-xs font-semibold tracking-wide text-soft">{k}</dt>
                  <dd>{val || <span className="text-soft">Sin completar</span>}</dd>
                </div>
              ))}
            </dl>
          </Section>
          <Section title="Priorización">
            <dl className="grid grid-cols-2 gap-2 text-sm tabular-nums">
              <dt className="text-soft">Impacto</dt>
              <dd>{e.impact ?? "—"}</dd>
              <dt className="text-soft">Confianza</dt>
              <dd>{e.confidence ?? "—"}</dd>
              <dt className="text-soft">Facilidad</dt>
              <dd>{e.ease ?? "—"}</dd>
              <dt className="text-soft">ICE</dt>
              <dd className="font-medium">{formatScore(e.ice_score)}</dd>
              <dt className="text-soft">Calendario</dt>
              <dd>{e.fits_calendar ? "Sí, antes de los picos" : "No"}</dd>
              <dt className="text-soft">Control</dt>
              <dd>{CONTROL_LABEL[e.control]}</dd>
              <dt className="text-soft">Puntaje final</dt>
              <dd className="font-semibold">{formatScore(e.final_score)}</dd>
            </dl>
          </Section>
          <Section title="Responsable y fechas">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-soft">Responsable</dt>
              <dd>{e.owner_name ?? "Sin asignar"}</dd>
              <dt className="text-soft">Tipo</dt>
              <dd>{e.owner_type ? OWNER_TYPE_LABEL[e.owner_type] : "—"}</dd>
              <dt className="text-soft">Planeado</dt>
              <dd>{formatDateRange(e.planned_start, e.planned_end)}</dd>
              <dt className="text-soft">Real</dt>
              <dd>{e.actual_start ? formatDateRange(e.actual_start, e.actual_end) : "—"}</dd>
            </dl>
            {freeze && !isLaunched(e.status) ? (
              <Callout className="mt-3" icon={Snowflake}>
                {freeze}
              </Callout>
            ) : null}
          </Section>
          {e.verdict || e.decision ? (
            <Section title="Resultado">
              <div className="flex flex-wrap items-center gap-2">
                <VerdictBadge verdict={e.verdict} />
                <DecisionBadge decision={e.decision} />
                {diff != null ? <span className="text-sm font-medium tabular-nums">{formatSignedPercent(diff)} vs. control</span> : null}
              </div>
              {e.decision_rationale ? <p className="mt-2 text-sm">{e.decision_rationale}</p> : null}
            </Section>
          ) : null}
        </div>
      ) : null}

      {tab === "diseno" ? (
        <div className="space-y-4">
          <DesignLock
            programId={programId}
            experimentId={experimentId}
            lockedAt={e.design_locked_at}
            launched={isLaunched(e.status)}
            canUnlock={can.unlockDesign(ctx.actor)}
            canLock={canEdit}
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Prueba">
              <dl className="grid grid-cols-[160px_1fr] gap-2 text-sm">
                <dt className="text-soft">Tipo</dt>
                <dd>{e.test_type ? TEST_TYPE_LABEL[e.test_type] : "—"}</dd>
                <dt className="text-soft">Métrica principal</dt>
                <dd>{e.primary_metric ?? "—"}</dd>
                <dt className="text-soft">Métricas de control</dt>
                <dd>
                  {e.control_metrics.length ? (
                    <ul className="list-disc pl-4">
                      {e.control_metrics.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-soft">Duración mínima</dt>
                <dd>{e.min_duration_days ? `${e.min_duration_days} días` : "—"}</dd>
                <dt className="text-soft">Regla de decisión</dt>
                <dd>{e.decision_rule ?? "—"}</dd>
              </dl>
            </Section>
            <Section title={`Variantes (${variants.length})`}>
              <ul className="space-y-2 text-sm">
                {variants.map((v) => (
                  <li key={v.id} className="rounded-lg border px-3 py-2">
                    <div className="font-medium">
                      {v.name}
                      {v.is_control ? <span className="ml-2 rounded border px-1 text-[11px] text-soft">Control</span> : null}
                    </div>
                    {v.description ? <div className="text-xs text-soft">{v.description}</div> : null}
                  </li>
                ))}
                {!variants.length ? <li className="text-soft">Sin variantes todavía.</li> : null}
              </ul>
            </Section>
          </div>
          {canEdit && !e.design_locked_at ? (
            <Button variant="outline" asChild>
              <Link href={`${base}/ejercicios/${experimentId}/editar?paso=4`}>
                <Pencil aria-hidden /> Editar el diseño
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {tab === "resultados" ? (
        <Section
          title="Resultados por variante"
          description={e.decision_rule ? `Regla de decisión: ${e.decision_rule}` : undefined}
        >
          <ResultsEditor
            key={variants.map((v) => `${v.id}:${v.sample}:${v.conversions}:${v.metric_value}`).join("|")}
            programId={programId}
            experimentId={experimentId}
            variants={variants}
            canEdit={can.uploadResults(ctx.actor, e) && e.status !== "decided" && e.status !== "scaled"}
            isWinner={e.verdict === "winner"}
          />
        </Section>
      ) : null}

      {tab === "adjuntos" ? (
        <Section title="Adjuntos">
          <AttachmentList
            programId={programId}
            entityType="experiment"
            entityId={experimentId}
            items={attachments}
            canUpload={can.uploadResults(ctx.actor, e)}
          />
        </Section>
      ) : null}

      {tab === "aprendizaje" ? (
        <Section title="Aprendizaje">
          {learning ? (
            <>
              <LearningEditor
                programId={programId}
                learning={learning}
                lines={lines}
                ownLineId={e.line_id}
                canEdit={can.editStructure(ctx.actor)}
              />
              {can.createExperiment(ctx.actor) ? (
                <div className="mt-4 border-t pt-4">
                  <Button variant="outline" asChild>
                    <Link href={`${base}/ejercicios/nuevo?aprendizaje=${learning.id}`}>
                      <BookOpenCheck aria-hidden /> Crear ejercicio en otra línea desde este aprendizaje
                    </Link>
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-soft">
              El aprendizaje se registra al decidir el ejercicio. Cada ejercicio cerrado deja uno, y puede convertirse en hipótesis para otras
              líneas.
            </p>
          )}
        </Section>
      ) : null}

      {tab === "actividad" ? (
        <Section title="Actividad">
          {activity.length ? (
            <ol className="space-y-3">
              {activity.map((a) => (
                <li key={a.id} className="border-l-2 pl-3 text-sm">
                  <div>{a.summary}</div>
                  {typeof a.payload.justification === "string" ? (
                    <div className="text-xs text-soft">Justificación: {a.payload.justification}</div>
                  ) : null}
                  <div className="text-xs text-soft">
                    {a.actor_name ?? "Sistema"} · {formatDateTime(a.created_at)}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-soft">Sin actividad registrada.</p>
          )}
          <p className="mt-4 text-xs text-soft">Creado el {formatDate(e.created_at.slice(0, 10))}.</p>
        </Section>
      ) : null}
    </div>
  );
}
