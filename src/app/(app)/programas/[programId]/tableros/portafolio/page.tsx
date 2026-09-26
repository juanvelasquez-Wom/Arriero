import { Grid3x3, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Callout, EmptyState, Section, Stat } from "@/components/app/page";
import { VelocityChart } from "@/components/dashboards/charts";
import { DashboardFrame } from "@/components/dashboards/dashboard-frame";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { learningVelocity, portfolioMatrix, type PortfolioCell } from "@/domain/dashboards";
import { maxDate } from "@/domain/dates";
import { formatShortDate } from "@/domain/format";
import { isActive, isClosed } from "@/domain/lifecycle";
import { cn } from "@/lib/utils";
import { listProblems, listStages } from "@/server/queries/structure";
import { loadDashboard } from "../_lib/data";

export const metadata: Metadata = { title: "Portafolio y velocidad" };

export default async function PortfolioPage({ params, searchParams }: PageProps<"/programas/[programId]/tableros/portafolio">) {
  const { programId } = await params;
  const [data, stages, problems] = await Promise.all([
    loadDashboard(programId, await searchParams),
    listStages({ programId }),
    listProblems(programId),
  ]);
  const base = `/programas/${programId}`;
  const lines = data.filters.linea ? data.lines.filter((l) => l.id === data.filters.linea) : data.lines;

  const input = {
    lines,
    stages,
    problems: problems.map((p) => ({ id: p.id, line_id: p.line_id, stage_id: p.stage_id, status: p.status })),
  };
  // Conteos con los filtros; "problema validado sin ejercicio" mira todos los
  // ejercicios (un filtro no debe inventar huecos que no existen).
  const filteredMatrix = portfolioMatrix({ ...input, experiments: data.filtered });
  const fullMatrix = portfolioMatrix({ ...input, experiments: data.experiments });
  const matrix = {
    columns: filteredMatrix.columns,
    rows: filteredMatrix.rows.map((row, i) => ({
      ...row,
      cells: row.cells.map((cell, j) => {
        const validatedWithoutExperiment = fullMatrix.rows[i].cells[j].validatedWithoutExperiment;
        return { ...cell, validatedWithoutExperiment, gap: cell.active === 0 && validatedWithoutExperiment > 0 };
      }),
    })),
  };
  const zeroLines = matrix.rows.filter((r) => r.alert);
  const gaps = matrix.rows.flatMap((r) => r.cells).filter((c) => c.gap);

  // Velocidad: 12 semanas que terminan en hoy o en el último dato, lo que sea más tarde.
  const latest = maxDate(
    ...data.filtered.flatMap((e) => [e.actual_start, e.decided_at ? e.decided_at.slice(0, 10) : null]),
  );
  const until = maxDate(data.today, latest) ?? data.today;
  const velocity = learningVelocity(data.filtered, until).map((p) => ({ ...p, label: formatShortDate(p.week) }));
  const launched = velocity.reduce((a, p) => a + p.launched, 0);
  const closedCount = velocity.reduce((a, p) => a + p.closed, 0);

  if (data.lines.length === 0) {
    return (
      <DashboardFrame
        programId={programId}
        active="portafolio"
        title="Portafolio y velocidad"
        description="Dónde están los ejercicios en el embudo de cada línea y qué tan rápido estamos aprendiendo. La mula no pregunta, avanza."
        fields={data.globalFields}
        current={data.current}
        query={data.query}
      >
        <EmptyState
          icon={Grid3x3}
          title="Todavía no hay líneas de negocio"
          description="La matriz cruza las líneas con las etapas de su embudo. Cree las líneas y sus etapas para verla."
          action={
            <Button asChild variant="outline">
              <Link href={`${base}/configuracion?paso=lineas`}>Configurar líneas</Link>
            </Button>
          }
        />
      </DashboardFrame>
    );
  }

  return (
    <DashboardFrame
      programId={programId}
      active="portafolio"
      title="Portafolio y velocidad"
      description="Dónde están los ejercicios en el embudo de cada línea y qué tan rápido estamos aprendiendo. La mula no pregunta, avanza."
      fields={data.globalFields}
      current={data.current}
      query={data.query}
    >
      <div className="space-y-6">
        {zeroLines.length || gaps.length ? (
          <Callout icon={TriangleAlert} title="¡Ave María! Ojo con el portafolio">
            <ul className="list-disc pl-4">
              {zeroLines.length ? (
                <li>
                  {zeroLines.length === 1 ? "La línea" : "Las líneas"} {zeroLines.map((r) => r.line.name).join(", ")}{" "}
                  {zeroLines.length === 1 ? "no tiene" : "no tienen"} ejercicios.
                </li>
              ) : null}
              {gaps.length ? (
                <li>
                  {gaps.length} {gaps.length === 1 ? "celda tiene" : "celdas tienen"} problemas validados sin ningún ejercicio.
                </li>
              ) : null}
            </ul>
          </Callout>
        ) : null}

        <Section
          title="Matriz de líneas por etapa del embudo"
          description="Número grande: ejercicios activos (Priorizado a En lectura). Debajo, los cerrados. Las celdas resaltadas tienen problemas validados sin ejercicio."
        >
          {matrix.columns.length === 0 ? (
            <p className="text-sm text-soft">
              Las líneas todavía no tienen etapas de embudo. Defínalas en la pestaña Embudo de cada línea.
            </p>
          ) : (
            <div className="-m-4 overflow-x-auto p-4">
              <table className="w-full min-w-[640px] border-separate border-spacing-2 tabular-nums">
                <caption className="sr-only">Ejercicios activos y cerrados por línea y etapa del embudo</caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-44 text-left text-xs font-medium text-soft">
                      Línea
                    </th>
                    {matrix.columns.map((c) => (
                      <th key={c} scope="col" className="text-left text-xs font-medium text-soft">
                        {c}
                      </th>
                    ))}
                    <th scope="col" className="w-28 text-right text-xs font-medium text-soft">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map((row) => (
                    <tr key={row.line.id}>
                      <th scope="row" className="text-left align-middle text-sm font-semibold">
                        <Link href={`${base}/lineas/${row.line.id}?tab=embudo`} className="hover:underline">
                          {row.line.name}
                        </Link>
                      </th>
                      {row.cells.map((cell) => (
                        <MatrixCell key={cell.stageName} cell={cell} />
                      ))}
                      <td className="text-right align-middle">
                        {row.alert ? (
                          <span className="inline-flex items-center gap-1 rounded bg-highlight px-1.5 py-0.5 text-xs font-semibold text-[#1f1f1f]">
                            <TriangleAlert aria-hidden className="size-3.5" /> 0 · Sin ejercicios
                          </span>
                        ) : (
                          <span className="text-sm font-semibold">{row.totalExperiments}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <div className="grid gap-4 lg:grid-cols-3">
          <Section title="Ejercicios por línea" description="Sin contar descartados.">
            <ul className="space-y-2 tabular-nums">
              {matrix.rows.map((row) => {
                const exps = data.filtered.filter((e) => e.line_id === row.line.id);
                const active = exps.filter((e) => isActive(e.status)).length;
                const closed = exps.filter((e) => isClosed(e.status)).length;
                const max = Math.max(1, ...matrix.rows.map((r) => r.totalExperiments));
                return (
                  <li key={row.line.id} className={cn("rounded-xl border p-2", row.alert && "border-highlight bg-highlight/10")}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{row.line.name}</span>
                      <span className="font-heading font-extrabold">{row.totalExperiments}</span>
                    </div>
                    <div aria-hidden className="mt-1.5 h-1.5 rounded-full bg-gray-1">
                      <div className="h-full rounded-full bg-gray-4" style={{ width: `${(row.totalExperiments / max) * 100}%` }} />
                    </div>
                    <div className="mt-1 text-xs text-soft">
                      {row.alert ? (
                        <span className="inline-flex items-center gap-1 font-medium text-ink">
                          <TriangleAlert aria-hidden className="size-3.5" /> Alerta: esta línea no tiene ejercicios
                        </span>
                      ) : (
                        `${active} activo${active === 1 ? "" : "s"} · ${closed} cerrado${closed === 1 ? "" : "s"}`
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section
            className="lg:col-span-2"
            title="Velocidad de aprendizaje"
            description={`Lanzados (inicio real) y cerrados (fecha de decisión) por semana, últimas 12 semanas hasta el ${formatShortDate(until)}.`}
          >
            <div className="mb-3 grid grid-cols-2 gap-3">
              <Stat label="Lanzados en 12 semanas" value={launched} />
              <Stat label="Cerrados en 12 semanas" value={closedCount} />
            </div>
            <VelocityChart data={velocity} />
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-soft hover:text-ink">Ver los datos en tabla</summary>
              <Table className="mt-2 tabular-nums">
                <TableHeader>
                  <TableRow>
                    <TableHead>Semana (lunes)</TableHead>
                    <TableHead className="text-right">Lanzados</TableHead>
                    <TableHead className="text-right">Cerrados</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {velocity.map((p) => (
                    <TableRow key={p.week}>
                      <TableCell>{p.label}</TableCell>
                      <TableCell className="text-right">{p.launched}</TableCell>
                      <TableCell className="text-right">{p.closed}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </details>
          </Section>
        </div>
      </div>
    </DashboardFrame>
  );
}

function MatrixCell({ cell }: { cell: PortfolioCell }) {
  if (!cell.stageId) {
    return (
      <td className="rounded-xl border border-dashed bg-wash/50 p-3 align-top text-xs text-soft">
        <span aria-hidden>—</span>
        <span className="sr-only">Etapa no definida en esta línea</span>
      </td>
    );
  }
  return (
    <td
      className={cn(
        "rounded-xl border p-3 align-top",
        cell.gap ? "border-2 border-highlight bg-highlight/10" : cell.active ? "bg-paper" : "bg-wash/50",
      )}
    >
      <div className="font-heading text-2xl leading-none font-extrabold">
        {cell.active}
        <span className="sr-only"> activo{cell.active === 1 ? "" : "s"}</span>
      </div>
      {cell.closed ? <div className="mt-1 text-xs text-soft">+{cell.closed} cerrado{cell.closed === 1 ? "" : "s"}</div> : null}
      {cell.validatedWithoutExperiment > 0 ? (
        <div className={cn("mt-2 flex items-start gap-1 text-xs", cell.gap ? "font-medium text-ink" : "text-soft")}>
          <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          {cell.validatedWithoutExperiment} problema(s) validado(s) sin ejercicio
        </div>
      ) : null}
    </td>
  );
}
