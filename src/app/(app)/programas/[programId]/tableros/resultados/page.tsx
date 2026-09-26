import { BookOpenCheck, ChartColumn } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Section, Stat } from "@/components/app/page";
import { DecisionBadge, VerdictBadge } from "@/components/app/status-badge";
import { CountBarChart } from "@/components/dashboards/charts";
import { DashboardFrame, FilteredOutNote } from "@/components/dashboards/dashboard-frame";
import type { FilterField } from "@/components/dashboards/dashboard-filters";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { summarizeResults } from "@/domain/dashboards";
import { applyResultSlicers, hasActiveFilters, parseResultSlicers } from "@/domain/dashboard-filters";
import { formatDate, formatPercent, formatSignedPercent } from "@/domain/format";
import { DECISION_LABEL, TEST_TYPE_LABEL, VERDICT_LABEL, labelOf } from "@/domain/labels";
import { isClosed } from "@/domain/lifecycle";
import { computeVariantResults, headlineDiff } from "@/domain/results";
import { DECISIONS, TEST_TYPES, VERDICTS } from "@/domain/types";
import { cn } from "@/lib/utils";
import { listVariants } from "@/server/queries/experiments";
import { listLearnings, listStages } from "@/server/queries/structure";
import { loadDashboard } from "../_lib/data";

export const metadata: Metadata = { title: "Resultados" };

export default async function ResultsPage({ params, searchParams }: PageProps<"/programas/[programId]/tableros/resultados">) {
  const { programId } = await params;
  const sp = await searchParams;
  const [data, variants, learnings, stages] = await Promise.all([
    loadDashboard(programId, sp),
    listVariants({ programId }),
    listLearnings(programId),
    listStages({ programId }),
  ]);
  const slicers = parseResultSlicers(sp);
  const base = `/programas/${programId}`;

  const stageNames: string[] = [];
  for (const s of [...stages].sort((a, b) => a.sort_order - b.sort_order)) {
    if (!stageNames.includes(s.name)) stageNames.push(s.name);
  }
  const fields: FilterField[] = [
    ...data.globalFields,
    { key: "etapa", label: "Etapa del embudo", options: stageNames.map((n) => ({ value: n, label: n })) },
    { key: "tipo", label: "Tipo de prueba", options: TEST_TYPES.map((t) => ({ value: t, label: TEST_TYPE_LABEL[t] })) },
  ];

  const variantsBy = new Map<string, typeof variants>();
  for (const v of variants) variantsBy.set(v.experiment_id, [...(variantsBy.get(v.experiment_id) ?? []), v]);
  const learningBy = new Map(learnings.map((l) => [l.experiment_id, l.id]));

  const closed = applyResultSlicers(data.filtered, slicers)
    .filter((e) => isClosed(e.status))
    .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""))
    .map((e) => {
      const vs = variantsBy.get(e.id) ?? [];
      return { ...e, variants: vs, diff: headlineDiff(computeVariantResults(vs)), learningId: learningBy.get(e.id) ?? null };
    });
  const summary = summarizeResults(closed);
  const anyFilter = data.filtersActive || hasActiveFilters(slicers);

  return (
    <DashboardFrame
      programId={programId}
      active="resultados"
      title="Resultados"
      description="Ejercicios cerrados (decididos o escalados a BAU): win rate, cuánto le sacaron los ganadores al control y cómo se repartieron veredictos y decisiones. Aquí se ve el camello."
      fields={fields}
      current={data.current}
      query={data.query}
    >
      {closed.length === 0 ? (
        <EmptyState
          icon={ChartColumn}
          title="Todavía no hay ejercicios cerrados"
          description={
            <>
              Cuando decida el primero, aquí va a ver el win rate, la diferencia promedio de los ganadores frente al control y la
              tabla de cerrados con su aprendizaje. Si funciona, seguimos.
              <FilteredOutNote active={anyFilter} />
            </>
          }
          action={
            <Button asChild variant="outline">
              <Link href={`${base}/ejercicios`}>Ir al backlog</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="rise grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Ejercicios cerrados" value={summary.closed} hint="Decididos o escalados a BAU" />
            <Stat
              label="Win rate"
              value={formatPercent(summary.winRate)}
              hint={`${summary.winners} ganador${summary.winners === 1 ? "" : "es"} de ${summary.closed} cerrado${summary.closed === 1 ? "" : "s"}`}
              highlight={summary.winners > 0}
            />
            <Stat
              label="Diferencia promedio vs control (ganadores)"
              value={formatSignedPercent(summary.avgWinnerDiff)}
              hint={
                summary.avgWinnerDiff == null
                  ? "Todavía no hay ganadores con resultados comparables"
                  : "Mejor variante de cada ganador frente a su control"
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Veredictos" description="Lectura de cada cerrado frente a su regla de decisión.">
              <CountBarChart
                caption="Distribución de veredictos de los ejercicios cerrados"
                data={VERDICTS.map((v) => ({
                  key: v,
                  label: VERDICT_LABEL[v],
                  value: summary.verdicts[v],
                  highlight: v === "winner",
                }))}
              />
            </Section>
            <Section title="Decisiones" description="Qué se hizo con cada cerrado.">
              <CountBarChart
                caption="Distribución de decisiones de los ejercicios cerrados"
                data={DECISIONS.map((d) => ({ key: d, label: DECISION_LABEL[d], value: summary.decisions[d] }))}
              />
            </Section>
          </div>

          <Section title="Ejercicios cerrados" description="Los ganadores se resaltan. Cada fila enlaza a su aprendizaje.">
            <div className="-m-4 overflow-x-auto">
              <Table className="tabular-nums">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Ejercicio</TableHead>
                    <TableHead>Línea</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Tipo de prueba</TableHead>
                    <TableHead>Veredicto</TableHead>
                    <TableHead>Decisión</TableHead>
                    <TableHead className="text-right">Diferencia vs control</TableHead>
                    <TableHead>Decidido</TableHead>
                    <TableHead className="pr-4">Aprendizaje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closed.map((e) => {
                    const winner = e.verdict === "winner";
                    return (
                      <TableRow key={e.id} className={cn(winner && "bg-highlight/10 hover:bg-highlight/15")}>
                        <TableCell className={cn("max-w-72 pl-4", winner && "border-l-4 border-l-highlight")}>
                          <Link href={`${base}/ejercicios/${e.id}`} className="font-medium whitespace-normal hover:underline">
                            {e.title}
                          </Link>
                        </TableCell>
                        <TableCell>{e.line_name}</TableCell>
                        <TableCell>{e.stage_name ?? "—"}</TableCell>
                        <TableCell>{labelOf(TEST_TYPE_LABEL, e.test_type)}</TableCell>
                        <TableCell>
                          <VerdictBadge verdict={e.verdict} />
                        </TableCell>
                        <TableCell>
                          <DecisionBadge decision={e.decision} />
                        </TableCell>
                        <TableCell className={cn("text-right", winner && "font-semibold")}>
                          {formatSignedPercent(e.diff)}
                        </TableCell>
                        <TableCell>{formatDate(e.decided_at?.slice(0, 10))}</TableCell>
                        <TableCell className="pr-4">
                          {e.learningId ? (
                            <Link
                              href={`${base}/aprendizajes#${e.learningId}`}
                              className="inline-flex items-center gap-1 text-sm hover:underline"
                              aria-label={`Ver aprendizaje de ${e.title}`}
                            >
                              <BookOpenCheck aria-hidden className="size-3.5" /> Ver aprendizaje
                            </Link>
                          ) : (
                            <span className="text-soft">Sin aprendizaje registrado</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Section>
        </div>
      )}
    </DashboardFrame>
  );
}
