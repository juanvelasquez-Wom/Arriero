import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  Circle,
  Flag,
  FlaskConical,
  Hourglass,
  Lightbulb,
  ListOrdered,
  OctagonAlert,
  PartyPopper,
  Snowflake,
  Sparkles,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Fold } from "@/components/app/fold";
import { Term } from "@/components/app/info-tip";
import { PageHeader, Section } from "@/components/app/page";
import { StatusBadge } from "@/components/app/status-badge";
import { JourneyStrip } from "@/components/brand/journey-strip";
import { TargetStatusSummary } from "@/components/lines/target-status";
import { TiaOpportunities } from "@/components/tia/tia-opportunities";
import { Button } from "@/components/ui/button";
import { CALENDAR_EVENT_LABEL } from "@/domain/labels";
import { formatDate, formatDateRange, formatPercent } from "@/domain/format";
import { journeyStages } from "@/domain/journey";
import { onboardingComplete, onboardingSteps } from "@/domain/onboarding";
import { can } from "@/domain/permissions";
import { summarizeResults } from "@/domain/dashboards";
import { todayIso } from "@/domain/dates";
import { TIA_ENABLED } from "@/domain/tia";
import { homeItems, problemFromMetricPath, type HomeItemKind } from "@/domain/home";
import { evaluateTarget, type TargetEvaluation } from "@/domain/targets";
import { getProgramContext } from "@/server/auth";
import { listExperiments, listVariants } from "@/server/queries/experiments";
import { listCalendar, listHorizons, listLines, onboardingCounts } from "@/server/queries/programs";
import { listLearnings, listMetrics, listMetricValues } from "@/server/queries/structure";
import { tiaConfigured } from "@/server/tia/client";

const HOME_ICON: Record<HomeItemKind, LucideIcon> = {
  north_star_off_track: OctagonAlert,
  ready_to_read: BookOpenCheck,
  calendar_soon: Snowflake,
  assigned: UserRound,
  learning_to_try: Lightbulb,
  stale_ideas: Hourglass,
};

export default async function ProgramOverviewPage({ params }: PageProps<"/programas/[programId]">) {
  const { programId } = await params;
  const ctx = await getProgramContext(programId);
  const [counts, experiments, variants, calendar, lines, horizons, metrics, learnings] = await Promise.all([
    onboardingCounts(programId),
    listExperiments(programId),
    listVariants({ programId }),
    listCalendar(programId),
    listLines(programId),
    listHorizons(programId),
    listMetrics({ programId }),
    listLearnings(programId),
  ]);
  const northStars = metrics.filter((m) => m.type === "north_star");
  const northValues = northStars.length ? await listMetricValues({ metricIds: northStars.map((m) => m.id) }) : [];
  const steps = onboardingSteps(counts);
  const showChecklist = !onboardingComplete(counts);
  const base = `/programas/${programId}`;
  const stepHref: Record<string, string> = {
    lines: `${base}/configuracion?paso=lineas`,
    north_star: lines[0] ? `${base}/lineas/${lines[0].id}?tab=norte` : `${base}/configuracion?paso=lineas`,
    tree: lines[0] ? `${base}/lineas/${lines[0].id}?tab=arbol` : `${base}/configuracion?paso=lineas`,
    funnel: lines[0] ? `${base}/lineas/${lines[0].id}?tab=embudo` : `${base}/configuracion?paso=lineas`,
    problem: `${base}/problemas/nuevo`,
    experiment: `${base}/ejercicios/nuevo`,
  };

  const summary = summarizeResults(
    experiments.map((e) => ({ ...e, variants: variants.filter((v) => v.experiment_id === e.id) })),
  );
  const today = todayIso();
  const upcoming = calendar.filter((e) => e.end_date >= today).slice(0, 5);
  const inTest = experiments.filter((e) => e.status === "in_test" || e.status === "in_reading");

  // Semáforo de la métrica norte de cada línea.
  const northBy = new Map<string, { metric: (typeof northStars)[number]; evaluation: TargetEvaluation }>();
  for (const m of northStars) {
    northBy.set(m.line_id, {
      metric: m,
      evaluation: evaluateTarget({
        baseline: m.baseline,
        direction: m.direction,
        targets: m.targets,
        horizons,
        values: northValues.filter((v) => v.metric_id === m.id),
        today,
        programStart: ctx.program.start_date,
      }),
    });
  }
  const lineName = new Map(lines.map((l) => [l.id, l.name]));
  const todo = homeItems({
    today,
    userId: ctx.user.id,
    northStars: [...northBy.values()].map(({ metric, evaluation }) => ({
      metricId: metric.id,
      lineId: metric.line_id,
      lineName: lineName.get(metric.line_id) ?? "",
      metricName: metric.name,
      status: evaluation.status,
      gap: evaluation.gap,
    })),
    experiments,
    calendar,
    lines,
    learnings: learnings.map((l) => ({
      id: l.id,
      lineId: l.line_id,
      lineName: l.line_name,
      appliesToLineIds: l.applies_to_line_ids,
    })),
  });
  const nextUp = experiments.filter((e) => e.status === "prioritized" || e.status === "in_design").slice(0, 5);

  const TODAY_MAX = 3;
  const todoTop = todo.slice(0, TODAY_MAX);
  const todoRest = todo.slice(TODAY_MAX);
  const doneSteps = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);
  const nextEvent = upcoming[0];
  const setupPending = !ctx.program.setup_completed_at && !ctx.program.is_demo && can.editStructure(ctx.actor);

  const todoRow = (item: (typeof todo)[number]) => {
    const Icon = HOME_ICON[item.kind];
    const urgent = item.kind === "north_star_off_track" || item.kind === "ready_to_read";
    return (
      <li key={item.key} className="flex flex-wrap items-start gap-3 py-2.5 sm:flex-nowrap">
        <span
          aria-hidden
          className={
            urgent
              ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-highlight text-[#1f1f1f]"
              : "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-wash text-ink"
          }
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`${base}${item.path}`} className="font-medium hover:underline">
            {item.title}
          </Link>
          <p className="text-xs text-soft">{item.detail}</p>
        </div>
        {item.secondary ? (
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={`${base}${item.secondary.path}`}>{item.secondary.label}</Link>
          </Button>
        ) : null}
      </li>
    );
  };

  return (
    <div className="rise mx-auto max-w-6xl space-y-5">
      <PageHeader
        className="mb-2"
        eyebrow="Resumen del programa"
        title={ctx.program.name}
        description={
          <>
            {ctx.program.description ? <span className="block">{ctx.program.description}</span> : null}
            <span>
              {formatDateRange(ctx.program.start_date, ctx.program.end_date)}
              {horizons.length ? ` · ${horizons.map((h) => h.name).join(", ")}` : ""}
            </span>
          </>
        }
        actions={
          can.createExperiment(ctx.actor) && counts.problems > 0 ? (
            <Button asChild>
              <Link href={`${base}/ejercicios/nuevo`}>
                <Sparkles aria-hidden /> Nuevo ejercicio
              </Link>
            </Button>
          ) : null
        }
      />

      {/* Solo mientras falte configurar: el siguiente paso a la vista y la lista completa plegada. */}
      {setupPending || (showChecklist && nextStep) ? (
        <section className="rounded-2xl border border-highlight bg-highlight/15 px-4 py-3 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="inline-flex min-w-0 items-center gap-2">
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              {setupPending ? (
                <span>La configuración quedó a medio camino. Retómela sin afán.</span>
              ) : nextStep ? (
                <span>
                  Primeros pasos · {doneSteps} de {steps.length}. Sigue: <strong>{nextStep.label}</strong>
                </span>
              ) : null}
            </span>
            <Button size="sm" asChild>
              <Link href={!setupPending && nextStep ? stepHref[nextStep.key] : `${base}/configuracion`}>
                {setupPending ? "Retome la configuración" : "Hágale"}
              </Link>
            </Button>
          </div>
          {showChecklist ? (
            <Fold bare title={`Ver los ${steps.length} primeros pasos`} className="mt-1">
              <ol className="grid gap-2 md:grid-cols-2">
                {steps.map((s, i) => (
                  <li key={s.key}>
                    <Link
                      href={stepHref[s.key]}
                      className="lift flex items-start gap-3 rounded-xl border bg-paper px-3 py-2.5 hover:border-ink/40"
                    >
                      {s.done ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-label="Completado" />
                      ) : (
                        <Circle className="mt-0.5 size-4 shrink-0 text-soft" aria-label="Pendiente" />
                      )}
                      <span>
                        <span className={s.done ? "text-soft line-through" : "font-medium"}>
                          {i + 1}. {s.label}
                        </span>
                        <span className="block text-xs text-soft">{s.hint}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </Fold>
          ) : null}
        </section>
      ) : null}

      <Section title="Lo que toca hoy" description="Lo más urgente primero.">
        {todo.length ? (
          <>
            <ol className="divide-y">{todoTop.map(todoRow)}</ol>
            {todoRest.length ? (
              <Fold bare title={`Ver ${todoRest.length} más`} className="mt-1 border-t pt-1">
                <ol className="divide-y">{todoRest.map(todoRow)}</ol>
              </Fold>
            ) : null}
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm text-soft">
            <PartyPopper aria-hidden className="size-4" /> Nada urgente por hoy. ¡Qué belleza! Aproveche para alimentar el backlog.
          </p>
        )}
      </Section>

      <section aria-labelledby="salud-titulo">
        <h2 id="salud-titulo" className="mb-2 text-base font-bold">
          <Term k="northStar">Métrica norte</Term> por línea
        </h2>
        {lines.length ? (
          <ul className="stagger grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lines.map((l) => {
              const n = experiments.filter((e) => e.line_id === l.id && e.status !== "discarded").length;
              const north = northBy.get(l.id);
              return (
                <li key={l.id} className="rounded-2xl border bg-paper px-4 py-3 text-sm shadow-card">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`${base}/lineas/${l.id}`} className="truncate font-semibold hover:underline">
                      {l.name}
                    </Link>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-soft tabular-nums">
                      {n === 0 ? <TriangleAlert className="size-3.5" aria-label="Sin ejercicios" /> : null}
                      {n} ejercicio{n === 1 ? "" : "s"}
                    </span>
                  </div>
                  {north ? (
                    <div className="mt-1">
                      <div className="truncate text-xs text-soft">{north.metric.name}</div>
                      <TargetStatusSummary
                        evaluation={north.evaluation}
                        unit={north.metric.unit}
                        compact
                        problemHref={`${base}${problemFromMetricPath(north.metric.id)}`}
                      />
                    </div>
                  ) : (
                    <Link href={`${base}/lineas/${l.id}?tab=norte`} className="mt-1 block text-xs text-soft underline underline-offset-4">
                      Sin métrica norte: defínala
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-soft">Todavía no hay líneas. Arranque por la configuración.</p>
        )}
      </section>

      <nav aria-label="Más del programa" className="grid gap-2 sm:grid-cols-3">
        <QuickLink
          href={`${base}/tableros/kanban`}
          icon={FlaskConical}
          label="En prueba y en lectura"
          value={inTest.length}
          hint={inTest.length ? "Ver en el Kanban" : "Nada corriendo: lance el siguiente"}
        />
        <QuickLink
          href={`${base}/ejercicios`}
          icon={ListOrdered}
          label="Siguientes en la fila"
          value={nextUp.length}
          hint={nextUp[0] ? `Primero: ${nextUp[0].title}` : "Ver el backlog"}
        />
        <QuickLink
          href={`${base}/tableros/gantt`}
          icon={CalendarClock}
          label="Calendario comercial"
          value={nextEvent ? formatDate(nextEvent.start_date) : "—"}
          hint={nextEvent ? `${CALENDAR_EVENT_LABEL[nextEvent.type]}: ${nextEvent.name}` : "Sin eventos próximos"}
        />
      </nav>

      <div className="space-y-2">
        <Fold title="Detalle de lo que corre, la fila y el calendario">
          <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
            <div>
              <h3 className="mb-1 text-sm font-bold">En prueba y en lectura</h3>
              {inTest.length ? (
                <ul className="divide-y">
                  {inTest.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                      <Link href={`${base}/ejercicios/${e.id}`} className="min-w-0 truncate text-sm hover:underline">
                        {e.title}
                        <span className="block text-xs text-soft">
                          {e.line_name} · {formatDateRange(e.actual_start ?? e.planned_start, e.planned_end)}
                        </span>
                      </Link>
                      <StatusBadge status={e.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-soft">No hay ejercicios corriendo. Revise el backlog y lance el siguiente: probemos por ahí.</p>
              )}
            </div>
            <div>
              <h3 className="mb-1 text-sm font-bold">Siguientes en la fila</h3>
              {nextUp.length ? (
                <ul className="divide-y">
                  {nextUp.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <Link href={`${base}/ejercicios/${e.id}`} className="min-w-0 truncate hover:underline">
                        {e.title}
                      </Link>
                      <span className="tabular-nums font-medium">{e.final_score ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-soft">La fila está vacía: todavía no hay ejercicios priorizados. ¡A camellar!</p>
              )}
            </div>
            <div>
              <h3 className="mb-1 text-sm font-bold">Calendario y horizontes</h3>
              {upcoming.length ? (
                <ul className="space-y-2 text-sm">
                  {upcoming.map((e) => {
                    const Icon = e.type === "freeze" ? Snowflake : e.type === "decision" ? Flag : CalendarClock;
                    return (
                      <li key={e.id} className="flex items-start gap-2">
                        <Icon aria-hidden className={e.type === "decision" ? "mt-0.5 size-4 shrink-0 text-ink" : "mt-0.5 size-4 shrink-0 text-soft"} />
                        <span className="min-w-0">
                          <span className={e.type === "decision" ? "font-medium" : undefined}>{e.name}</span>
                          <span className="block text-xs text-soft">
                            {CALENDAR_EVENT_LABEL[e.type]} ·{" "}
                            {e.start_date === e.end_date ? formatDate(e.start_date) : formatDateRange(e.start_date, e.end_date)}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-soft">
                  Sin eventos próximos: camino despejado.{" "}
                  {can.editCalendar(ctx.actor) ? (
                    <Link href={`${base}/configuracion?paso=calendario`} className="underline underline-offset-4">
                      Configure el calendario
                    </Link>
                  ) : null}
                </p>
              )}
              {horizons.length ? (
                <ul className="mt-3 space-y-0.5 border-t pt-2 text-xs text-soft">
                  {horizons.map((h) => (
                    <li key={h.id}>
                      <span className="font-medium text-ink">{h.name}</span>: {formatDateRange(h.start_date, h.end_date)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </Fold>

        {TIA_ENABLED && (counts.problems > 0 || northStars.length > 0) ? (
          <Fold title="Pregúntele a la Tía dónde ve oportunidades">
            <TiaOpportunities programId={programId} configured={tiaConfigured()} canCreateProblem={can.createProblem(ctx.actor)} />
          </Fold>
        ) : null}

        <Fold
          title="El camino del arriero"
          hint={summary.winRate != null ? `acierto ${formatPercent(summary.winRate)}` : undefined}
        >
          <JourneyStrip
            programId={programId}
            stages={journeyStages({
              metrics: counts.linesWithNorthStar + counts.inputMetrics,
              problems: counts.problems,
              experiments,
            })}
            note={
              summary.winRate != null
                ? `Tasa de acierto: ${formatPercent(summary.winRate)} · ${summary.winners} ganador${summary.winners === 1 ? "" : "es"}`
                : undefined
            }
          />
        </Fold>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
  value,
  hint,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint: string;
}) {
  return (
    <Link href={href} className="lift group flex items-center gap-3 rounded-2xl border bg-paper px-4 py-3 shadow-card hover:border-ink/40">
      <Icon aria-hidden className="size-5 shrink-0 text-soft" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-soft">{label}</span>
        <span className="block font-heading text-lg font-extrabold tabular-nums">{value}</span>
        <span className="block truncate text-xs text-soft">{hint}</span>
      </span>
      <ArrowRight aria-hidden className="size-4 shrink-0 text-soft transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
