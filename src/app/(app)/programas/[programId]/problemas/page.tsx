import { ClipboardList, Plus, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeleteButton } from "@/components/app/delete-button";
import { EmptyState, PageHeader } from "@/components/app/page";
import { ImpactBadge, ProblemStatusBadge } from "@/components/app/status-badge";
import { UrlFilters } from "@/components/app/url-filters";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CONTROL_LABEL, IMPACT_LABEL, PROBLEM_STATUS_LABEL } from "@/domain/labels";
import { can } from "@/domain/permissions";
import { IMPACT_LEVELS, PROBLEM_STATUSES } from "@/domain/types";
import { getProgramContext } from "@/server/auth";
import { listLines } from "@/server/queries/programs";
import { listProblems, listStages } from "@/server/queries/structure";

export const metadata: Metadata = { title: "Problemas" };

export default async function ProblemsPage({ params, searchParams }: PageProps<"/programas/[programId]/problemas">) {
  const { programId } = await params;
  const sp = await searchParams;
  const ctx = await getProgramContext(programId);
  const [problems, lines, stages] = await Promise.all([listProblems(programId), listLines(programId), listStages({ programId })]);
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const f = { linea: get("linea"), etapa: get("etapa"), canal: get("canal"), estado: get("estado"), impacto: get("impacto"), q: get("q") };

  const filtered = problems.filter(
    (p) =>
      (!f.linea || p.line_id === f.linea) &&
      (!f.etapa || p.stage_name === f.etapa) &&
      (!f.canal || (p.channel ?? "") === f.canal) &&
      (!f.estado || p.status === f.estado) &&
      (!f.impacto || p.impact === f.impacto) &&
      (!f.q || `${p.title} ${p.evidence} ${p.root_cause ?? ""}`.toLowerCase().includes(f.q.toLowerCase())),
  );
  const stageNames = [...new Set(stages.map((s) => s.name))];
  const channels = [...new Set(problems.map((p) => p.channel).filter((c): c is string => !!c))].sort();
  const base = `/programas/${programId}`;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Problemas"
        description="Pérdidas de valor con evidencia, ubicadas en la línea, la etapa del embudo y el canal. Todo ejercicio nace de un problema."
        actions={
          can.createProblem(ctx.actor) && lines.length ? (
            <Button asChild>
              <Link href={`${base}/problemas/nuevo`}>
                <Plus aria-hidden /> Nuevo problema
              </Link>
            </Button>
          ) : null
        }
      />

      {problems.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="¿Y por dónde es? Aún no hay problemas"
          description={
            lines.length
              ? "Registre dónde se está perdiendo valor, con los datos que lo muestran. Después podrá crear ejercicios desde cada problema."
              : "Primero configure al menos una línea de negocio con su embudo."
          }
          action={
            can.createProblem(ctx.actor) && lines.length ? (
              <Button asChild>
                <Link href={`${base}/problemas/nuevo`}>
                  <Plus aria-hidden /> Registrar el primer problema
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href={`${base}/configuracion?paso=lineas`}>Configurar líneas</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <UrlFilters
            search={{ param: "q", placeholder: "Título, evidencia o causa" }}
            filters={[
              { param: "linea", label: "Línea", options: lines.map((l) => ({ value: l.id, label: l.name })) },
              { param: "etapa", label: "Etapa", options: stageNames.map((s) => ({ value: s, label: s })) },
              { param: "canal", label: "Canal", options: channels.map((c) => ({ value: c, label: c })) },
              { param: "estado", label: "Estado", options: PROBLEM_STATUSES.map((s) => ({ value: s, label: PROBLEM_STATUS_LABEL[s] })) },
              { param: "impacto", label: "Impacto", options: IMPACT_LEVELS.map((s) => ({ value: s, label: IMPACT_LABEL[s] })) },
            ]}
          />
          <div className="overflow-x-auto rounded-2xl border bg-paper shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-72">Problema</TableHead>
                  <TableHead>Línea · etapa</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Impacto</TableHead>
                  <TableHead>Control</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Ejercicios</TableHead>
                  <TableHead>
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-normal">
                      <Link href={`${base}/problemas/${p.id}`} className="font-semibold hover:underline">
                        {p.title}
                      </Link>
                      <div className="line-clamp-1 text-xs text-soft">{p.evidence}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.line_name}
                      <div className="text-xs text-soft">{p.stage_name}</div>
                    </TableCell>
                    <TableCell className="text-sm">{p.channel ?? "—"}</TableCell>
                    <TableCell>
                      <ImpactBadge impact={p.impact} />
                    </TableCell>
                    <TableCell className="text-sm">{CONTROL_LABEL[p.control]}</TableCell>
                    <TableCell>
                      <ProblemStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.experiments}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {can.createExperiment(ctx.actor) && p.status !== "discarded" ? (
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`${base}/ejercicios/nuevo?problema=${p.id}`}>
                              <Sparkles aria-hidden /> Crear ejercicio
                            </Link>
                          </Button>
                        ) : null}
                        {can.deleteStructure(ctx.actor) ? (
                          <DeleteButton
                            entity="problem"
                            id={p.id}
                            programId={programId}
                            name={p.title}
                            variant="ghost"
                            iconOnly
                            reassignOptions={problems
                              .filter((o) => o.id !== p.id && o.line_id === p.line_id)
                              .map((o) => ({ id: o.id, label: o.title }))}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-soft">
                      Ningún problema coincide con los filtros. Pruebe con otros.
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
