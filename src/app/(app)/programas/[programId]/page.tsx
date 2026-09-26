import { CalendarClock, CheckCircle2, Circle, Flag, Snowflake, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { PageHeader, Section, Stat } from "@/components/app/page";
import { StatusBadge } from "@/components/app/status-badge";
import { JourneyStrip } from "@/components/brand/journey-strip";
import { Button } from "@/components/ui/button";
import { CALENDAR_EVENT_LABEL } from "@/domain/labels";
import { isActive, isClosed } from "@/domain/lifecycle";
import { formatDate, formatDateRange, formatPercent } from "@/domain/format";
import { journeyStages } from "@/domain/journey";
import { onboardingComplete, onboardingSteps } from "@/domain/onboarding";
import { can } from "@/domain/permissions";
import { summarizeResults } from "@/domain/dashboards";
import { todayIso } from "@/domain/dates";
import { getProgramContext } from "@/server/auth";
import { listExperiments, listVariants } from "@/server/queries/experiments";
import { listCalendar, listHorizons, listLines, onboardingCounts } from "@/server/queries/programs";

export default async function ProgramOverviewPage({ params }: PageProps<"/programas/[programId]">) {
  const { programId } = await params;
  const ctx = await getProgramContext(programId);
  const [counts, experiments, variants, calendar, lines, horizons] = await Promise.all([
    onboardingCounts(programId),
    listExperiments(programId),
    listVariants({ programId }),
    listCalendar(programId),
    listLines(programId),
    listHorizons(programId),
  ]);
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
  const nextUp = experiments.filter((e) => e.status === "prioritized" || e.status === "in_design").slice(0, 5);

  return (
    <div className="rise mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Resumen del programa"
        title={ctx.program.name}
        description={
          <>
            {ctx.program.description ? <span className="block">{ctx.program.description}</span> : null}
            <span>
              {formatDateRange(ctx.program.start_date, ctx.program.end_date)}
              {horizons.length ? ` · ${horizons.map((h) => `${h.name}: ${formatDateRange(h.start_date, h.end_date)}`).join(" · ")}` : ""}
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

      {!ctx.program.setup_completed_at && !ctx.program.is_demo && can.editStructure(ctx.actor) ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-highlight bg-highlight/15 shadow-card px-4 py-3 text-sm">
          <span className="inline-flex items-center gap-2">
            <TriangleAlert className="size-4" aria-hidden /> La configuración del programa quedó a medio camino. Retómela sin afán.
          </span>
          <Button size="sm" asChild>
            <Link href={`${base}/configuracion`}>Retome la configuración</Link>
          </Button>
        </div>
      ) : null}

      {showChecklist ? (
        <Section
          className="mb-6"
          title="Primeros pasos"
          description="Esta lista se va sola cuando complete todo. Paso a paso se sube la montaña."
        >
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
        </Section>
      ) : null}

      <div className="mb-6">
        <JourneyStrip
          programId={programId}
          stages={journeyStages({
            metrics: counts.linesWithNorthStar + counts.inputMetrics,
            problems: counts.problems,
            experiments,
          })}
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ejercicios activos" value={experiments.filter((e) => isActive(e.status)).length} hint="Priorizados a En lectura" />
        <Stat label="En prueba ahora" value={inTest.length} highlight={inTest.length > 0} />
        <Stat label="Cerrados" value={experiments.filter((e) => isClosed(e.status)).length} />
        <Stat label="Win rate" value={formatPercent(summary.winRate)} hint={`${summary.winners} ganador(es)`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="En prueba y en lectura"
          actions={
            <Link href={`${base}/tableros/kanban`} className="text-xs underline underline-offset-4">
              Ver Kanban
            </Link>
          }
        >
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
        </Section>

        <Section
          title="Calendario comercial"
          description="Picos, congelamientos y punto de decisión."
          actions={
            <Link href={`${base}/tableros/gantt`} className="text-xs underline underline-offset-4">
              Ver Gantt
            </Link>
          }
        >
          {upcoming.length ? (
            <ul className="space-y-2 text-sm">
              {upcoming.map((e) => {
                const Icon = e.type === "freeze" ? Snowflake : e.type === "decision" ? Flag : CalendarClock;
                return (
                  <li key={e.id} className="flex items-center gap-2">
                    <Icon aria-hidden className={e.type === "decision" ? "size-4 text-ink" : "size-4 text-soft"} />
                    <span className={e.type === "decision" ? "font-medium" : undefined}>{e.name}</span>
                    <span className="text-xs text-soft">
                      {CALENDAR_EVENT_LABEL[e.type]} ·{" "}
                      {e.start_date === e.end_date ? formatDate(e.start_date) : formatDateRange(e.start_date, e.end_date)}
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
        </Section>

        <Section
          title="Siguientes en la fila"
          description="Priorizados y en diseño, por puntaje final."
          actions={
            <Link href={`${base}/ejercicios`} className="text-xs underline underline-offset-4">
              Ver backlog
            </Link>
          }
        >
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
        </Section>

        <Section title="Líneas de negocio">
          {lines.length ? (
            <ul className="divide-y">
              {lines.map((l) => {
                const n = experiments.filter((e) => e.line_id === l.id && e.status !== "discarded").length;
                return (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <Link href={`${base}/lineas/${l.id}`} className="hover:underline">
                      {l.name}
                    </Link>
                    <span className="inline-flex items-center gap-1 text-xs tabular-nums">
                      {n === 0 ? <TriangleAlert className="size-3.5" aria-label="Sin ejercicios" /> : null}
                      {n} ejercicio(s)
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-soft">Todavía no hay líneas. Arranque por la configuración.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
