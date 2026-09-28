import { BookOpenCheck, CalendarClock, CircleCheck, GitMerge, Hourglass, Pencil, ShieldAlert, Snowflake, TrendingDown, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AttachmentList } from "@/components/app/attachments";
import { Term } from "@/components/app/info-tip";
import { DeleteButton } from "@/components/app/delete-button";
import { Fold } from "@/components/app/fold";
import { ViewTabs, type ViewTab } from "@/components/app/view-tabs";
import { Callout, PageHeader, Section } from "@/components/app/page";
import { DecisionBadge, StatusBadge, VerdictBadge } from "@/components/app/status-badge";
import { ExperimentComments } from "@/components/experiments/comments";
import { DesignLock } from "@/components/experiments/design-lock";
import { LearningEditor } from "@/components/experiments/learning-editor";
import { ResultsEditor } from "@/components/experiments/results-editor";
import { TransitionBar, type TransitionOption } from "@/components/experiments/transition-bar";
import { Button } from "@/components/ui/button";
import { durationWarning, freezeWarning, plannedRange, readiness } from "@/domain/calendar";
import { canDeleteComment } from "@/domain/comments";
import { todayIso } from "@/domain/dates";
import { asCollisionCandidate, collisionsFor, describeCollision } from "@/domain/collisions";
import { brokenGuardrailMessages, describeGuardrail, evaluateGuardrails, type ExperimentGuardrail } from "@/domain/experiment-guardrails";
import { powerShortfall } from "@/domain/experiment-power";
import { formatDate, formatDateRange, formatDateTime, formatMetricValue, formatScore, formatSignedPercent } from "@/domain/format";
import { checkPostScale } from "@/domain/post-scale";
import { CONTROL_LABEL, OWNER_TYPE_LABEL, STATUS_LABEL, TEST_TYPE_LABEL } from "@/domain/labels";
import { availableTransitions, daysInStatus, isLaunched } from "@/domain/lifecycle";
import { can } from "@/domain/permissions";
import { draftLearning, hasCompleteResults, readExperiment } from "@/domain/results";
import { analyzeExperiment, DIRECTIONAL_LABEL, formatProbability, isReliableWinner, winnerNeedsWarning } from "@/domain/stats";
import { formatValueRange, UNIT_VALUE_HINT } from "@/domain/value";
import { cn } from "@/lib/utils";
import { getProgramContext } from "@/server/auth";
import { listComments } from "@/server/queries/comments";
import {
  getExperiment,
  getExperimentRigor,
  getLearning,
  listActivity,
  listAttachments,
  listExperiments,
  listMetricEconomics,
  listMetricWeeklyValues,
  listVariants,
} from "@/server/queries/experiments";
import { listCalendar, listLines } from "@/server/queries/programs";

export const metadata: Metadata = { title: "Ejercicio" };

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "diseno", label: "Diseño" },
  { key: "resultados", label: "Resultados" },
  { key: "adjuntos", label: "Adjuntos" },
  { key: "aprendizaje", label: "Aprendizaje" },
  { key: "conversacion", label: "Conversación" },
  { key: "actividad", label: "Actividad" },
] as const;

export default async function ExperimentPage({ params, searchParams }: PageProps<"/programas/[programId]/ejercicios/[experimentId]">) {
  const { programId, experimentId } = await params;
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "resumen";
  const ctx = await getProgramContext(programId);
  const e = await getExperiment(experimentId);
  if (!e || e.program_id !== programId) notFound();

  const [variants, learning, attachments, activity, calendar, lines, commentsResult, economics, rigor, programExperiments, weekly] = await Promise.all([
    listVariants({ experimentId }),
    getLearning(experimentId),
    listAttachments("experiment", experimentId),
    listActivity({ programId, entityId: experimentId }),
    listCalendar(programId),
    listLines(programId),
    listComments(experimentId),
    listMetricEconomics([e.metric_id]),
    getExperimentRigor(experimentId),
    listExperiments(programId),
    e.status === "scaled" ? listMetricWeeklyValues(e.metric_id) : Promise.resolve([]),
  ]);
  const metricEconomics = economics.get(e.metric_id) ?? null;
  const today = todayIso();

  // X2 · Cruces con otros ejercicios de la misma línea (misma etapa o canal, fechas cruzadas).
  const collisions = collisionsFor(asCollisionCandidate(e), programExperiments.map(asCollisionCandidate), today);
  const collisionItems = collisions.map(
    (c) => `«${c.otherTitle}» (${STATUS_LABEL[c.otherStatus]}): ${describeCollision(c).toLowerCase()} del ${formatDateRange(c.from, c.to)}.`,
  );
  // X1 · Potencia y guardrails.
  const shortfall = powerShortfall(rigor.power_result, rigor.expected_effect_pct);
  const guardrails: ExperimentGuardrail[] = rigor.guardrails.map((g) => ({
    id: g.id,
    metric_id: g.metric_id,
    metric_name: g.metric_name,
    direction: g.direction,
    limit_pct: g.limit_pct,
    note: g.note,
  }));
  const guardrailReadings = evaluateGuardrails(guardrails, variants);
  const brokenGuardrails = brokenGuardrailMessages(guardrailReadings);
  const rigorWarnings = [...(shortfall ? [shortfall] : []), ...brokenGuardrails];
  // Verificación posterior al escalado (evidencia direccional).
  const postScale =
    e.status === "scaled" ? checkPostScale({ decidedAt: e.decided_at, direction: metricEconomics?.direction ?? "up", values: weekly, today }) : null;

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
    actual_end: e.actual_end ?? (e.status === "in_test" ? today : null),
    min_duration_days: e.min_duration_days,
  });
  const freeze = freezeWarning(plannedRange(e), calendar);
  const ready = readiness(e, today);
  const reading = readExperiment({ variants, testType: e.test_type, metric: metricEconomics });
  const stats = analyzeExperiment({ variants, testType: e.test_type, direction: metricEconomics?.direction });
  const headline = reading.headline;
  const diff = headline?.diffVsControl ?? null;
  const commentItems = commentsResult.comments.map((c) => ({
    id: c.id,
    body: c.body,
    author_name: c.author_name,
    created_at: c.created_at,
    own: c.created_by === ctx.actor.userId,
    canDelete: canDeleteComment(ctx.actor, c),
  }));
  const daysHere = daysInStatus(e.status_changed_at);
  const canEdit = can.editExperiment(ctx.actor, e);
  const base = `/programas/${programId}`;
  const href = (t: string) => `${base}/ejercicios/${experimentId}?tab=${t}`;

  const verdictLine =
    e.verdict || e.decision ? (
      <div className="flex flex-wrap items-center gap-2">
        <VerdictBadge verdict={e.verdict} />
        <DecisionBadge decision={e.decision} />
        {diff != null ? <span className="text-sm font-medium tabular-nums">{formatSignedPercent(diff)} vs. control</span> : null}
      </div>
    ) : null;

  const tabs: ViewTab[] = TABS.map((t) => ({
    key: t.key,
    label: t.label,
    href: href(t.key),
    count: t.key === "adjuntos" ? attachments.length : t.key === "conversacion" ? commentItems.length : undefined,
    attention:
      (t.key === "resultados" && (brokenGuardrails.length > 0 || postScale?.status === "not_held")) ||
      (t.key === "diseno" && !!shortfall && !isLaunched(e.status)),
  }));

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

      {/* Arriba solo lo esencial: estado, tres datos clave y el siguiente paso. */}
      <Section className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={e.status} className="h-7 text-sm" />
          <span className="text-xs text-soft">
            {daysHere} {daysHere === 1 ? "día" : "días"} en {STATUS_LABEL[e.status]}
          </span>
          {ready ? (
            <span
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap",
                ready.kind === "ready" ? "border-highlight bg-highlight text-[#1F1F1F]" : "border-line bg-wash text-ink",
              )}
            >
              {ready.kind === "ready" ? (
                <CircleCheck aria-hidden className="size-3.5" />
              ) : ready.kind === "waiting" ? (
                <Hourglass aria-hidden className="size-3.5" />
              ) : (
                <CalendarClock aria-hidden className="size-3.5" />
              )}
              {ready.label}
              {ready.kind === "waiting" || ready.kind === "ready" ? (
                <span className="font-normal opacity-80">
                  · {ready.days} {ready.days === 1 ? "día" : "días"} corriendo
                </span>
              ) : null}
            </span>
          ) : null}
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <KeyFact label="Puntaje final">
            <span className="font-heading text-xl font-extrabold tabular-nums">{formatScore(e.final_score)}</span>
          </KeyFact>
          <KeyFact label="Responsable">{e.owner_name ?? <span className="text-soft">Sin asignar</span>}</KeyFact>
          <KeyFact label={e.actual_start ? "Fechas reales" : "Fechas planeadas"}>
            <span className="tabular-nums">
              {e.actual_start ? formatDateRange(e.actual_start, e.actual_end) : formatDateRange(e.planned_start, e.planned_end)}
            </span>
          </KeyFact>
        </dl>

        <div className="mt-4 border-t pt-4">
          <TransitionBar
            programId={programId}
            experimentId={experimentId}
            status={e.status}
            options={options}
            durationWarning={duration}
            warnings={[
              { to: "in_test", title: "Ojo: este ejercicio se cruza con otros", items: collisionItems },
              { to: "in_test", title: "Ojo con la potencia", items: shortfall ? [shortfall] : [] },
              { to: "scaled", title: "Ojo antes de escalar", items: brokenGuardrails },
            ]}
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
                    evidence: {
                      kind: reading.kind,
                      bestName: headline?.name ?? null,
                      probabilityLabel: headline?.stats.probability != null ? formatProbability(headline.stats.probability) : null,
                      bandLabel: headline?.stats.band?.label ?? null,
                      winnerNeedsWarning: winnerNeedsWarning(stats),
                      reliableWinner: isReliableWinner(stats),
                    },
                    learningDraft: draftLearning({ reading, metricName: e.metric_name }),
                    problemChannel: e.problem_channel,
                    taxonomyReady: rigor.ready,
                    rigorWarnings,
                  }
                : null
            }
          />
        </div>
      </Section>

      <ViewTabs label="Secciones del ejercicio" tabs={tabs} active={tab} />

      <div key={tab} className="slide-in">
        {tab === "resumen" ? (
          <div className="space-y-4">
            {/* En diseño los cruces ya los avisa la barra de arriba, antes de lanzar. */}
            {collisions.length && e.status !== "in_design" ? (
              <Callout icon={GitMerge} title={`Ojo: se cruza con ${collisions.length} ejercicio${collisions.length === 1 ? "" : "s"}`}>
                <Fold bare title="Ver con cuáles">
                  <ul className="space-y-1">
                    {collisions.map((c) => (
                      <li key={c.otherId}>
                        <Link href={`${base}/ejercicios/${c.otherId}`} className="font-medium underline underline-offset-2">
                          {c.otherTitle}
                        </Link>{" "}
                        <span className="text-soft">
                          ({STATUS_LABEL[c.otherStatus]}) · {describeCollision(c)} · {formatDateRange(c.from, c.to)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1">
                    Si los dos mueven la misma métrica al mismo tiempo, no se sabe cuál la movió. Separe las fechas o use otra etapa o canal.
                  </p>
                </Fold>
              </Callout>
            ) : null}
            {freeze && !isLaunched(e.status) ? <Callout icon={Snowflake}>{freeze}</Callout> : null}

            {verdictLine ? (
              <Section
                title="Resultado"
                actions={
                  <Link href={href("resultados")} className="text-xs underline underline-offset-4">
                    Ver el detalle
                  </Link>
                }
              >
                {verdictLine}
                {e.decision_rationale ? <p className="mt-2 text-sm">{e.decision_rationale}</p> : null}
              </Section>
            ) : null}

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
                    <dd>{val || <span className="text-soft">Falta completar</span>}</dd>
                  </div>
                ))}
              </dl>
            </Section>

            <Fold title="Priorización" hint={`ICE ${formatScore(e.ice_score)} · final ${formatScore(e.final_score)}`}>
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
            </Fold>

            <Fold title="Responsable y fechas" hint={e.owner_type ? OWNER_TYPE_LABEL[e.owner_type] : undefined}>
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
            </Fold>
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
            <div className="grid gap-4 lg:grid-cols-2">
              <Section title="Prueba">
                <dl className="grid grid-cols-[140px_1fr] gap-2 text-sm">
                  <dt className="text-soft">Tipo</dt>
                  <dd>{e.test_type ? TEST_TYPE_LABEL[e.test_type] : "—"}</dd>
                  <dt className="text-soft">Métrica principal</dt>
                  <dd>{e.primary_metric ?? "—"}</dd>
                  <dt className="text-soft">Duración mínima</dt>
                  <dd>{e.min_duration_days ? `${e.min_duration_days} días` : "—"}</dd>
                  <dt className="text-soft">Regla de decisión</dt>
                  <dd>{e.decision_rule ?? "—"}</dd>
                </dl>
                {shortfall ? (
                  <Callout className="mt-3" icon={TriangleAlert} title="Ojo con la potencia">
                    {shortfall}
                  </Callout>
                ) : null}
              </Section>
              <Section title={`Variantes (${variants.length})`}>
                <ul className="space-y-2 text-sm">
                  {variants.map((v) => (
                    <li key={v.id} className="rounded-xl border px-3 py-2">
                      <div className="font-medium">
                        {v.name}
                        {v.is_control ? <span className="ml-2 rounded border px-1 text-[11px] text-soft">Control</span> : null}
                      </div>
                      {v.description ? <div className="text-xs text-soft">{v.description}</div> : null}
                    </li>
                  ))}
                  {!variants.length ? <li className="text-soft">Todavía no hay variantes.</li> : null}
                </ul>
              </Section>
            </div>
            <Fold
              title="Métricas de control, potencia y guardrails"
              hint={rigor.ready && guardrails.length ? `${guardrails.length} guardrail${guardrails.length === 1 ? "" : "s"}` : undefined}
            >
              <dl className="grid grid-cols-[140px_1fr] gap-2 text-sm">
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
                {rigor.ready ? (
                  <>
                    <dt className="text-soft">Efecto esperado</dt>
                    <dd className="tabular-nums">{rigor.expected_effect_pct != null ? `${formatScore(rigor.expected_effect_pct)} %` : "—"}</dd>
                    <dt className="text-soft">
                      <Term k="sampleSize">Potencia</Term>
                    </dt>
                    <dd className="tabular-nums">
                      {rigor.power_result?.mde_pct != null
                        ? `Ve cambios desde ${formatScore(rigor.power_result.mde_pct)} %${rigor.power_result.days_needed != null ? ` · necesita ≈ ${rigor.power_result.days_needed} días` : ""}`
                        : "—"}
                    </dd>
                    <dt className="text-soft">Guardrails</dt>
                    <dd>
                      {guardrails.length ? (
                        <ul className="list-disc pl-4">
                          {guardrails.map((g) => (
                            <li key={g.id}>
                              {g.metric_name}: {describeGuardrail(g).toLowerCase()}
                              {g.note ? <span className="text-soft"> · {g.note}</span> : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </>
                ) : null}
              </dl>
            </Fold>
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
          <div className="space-y-4">
            {verdictLine ? (
              <Section title="Resultado">
                {verdictLine}
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-soft">
                    <Term k="probabilityToWin" />
                  </dt>
                  <dd className="tabular-nums">
                    {reading.kind === "directional"
                      ? DIRECTIONAL_LABEL
                      : headline?.stats.probability != null
                        ? `${formatProbability(headline.stats.probability)} · ${headline.stats.band?.label ?? ""}`
                        : "Sin datos suficientes"}
                  </dd>
                  <dt className="text-soft">
                    <Term k="estimatedValue" />
                  </dt>
                  <dd className="tabular-nums">
                    {headline?.value_estimate ? (
                      formatValueRange(headline.value_conservative?.monthly ?? null, headline.value_estimate.monthly, "al mes")
                    ) : headline?.value_missing === "unit_value" ? (
                      <span className="text-soft">{UNIT_VALUE_HINT}</span>
                    ) : (
                      "—"
                    )}
                  </dd>
                </dl>
                {brokenGuardrails.length ? (
                  <Callout className="mt-3" icon={ShieldAlert} title="Guardrail roto">
                    {brokenGuardrails.join(" ")}
                  </Callout>
                ) : null}
                {e.decision_rationale ? <p className="mt-2 text-sm">{e.decision_rationale}</p> : null}
              </Section>
            ) : null}

            {postScale ? (
              <Section title="¿Se sostuvo después de escalar?" description={`${postScale.evidence}: la operación normal tiene muchas cosas pasando a la vez.`}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span
                    className={cn(
                      "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold",
                      postScale.status === "held" ? "border-highlight bg-highlight text-[#1F1F1F]" : "border-line bg-wash text-ink",
                    )}
                  >
                    {postScale.status === "held" ? (
                      <CircleCheck aria-hidden className="size-3.5" />
                    ) : postScale.status === "not_held" ? (
                      <TrendingDown aria-hidden className="size-3.5" />
                    ) : (
                      <Hourglass aria-hidden className="size-3.5" />
                    )}
                    {postScale.label}
                  </span>
                  <span>{postScale.message}</span>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm tabular-nums">
                  <div>
                    <dt className="text-xs text-soft">4 semanas antes</dt>
                    <dd>{formatMetricValue(postScale.before.mean, metricEconomics?.unit ?? null)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-soft">Semanas 1 a 4 después</dt>
                    <dd>
                      {formatMetricValue(postScale.after4.mean, metricEconomics?.unit ?? null)}
                      {postScale.after4.change != null ? <span className="text-soft"> ({formatSignedPercent(postScale.after4.change)})</span> : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-soft">Semanas 5 a 8 después</dt>
                    <dd>
                      {formatMetricValue(postScale.after8.mean, metricEconomics?.unit ?? null)}
                      {postScale.after8.change != null ? <span className="text-soft"> ({formatSignedPercent(postScale.after8.change)})</span> : null}
                    </dd>
                  </div>
                </dl>
              </Section>
            ) : null}

            <Section title="Resultados por variante" description={e.decision_rule ? `Regla de decisión: ${e.decision_rule}` : undefined}>
              <ResultsEditor
                key={variants.map((v) => `${v.id}:${v.sample}:${v.conversions}:${v.metric_value}`).join("|")}
                programId={programId}
                experimentId={experimentId}
                variants={variants}
                canEdit={can.uploadResults(ctx.actor, e) && e.status !== "decided" && e.status !== "scaled"}
                isWinner={e.verdict === "winner"}
                testType={e.test_type}
                metric={metricEconomics}
                guardrails={guardrails}
              />
            </Section>
          </div>
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
                  problemChannel={e.problem_channel}
                  taxonomyReady={rigor.ready}
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
                El aprendizaje se registra al decidir el ejercicio y puede volverse hipótesis en otras líneas. Si funciona, seguimos.
              </p>
            )}
          </Section>
        ) : null}

        {tab === "conversacion" ? (
          <Section title="Conversación" description="Dudas, contexto y lo que se vio en campo.">
            <ExperimentComments
              programId={programId}
              experimentId={experimentId}
              comments={commentItems}
              ready={commentsResult.ready}
              canPost={canEdit}
            />
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
              <p className="text-sm text-soft">Todavía no hay actividad registrada. Ahí vamos.</p>
            )}
            <p className="mt-4 text-xs text-soft">Creado el {formatDate(e.created_at.slice(0, 10))}.</p>
          </Section>
        ) : null}
      </div>
    </div>
  );
}

function KeyFact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border bg-wash/60 px-2.5 py-2">
      <dt className="truncate text-[11px] text-soft">{label}</dt>
      <dd className="mt-0.5 line-clamp-2 text-[13px] sm:text-sm">{children}</dd>
    </div>
  );
}
