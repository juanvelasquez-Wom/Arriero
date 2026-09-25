import { ListOrdered, Plus, Snowflake } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeleteButton } from "@/components/app/delete-button";
import { EmptyState, PageHeader } from "@/components/app/page";
import { StatusBadge } from "@/components/app/status-badge";
import { UrlFilters } from "@/components/app/url-filters";
import { QuickIce } from "@/components/experiments/quick-ice";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { freezesOverlapping, plannedRange } from "@/domain/calendar";
import { formatScore } from "@/domain/format";
import { CONTROL_LABEL, STATUS_LABEL } from "@/domain/labels";
import { can } from "@/domain/permissions";
import { EXPERIMENT_STATUSES } from "@/domain/types";
import { getProgramContext } from "@/server/auth";
import { listExperiments } from "@/server/queries/experiments";
import { listCalendar, listLines, listMembers } from "@/server/queries/programs";

export const metadata: Metadata = { title: "Backlog de ejercicios" };

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
  // Por defecto el backlog muestra lo abierto; los cerrados y descartados se ven filtrando por estado.
  const defaultOpen = !f.estado;
  const filtered = experiments
    .filter(
      (e) =>
        (!f.linea || e.line_id === f.linea) &&
        (f.estado ? e.status === f.estado : !["decided", "scaled", "discarded"].includes(e.status)) &&
        (!f.responsable || e.owner_id === f.responsable) &&
        (!f.etapa || e.stage_name === f.etapa) &&
        (!f.q || `${e.title} ${e.problem_title}`.toLowerCase().includes(f.q.toLowerCase())),
    )
    .sort((a, b) => (b.final_score ?? -99) - (a.final_score ?? -99) || a.created_at.localeCompare(b.created_at));
  const stageNames = [...new Set(experiments.map((e) => e.stage_name).filter((s): s is string => !!s))];
  const base = `/programas/${programId}`;
  const canScore = can.scoreIce(ctx.actor);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Backlog de ejercicios"
        description="Ordenado por puntaje final: ICE + bono de calendario − penalidad de control."
        actions={
          can.createExperiment(ctx.actor) ? (
            <Button asChild>
              <Link href={`${base}/ejercicios/nuevo`}>
                <Plus aria-hidden /> Nuevo ejercicio
              </Link>
            </Button>
          ) : null
        }
      />
      {experiments.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title="El backlog está vacío"
          description="Los ejercicios nacen de problemas con evidencia. Crea uno desde un problema y priorízalo con ICE."
          action={
            <Button asChild variant="outline">
              <Link href={`${base}/problemas`}>Ir a los problemas</Link>
            </Button>
          }
        />
      ) : (
        <>
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
            <p className="mb-2 text-xs text-soft">Mostrando ejercicios abiertos. Filtra por estado para ver decididos, escalados o descartados.</p>
          ) : null}
          <div className="overflow-x-auto rounded-xl border bg-paper">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-right">#</TableHead>
                  <TableHead className="min-w-64">Ejercicio</TableHead>
                  <TableHead>Línea · etapa</TableHead>
                  <TableHead>{canScore ? "I · C · F" : "ICE"}</TableHead>
                  <TableHead className="text-right">ICE</TableHead>
                  <TableHead>Filtros</TableHead>
                  <TableHead className="text-right">Puntaje</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e, i) => {
                  const crosses = freezesOverlapping(plannedRange(e), calendar);
                  return (
                    <TableRow key={e.id}>
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
                      <TableCell>
                        {canScore && !["decided", "scaled", "discarded"].includes(e.status) ? (
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
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatScore(e.ice_score)}</TableCell>
                      <TableCell className="text-xs">
                        <div>{e.fits_calendar ? "Calendario ✓" : "Calendario —"}</div>
                        <div className="text-soft">Control {CONTROL_LABEL[e.control].toLowerCase()}</div>
                      </TableCell>
                      <TableCell className="text-right text-base font-semibold tabular-nums">
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
                      </TableCell>
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
                  );
                })}
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-sm text-soft">
                      Ningún ejercicio coincide con los filtros.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
