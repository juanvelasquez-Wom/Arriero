"use client";

import { ArrowDown, ArrowUp, ChartLine, Pencil, Plus, Star, Target, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { DeleteButton } from "@/components/app/delete-button";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatMetricValue } from "@/domain/format";
import { buildMetricTree, parentCandidates, reassignCandidates, type MetricTreeNode } from "@/domain/metric-tree";
import { cn } from "@/lib/utils";
import { moveMetric } from "@/server/actions/metrics";
import { problemFromMetricPath } from "@/domain/home";
import type { TargetEvaluation } from "@/domain/targets";
import type { MetricHistoryRow, MetricRow } from "@/server/queries/structure";
import { BRANCH_STYLE, BranchBadge, DirectionLabel, MetricTypeBadge, metricOptionLabel } from "./metric-badges";
import { MetricFormDialog, type Option } from "./metric-form-dialog";
import { MetricTrendDialog } from "./metric-trend-dialog";
import { TargetStatusSummary } from "./target-status";
import { TargetsDialog, type HorizonOption } from "./targets-dialog";

export interface MetricInsight {
  evaluation: TargetEvaluation;
  series: { week_start: string; value: number }[];
  history: MetricHistoryRow[];
}

type Node = MetricTreeNode<MetricRow>;

interface EditorProps {
  programId: string;
  lineId: string;
  metrics: MetricRow[];
  members: Option[];
  horizons: HorizonOption[];
  currentHorizonId: string | null;
  canEdit: boolean;
  canDelete: boolean;
  insights: Record<string, MetricInsight>;
}

/** Editor visual del árbol: nodos anidados con conectores dibujados con bordes. */
export function MetricTreeEditor(props: EditorProps) {
  const tree = buildMetricTree(props.metrics);
  const main = tree.filter((n) => n.type === "north_star");
  const others = tree.filter((n) => n.type !== "north_star");

  return (
    <div className="space-y-6">
      {main.length ? (
        <ul aria-label="Árbol de la métrica norte" className="space-y-3">
          {main.map((n, i) => (
            <TreeItem key={n.id} node={n} index={i} siblingCount={main.length} {...props} />
          ))}
        </ul>
      ) : null}

      {others.length ? (
        <div>
          <h3 className="mb-1 text-sm font-bold">Fuera del árbol principal</h3>
          <p className="mb-3 text-xs text-soft">
            La métrica de eficiencia acompaña a la norte. Las entradas sin métrica padre también aparecen aquí: edítelas para
            colgarlas del árbol.
          </p>
          <ul aria-label="Métricas fuera del árbol principal" className="space-y-3">
            {others.map((n, i) => (
              <TreeItem key={n.id} node={n} index={i} siblingCount={others.length} {...props} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function TreeItem({
  node,
  index,
  siblingCount,
  ...props
}: EditorProps & { node: Node; index: number; siblingCount: number }) {
  const isChild = node.depth > 0;
  return (
    <li
      className={cn(
        "relative",
        // Conectores: la línea vertical la dibuja el <ul> padre (border-l); cada hijo
        // agrega su codo horizontal y, si es el último, tapa el resto de la vertical.
        isChild &&
          "pl-6 before:absolute before:top-6 before:left-0 before:w-5 before:border-t before:border-gray-3 last:after:absolute last:after:top-6 last:after:-bottom-px last:after:-left-px last:after:w-px last:after:bg-paper",
      )}
    >
      <NodeCard node={node} isFirst={index === 0} isLast={index === siblingCount - 1} {...props} />
      {node.children.length ? (
        <ul className="mt-3 ml-5 space-y-3 border-l border-gray-3" aria-label={`Métricas que cuelgan de ${node.name}`}>
          {node.children.map((c, i) => (
            <TreeItem key={c.id} node={c} index={i} siblingCount={node.children.length} {...props} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function NodeCard({
  node,
  isFirst,
  isLast,
  programId,
  lineId,
  metrics,
  members,
  horizons,
  currentHorizonId,
  canEdit,
  canDelete,
  insights,
}: EditorProps & { node: Node; isFirst: boolean; isLast: boolean }) {
  const insight = insights[node.id];
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isRoot = node.type === "north_star";
  const currentTarget = currentHorizonId ? node.targets.find((t) => t.horizon_id === currentHorizonId) : undefined;
  const currentHorizon = horizons.find((h) => h.id === currentHorizonId);
  const borderClass = isRoot
    ? "border-l-highlight"
    : node.type === "input" && node.branch
      ? BRANCH_STYLE[node.branch].border
      : "border-l-ink/40";

  const parentOptions = parentCandidates(metrics, node.id).map((m) => ({ id: m.id, label: metricOptionLabel(m) }));
  const childParentOptions = metrics.map((m) => ({ id: m.id, label: metricOptionLabel(m) }));
  const reassignOptions = reassignCandidates(metrics, node.id).map((m) => ({ id: m.id, label: metricOptionLabel(m) }));

  function move(direction: "up" | "down") {
    startTransition(async () => {
      const r = await moveMetric(programId, { id: node.id, direction });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "max-w-2xl rounded-xl border border-l-4 bg-paper px-3 py-2.5 shadow-card",
        borderClass,
        isRoot && "bg-highlight/10",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {node.type === "input" && node.branch ? <BranchBadge branch={node.branch} /> : <MetricTypeBadge type={node.type} />}
            <span className={cn("font-semibold", isRoot && "text-base font-bold")}>
              {isRoot ? <Star aria-hidden className="mr-1 inline size-4 align-[-2px]" /> : null}
              {node.name}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-soft">
            <DirectionLabel direction={node.direction} />
            <span className="tabular-nums">Base: {formatMetricValue(node.baseline, node.unit)}</span>
            {currentHorizon ? (
              <span className="tabular-nums">
                Objetivo {currentHorizon.name}: {currentTarget ? formatMetricValue(currentTarget.target, node.unit) : "sin definir"}
              </span>
            ) : null}
            {node.owner_name ? (
              <span className="inline-flex items-center gap-1">
                <User aria-hidden className="size-3" />
                {node.owner_name}
              </span>
            ) : null}
          </div>
          {insight ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <TargetStatusSummary
                evaluation={insight.evaluation}
                unit={node.unit}
                compact
                problemHref={`/programas/${programId}${problemFromMetricPath(node.id)}`}
              />
              <MetricTrendDialog
                programId={programId}
                metricId={node.id}
                name={node.name}
                unit={node.unit}
                baseline={node.baseline}
                series={insight.series}
                targets={horizons
                  .filter((h) => node.targets.some((t) => t.horizon_id === h.id))
                  .map((h) => ({
                    label: `Objetivo ${h.name}`,
                    value: node.targets.find((t) => t.horizon_id === h.id)!.target,
                    current: h.id === currentHorizonId,
                  }))}
                evaluation={insight.evaluation}
                history={insight.history}
                trigger={
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs">
                    <ChartLine aria-hidden /> Tendencia
                    {insight.history.length ? ` · ${insight.history.length} cambio${insight.history.length === 1 ? "" : "s"}` : ""}
                  </Button>
                }
              />
            </div>
          ) : null}
        </div>

        {canEdit ? (
          <div className="flex shrink-0 flex-wrap items-center gap-0.5">
            {pending ? <Spinner className="mr-1" /> : null}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Subir ${node.name}`}
              title="Subir"
              disabled={isFirst || pending || node.depth === 0}
              onClick={() => move("up")}
            >
              <ArrowUp aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Bajar ${node.name}`}
              title="Bajar"
              disabled={isLast || pending || node.depth === 0}
              onClick={() => move("down")}
            >
              <ArrowDown aria-hidden />
            </Button>
            <MetricFormDialog
              programId={programId}
              lineId={lineId}
              type="input"
              defaultParentId={node.id}
              defaultBranch={node.type === "input" ? node.branch : null}
              parentOptions={childParentOptions}
              members={members}
              title={`Nueva métrica que cuelga de “${node.name}”`}
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label={`Agregar métrica hija a ${node.name}`} title="Agregar hija">
                  <Plus aria-hidden />
                </Button>
              }
            />
            <TargetsDialog
              programId={programId}
              metric={node}
              horizons={horizons}
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label={`Objetivos de ${node.name}`} title="Objetivos">
                  <Target aria-hidden />
                </Button>
              }
            />
            <MetricFormDialog
              programId={programId}
              lineId={lineId}
              type={node.type}
              metric={node}
              parentOptions={parentOptions}
              members={members}
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label={`Editar ${node.name}`} title="Editar">
                  <Pencil aria-hidden />
                </Button>
              }
            />
            {canDelete ? (
              <DeleteButton
                entity="metric"
                id={node.id}
                programId={programId}
                name={node.name}
                reassignOptions={reassignOptions}
                variant="ghost"
                iconOnly
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
