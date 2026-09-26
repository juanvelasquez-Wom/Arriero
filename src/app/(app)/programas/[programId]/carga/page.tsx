import { CalendarPlus, Waypoints } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Callout, EmptyState, PageHeader } from "@/components/app/page";
import { WeeklyLoadForm, type LoadGroup } from "@/components/lines/weekly-load-form";
import { Button } from "@/components/ui/button";
import { addDays, parseIsoDate, todayIso, toIsoDate, weekStart } from "@/domain/dates";
import { buildMetricTree, flattenTree } from "@/domain/metric-tree";
import { can } from "@/domain/permissions";
import { getProgramContext } from "@/server/auth";
import { listLines } from "@/server/queries/programs";
import { listMetrics, listMetricValues } from "@/server/queries/structure";

export const metadata: Metadata = { title: "Carga semanal" };

/** Normaliza `?semana=` al lunes de esa semana; si no es válida, la semana actual. */
function resolveWeek(raw: string | string[] | undefined, currentWeek: string): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return currentWeek;
  const d = parseIsoDate(v);
  if (Number.isNaN(d.getTime()) || toIsoDate(d) !== v) return currentWeek;
  const monday = weekStart(v);
  return monday > currentWeek ? currentWeek : monday;
}

export default async function WeeklyLoadPage({ params, searchParams }: PageProps<"/programas/[programId]/carga">) {
  const { programId } = await params;
  const sp = await searchParams;
  const ctx = await getProgramContext(programId);
  const currentWeek = weekStart(todayIso());
  const week = resolveWeek(sp.semana, currentWeek);
  const prevWeek = addDays(week, -7);
  const baseHref = `/programas/${programId}/carga`;

  const [lines, metrics, values, previousValues] = await Promise.all([
    listLines(programId),
    listMetrics({ programId }),
    listMetricValues({ programId, weekStart: week }),
    listMetricValues({ programId, weekStart: prevWeek }),
  ]);

  const header = (
    <PageHeader
      eyebrow="Operación"
      title="Carga semanal"
      description="Un valor por métrica y semana (de lunes a domingo). Se puede corregir después; cada cambio queda en el historial."
    />
  );

  if (!metrics.length) {
    return (
      <div className="mx-auto max-w-5xl">
        {header}
        <EmptyState
          icon={CalendarPlus}
          title="Todavía no hay métricas para cargar"
          description={
            lines.length
              ? "Las métricas se definen en cada línea: primero la métrica norte y luego el árbol de métricas de entrada. Cuando existan, aquí se cargan sus valores cada semana."
              : "El programa aún no tiene líneas de negocio. Crea las líneas en la configuración y define sus métricas."
          }
          action={
            lines.length ? (
              lines.map((l) => (
                <Button key={l.id} asChild variant="outline" size="sm">
                  <Link href={`/programas/${programId}/lineas/${l.id}?tab=norte`}>
                    <Waypoints aria-hidden /> {l.name}
                  </Link>
                </Button>
              ))
            ) : can.editStructure(ctx.actor) ? (
              <Button asChild>
                <Link href={`/programas/${programId}/configuracion?paso=lineas`}>Crear líneas</Link>
              </Button>
            ) : null
          }
        />
      </div>
    );
  }

  // Métricas agrupadas por línea, en el orden visual del árbol.
  const groups: LoadGroup[] = lines
    .map((l) => ({
      lineId: l.id,
      lineName: l.name,
      metrics: flattenTree(buildMetricTree(metrics.filter((m) => m.line_id === l.id))).map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        branch: m.branch,
        unit: m.unit,
        direction: m.direction,
      })),
    }))
    .filter((g) => g.metrics.length);

  const toMap = (rows: typeof values) => Object.fromEntries(rows.map((v) => [v.metric_id, { value: v.value, note: v.note }]));
  const program = ctx.program;
  const outside =
    (program.start_date && addDays(week, 6) < program.start_date) || (program.end_date && week > program.end_date);

  return (
    <div className="mx-auto max-w-5xl">
      {header}
      {outside ? (
        <Callout tone="neutral" className="mb-4" title="Semana fuera de las fechas del programa">
          Puedes cargar valores de referencia, pero no cuentan dentro del periodo del programa.
        </Callout>
      ) : null}
      <WeeklyLoadForm
        key={week}
        programId={programId}
        baseHref={baseHref}
        week={week}
        currentWeek={currentWeek}
        groups={groups}
        saved={toMap(values)}
        previous={toMap(previousValues)}
        canLoad={can.loadMetricValues(ctx.actor)}
      />
    </div>
  );
}
