import { CalendarPlus, Gauge, ChartLine, Pencil, Plus, Star, Target, TrendingDown, TrendingUp, Minus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState, Section } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateRange, formatMetricValue, formatSignedPercent } from "@/domain/format";
import { changeVsBaseline } from "@/domain/metric-tree";
import { cn } from "@/lib/utils";
import type { Horizon } from "@/server/queries/programs";
import type { MetricRow, MetricValueRow } from "@/server/queries/structure";
import { DirectionLabel, MetricTypeBadge } from "./metric-badges";
import { MetricEvolutionChart } from "./metric-evolution-chart";
import { MetricFormDialog, type Option } from "./metric-form-dialog";
import { TargetsDialog } from "./targets-dialog";

interface Props {
  programId: string;
  lineId: string;
  metrics: MetricRow[];
  values: MetricValueRow[];
  horizons: Horizon[];
  currentHorizonId: string | null;
  members: Option[];
  canEdit: boolean;
}

/** Pestaña "Métrica norte": norte + eficiencia, base, objetivos y evolución. */
export function NorthStarTab(props: Props) {
  const { metrics, programId, lineId, members, canEdit } = props;
  const northStar = metrics.find((m) => m.type === "north_star");
  const efficiency = metrics.filter((m) => m.type === "efficiency");

  return (
    <div className="space-y-6">
      {northStar ? (
        <MetricOverview {...props} metric={northStar} />
      ) : (
        <EmptyState
          icon={Star}
          title="Esta línea todavía no tiene métrica norte"
          description="La métrica norte representa el valor que la línea quiere crecer (p. ej. altas digitales por semana). El árbol, el embudo y los ejercicios se ordenan alrededor de ella: sin norte no hay camino."
          action={
            canEdit ? (
              <MetricFormDialog
                programId={programId}
                lineId={lineId}
                type="north_star"
                parentOptions={[]}
                members={members}
                trigger={
                  <Button>
                    <Plus aria-hidden /> Definir métrica norte
                  </Button>
                }
              />
            ) : (
              <p className="text-xs text-soft">Un owner o un colaborador del programa puede definirla.</p>
            )
          }
        />
      )}

      {efficiency.map((m) => (
        <MetricOverview key={m.id} {...props} metric={m} />
      ))}

      {efficiency.length === 0 ? (
        <EmptyState
          icon={Gauge}
          className="py-6"
          title="Sin métrica de eficiencia"
          description="Acompaña a la métrica norte para que el crecimiento no salga a cualquier costo (p. ej. costo por alta o CAC)."
          action={
            canEdit ? (
              <MetricFormDialog
                programId={programId}
                lineId={lineId}
                type="efficiency"
                parentOptions={[]}
                members={members}
                trigger={
                  <Button variant="outline">
                    <Plus aria-hidden /> Agregar métrica de eficiencia
                  </Button>
                }
              />
            ) : null
          }
        />
      ) : null}
    </div>
  );
}

function MetricOverview({
  programId,
  lineId,
  metric,
  values,
  horizons,
  currentHorizonId,
  members,
  canEdit,
}: Props & { metric: MetricRow }) {
  const series = values.filter((v) => v.metric_id === metric.id).sort((a, b) => a.week_start.localeCompare(b.week_start));
  const last = series.at(-1);
  const change = changeVsBaseline(last?.value, metric.baseline, metric.direction);
  const targetBy = new Map(metric.targets.map((t) => [t.horizon_id, t.target]));
  const chartTargets = horizons
    .filter((h) => targetBy.has(h.id))
    .map((h) => ({ label: `Objetivo ${h.name}`, value: targetBy.get(h.id)!, current: h.id === currentHorizonId }));
  const isNorth = metric.type === "north_star";
  const ChangeIcon = change.favorable == null ? Minus : (change.ratio ?? 0) >= 0 ? TrendingUp : TrendingDown;

  return (
    <Section
      className={cn(isNorth && "border-l-4 border-l-highlight")}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <MetricTypeBadge type={metric.type} />
          <span className="text-base font-bold">{metric.name}</span>
        </span>
      }
      description={metric.definition ?? "Sin definición. Descríbala para que todos carguen el mismo dato."}
      actions={
        canEdit ? (
          <>
            <TargetsDialog
              programId={programId}
              metric={metric}
              horizons={horizons}
              trigger={
                <Button variant="outline" size="sm">
                  <Target aria-hidden /> Objetivos
                </Button>
              }
            />
            <MetricFormDialog
              programId={programId}
              lineId={lineId}
              type={metric.type}
              metric={metric}
              parentOptions={[]}
              members={members}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil aria-hidden /> Editar
                </Button>
              }
            />
          </>
        ) : null
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Fact label="Línea base" value={formatMetricValue(metric.baseline, metric.unit)} />
            <Fact
              label="Último valor"
              value={formatMetricValue(last?.value, metric.unit)}
              hint={last ? `Semana del ${formatDate(last.week_start)}` : "Sin valores cargados"}
            />
          </div>
          {change.ratio != null || change.favorable != null ? (
            <p className="flex items-center gap-1.5 text-sm">
              <ChangeIcon aria-hidden className="size-4" />
              <span className="tabular-nums font-medium">{formatSignedPercent(change.ratio, "")}</span>
              <span className="text-soft">
                vs. línea base ·{" "}
                {change.favorable == null ? "sin cambio" : change.favorable ? "va en la dirección deseada" : "va en contra de la dirección deseada"}
              </span>
            </p>
          ) : null}

          <div>
            <h3 className="mb-1.5 text-xs font-medium text-soft">Objetivos por horizonte</h3>
            {horizons.length === 0 ? (
              <p className="text-sm text-soft">El programa no tiene horizontes definidos.</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {horizons.map((h) => {
                  const isCurrent = h.id === currentHorizonId;
                  return (
                    <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium">{h.name}</span>
                        {isCurrent ? (
                          <span className="ml-2 inline-flex h-5 items-center rounded-full bg-highlight px-1.5 text-[11px] font-medium text-[#1f1f1f]">
                            En curso
                          </span>
                        ) : null}
                        <span className="block text-xs text-soft">{formatDateRange(h.start_date, h.end_date)}</span>
                      </span>
                      <span className={cn("tabular-nums", !targetBy.has(h.id) && "text-soft")}>
                        {targetBy.has(h.id) ? formatMetricValue(targetBy.get(h.id), metric.unit) : "Sin objetivo"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <Detail label="Dirección">
              <DirectionLabel direction={metric.direction} />
            </Detail>
            <Detail label="Unidad">{metric.unit ?? "—"}</Detail>
            <Detail label="Responsable">{metric.owner_name ?? "Sin responsable"}</Detail>
            <Detail label="Canal">{metric.channel ?? "—"}</Detail>
            <Detail label="Fuente" className="col-span-2">
              {metric.source ?? "—"}
            </Detail>
          </dl>
        </div>

        <div className="min-w-0">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-soft">
            <ChartLine aria-hidden className="size-3.5" /> Evolución semanal
          </h3>
          {series.length ? (
            <MetricEvolutionChart
              name={metric.name}
              values={series}
              baseline={metric.baseline}
              targets={chartTargets}
              unit={metric.unit}
            />
          ) : (
            <EmptyState
              icon={CalendarPlus}
              className="py-8"
              title="Todavía no hay valores semanales"
              description="Cuando se carguen los valores de cada lunes, aquí verá la evolución frente a la línea base y el objetivo. Del dato al camino."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href={`/programas/${programId}/carga`}>Ir a la carga semanal</Link>
                </Button>
              }
            />
          )}
        </div>
      </div>
    </Section>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-wash px-3 py-2">
      <div className="text-xs text-soft">{label}</div>
      <div className="mt-0.5 font-heading text-xl font-extrabold tabular-nums">{value}</div>
      {hint ? <div className="text-[11px] text-soft">{hint}</div> : null}
    </div>
  );
}

function Detail({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-soft">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}
