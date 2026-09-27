import { ListOrdered, Plus, Snowflake } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeleteButton } from "@/components/app/delete-button";
import { ExportCsvButton } from "@/components/app/export-csv-button";
import { Term } from "@/components/app/info-tip";
import { EmptyState, PageHeader } from "@/components/app/page";
import { StatusBadge } from "@/components/app/status-badge";
import { UrlFilters } from "@/components/app/url-filters";
import { BacklogSelection, BulkActionBar, RowCheckbox, SelectAllCheckbox } from "@/components/experiments/backlog-bulk";
import { QuickIce } from "@/components/experiments/quick-ice";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { freezesOverlapping, plannedRange } from "@/domain/calendar";
import { toCsv } from "@/domain/csv";
import { todayIso } from "@/domain/dates";
import { formatScore } from "@/domain/format";
import {
  BACKLOG_VIEW_LABEL,
  BACKLOG_VIEWS,
  describeScoreFilters,
  matchesBacklogView,
  parseBacklogView,
} from "@/domain/home";
import { CONTROL_LABEL, STATUS_LABEL } from "@/domain/labels";
import { can } from "@/domain/permissions";
import { EXPERIMENT_STATUSES } from "@/domain/types";
import { cn } from "@/lib/utils";
import { getProgramContext } from "@/server/auth";
import { listExperiments, type ExperimentListItem } from "@/server/queries/experiments";
import { listCalendar, listLines, listMembers } from "@/server/queries/programs";

export const metadata: Metadata = { title: "Backlog de ejercicios" };

const CLOSED = ["decided", "scaled", "discarded"];

export default async function BacklogPage({ params, searchParams }: PageProps<"/programas/[programId]/ejercicios">) {
  const { programId } = await params;
  const sp = await searchParams;
  const ctx = await getProgramContext(programId);
  const [experiments, lines, members, calendar] = await Promise.all([
    listExperiments(programId),
    listLines(programId),
    listMembers(programId),
    listCalendar(programId),
  ]);
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const f = { linea: get("linea"), estado: get("estado"), responsable: get("responsable"), etapa: get("etapa"), q: get("q") };
  const view = parseBacklogView(sp.vista);
  const today = todayIso();
  // Sin vista ni estado, el backlog muestra lo abierto; los cerrados se ven con "Todos" o filtrando por estado.
  const defaultOpen = !f.estado && !view;
  const filtered = experiments
    .filter(
      (e) =>
        (!f.linea || e.line_id === f.linea) &&
        (f.estado ? e.status === f.estado && (!view || matchesBacklogView(e, view, today)) : matchesBacklogView(e, view, today)) &&
        (!f.responsable || e.owner_id === f.responsable) &&
        (!f.etapa || e.stage_name === f.etapa) &&
        (!f.q || `${e.title} ${e.problem_title}`.toLowerCase().includes(f.q.toLowerCase())),
    )
    .sort((a, b) => (b.final_score ?? -99) - (a.final_score ?? -99) || a.created_at.localeCompare(b.created_at));
  const stageNames = [...new Set(experiments.map((e) => e.stage_name).filter((s): s is string => !!s))];
  const base = `/programas/${programId}`;
  const canScore = can.scoreIce(ctx.actor);
  const canBulk = canScore;
  const scoring = ctx.program.scoring_config;
  const filtersText = (e: ExperimentListItem) => describeScoreFilters(e, scoring);

  const viewHref = (v: (typeof BACKLOG_VIEWS)[number] | null) => {
    const next = new URLSearchParams();
    for (const [k, val] of Object.entries(sp)) if (typeof val === "string" && k !== "vista") next.set(k, val);
    if (v) next.set("vista", v);
    return `${base}/ejercicios${next.size ? `?${next}` : ""}`;
  };

  const csv = toCsv(
    filtered.map((e, i) => ({ e, i })),
    [
      { header: "#", value: ({ i }) => i + 1 },
      { header: "Ejercicio", value: ({ e }) => e.title },
      { header: "Problema", value: ({ e }) => e.problem_title },
      { header: "Línea", value: ({ e }) => e.line_name },
      { header: "Etapa", value: ({ e }) => e.stage_name },
      { header: "Impacto", value: ({ e }) => e.impact },
      { header: "Confianza", value: ({ e }) => e.confidence },
      { header: "Facilidad", value: ({ e }) => e.ease },
      { header: "ICE", value: ({ e }) => e.ice_score },
      { header: "Calendario", value: ({ e }) => e.fits_calendar },
      { header: "Control", value: ({ e }) => CONTROL_LABEL[e.control] },
      { header: "Puntaje final", value: ({ e }) => e.final_score },
      { header: "Estado", value: ({ e }) => STATUS_LABEL[e.status] },
      { header: "Responsable", value: ({ e }) => e.owner_name },
    ],
  );
  const visibleIds = filtered.map((e) => e.id);
  const memberOptions = members.map((m) => ({ id: m.user_id, label: m.name }));

  const iceCell = (e: ExperimentListItem) =>
    canScore && !CLOSED.includes(e.status) ? (
      <QuickIce
        key={`${e.impact}-${e.confidence}-${e.ease}`}
        programId={programId}
        experimentId={e.id}
        title={e.title}
        values={{ impact: e.impact, confidence: e.confidence, ease: e.ease }}
      />
    ) : (
      <span className="text-sm tabular-nums">
        {e.impact ?? "—"} · {e.confidence ?? "—"} · {e.ease ?? "—"}
      </span>
    );

  const scoreCell = (e: ExperimentListItem) => {
    const crosses = freezesOverlapping(plannedRange(e), calendar);
    return (
      <span className="inline-flex items-center gap-1">
        {crosses.length ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Snowflake className="size-3.5" aria-label="Se cruza con un congelamiento" />
            </TooltipTrigger>
            <TooltipContent>Se cruza con {crosses.map((c) => c.name).join(", ")}</TooltipContent>
          </Tooltip>
        ) : null}
        {formatScore(e.final_score)}
      </span>
    );
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Backlog de ejercicios"
        description="Del dato al camino: ordenado por puntaje final (ICE + bono de calendario − penalidad de control)."
        actions={
          <>
            {experiments.length ? <ExportCsvButton csv={csv} name={["backlog", ctx.program.name, today]} /> : null}
            {can.createExperiment(ctx.actor) ? (
              <Button asChild>
                <Link href={`${base}/ejercicios/nuevo`}>
                  <Plus aria-hidden /> Nuevo ejercicio
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      {experiments.length === 0 ? (
        <EmptyState art="carriel-experimentos"
          icon={ListOrdered}
          title="Los ejercicios son los atajos. Todavía no hay ninguno."
          description="Cada ejercicio nace de un problema con evidencia. Cree uno desde un problema y priorícelo con ICE."
          action={
            <Button asChild variant="outline">
              <Link href={`${base}/problemas`}>Ir a los problemas</Link>
            </Button>
          }
        />
      ) : (
        <BacklogSelection>
          <nav aria-label="Vistas rápidas" className="mb-3 flex flex-wrap gap-2">
            {BACKLOG_VIEWS.map((v) => {
              const active = view === v;
              return (
                <Link
                  key={v}
                  href={active ? viewHref(null) : viewHref(v)}
                  aria-current={active ? "page" : undefined}
                  scroll={false}
                  className={cn(
                    "inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium",
                    active ? "border-ink bg-ink text-paper" : "bg-paper text-ink hover:bg-wash",
                  )}
                >
                  {BACKLOG_VIEW_LABEL[v]}
                </Link>
              );
            })}
          </nav>
          <UrlFilters
            search={{ param: "q", placeholder: "Título o problema" }}
            filters={[
              { param: "linea", label: "Línea", options: lines.map((l) => ({ value: l.id, label: l.name })) },
              { param: "estado", label: "Estado", options: EXPERIMENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })) },
              { param: "responsable", label: "Responsable", options: members.map((m) => ({ value: m.user_id, label: m.name })) },
              { param: "etapa", label: "Etapa", options: stageNames.map((s) => ({ value: s, label: s })) },
            ]}
          />
          {defaultOpen ? (
            <p className="mb-2 text-xs text-soft">
              Mostrando los ejercicios abiertos. Use “Todos” o filtre por estado para ver los decididos, escalados o descartados.
            </p>
          ) : null}

          {/* Celular: tarjetas */}
          <div className="space-y-3 md:hidden">
            {canBulk && filtered.length ? (
              <label className="flex items-center gap-2 text-sm text-soft">
                <SelectAllCheckbox ids={visibleIds} /> Seleccionar los {filtered.length} visibles
              </label>
            ) : null}
            {filtered.map((e, i) => (
              <article key={e.id} className="rounded-2xl border bg-paper p-3 shadow-card">
                <div className="flex items-start gap-2">
                  {canBulk ? (
                    <span className="pt-1">
                      <RowCheckbox id={e.id} title={e.title} />
                    </span>
                  ) : null}
                  <span className="pt-0.5 text-sm font-semibold tabular-nums text-soft">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`${base}/ejercicios/${e.id}`} className="font-medium hover:underline">
                      {e.title}
                    </Link>
                    <div className="text-xs text-soft">
                      {e.line_name}
                      {e.stage_name ? ` · ${e.stage_name}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold tabular-nums">{scoreCell(e)}</div>
                    <div className="text-[11px] text-soft">Puntaje</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                  <StatusBadge status={e.status} />
                  <span className="tabular-nums">ICE {formatScore(e.ice_score)}</span>
                  <span className="text-soft">{filtersText(e)}</span>
                  <span className="text-soft">{e.owner_name ?? "Sin asignar"}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  {iceCell(e)}
                  {can.deleteExperiment(ctx.actor, e) ? (
                    <DeleteButton entity="experiment" id={e.id} programId={programId} name={e.title} variant="ghost" iconOnly />
                  ) : null}
                </div>
              </article>
            ))}
            {filtered.length === 0 ? (
              <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-soft">
                Ningún ejercicio coincide con los filtros. Ese camino no era: pruebe con otros.
              </p>
            ) : null}
          </div>

          {/* Escritorio: tabla */}
          <div className="hidden overflow-x-auto rounded-2xl border bg-paper shadow-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {canBulk ? (
                    <TableHead className="w-8">
                      <SelectAllCheckbox ids={visibleIds} />
                    </TableHead>
                  ) : null}
                  <TableHead className="w-12 text-right">#</TableHead>
                  <TableHead className="min-w-64">Ejercicio</TableHead>
                  <TableHead>Línea · etapa</TableHead>
                  <TableHead>{canScore ? <Term k="ice">I · C · F</Term> : <Term k="ice" />}</TableHead>
                  <TableHead className="text-right">
                    <Term k="ice" />
                  </TableHead>
                  <TableHead>
                    <Term k="filters" />
                  </TableHead>
                  <TableHead className="text-right">
                    <Term k="finalScore">Puntaje</Term>
                  </TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e, i) => (
                  <TableRow key={e.id}>
                    {canBulk ? (
                      <TableCell>
                        <RowCheckbox id={e.id} title={e.title} />
                      </TableCell>
                    ) : null}
                    <TableCell className="text-right font-semibold tabular-nums">{i + 1}</TableCell>
                    <TableCell className="whitespace-normal">
                      <Link href={`${base}/ejercicios/${e.id}`} className="font-medium hover:underline">
                        {e.title}
                      </Link>
                      <div className="line-clamp-1 text-xs text-soft">{e.problem_title}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.line_name}
                      <div className="text-xs text-soft">{e.stage_name}</div>
                    </TableCell>
                    <TableCell>{iceCell(e)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatScore(e.ice_score)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap tabular-nums">{filtersText(e)}</TableCell>
                    <TableCell className="text-right text-base font-semibold tabular-nums">{scoreCell(e)}</TableCell>
                    <TableCell>
                      <StatusBadge status={e.status} />
                    </TableCell>
                    <TableCell className="text-sm">{e.owner_name ?? <span className="text-soft">Sin asignar</span>}</TableCell>
                    <TableCell>
                      {can.deleteExperiment(ctx.actor, e) ? (
                        <DeleteButton entity="experiment" id={e.id} programId={programId} name={e.title} variant="ghost" iconOnly />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canBulk ? 11 : 10} className="py-8 text-center text-sm text-soft">
                      Ningún ejercicio coincide con los filtros. Ese camino no era: pruebe con otros.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          {canBulk ? <BulkActionBar programId={programId} visibleIds={visibleIds} members={memberOptions} /> : null}
        </BacklogSelection>
      )}
    </div>
  );
}
