import { ListTree, Network, Plus, Star, Table2 } from "lucide-react";
import Link from "next/link";
import { EmptyState, Section } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { METRIC_BRANCH_LABEL } from "@/domain/labels";
import { formatMetricValue } from "@/domain/format";
import { buildMetricTree, countByBranch, flattenTree } from "@/domain/metric-tree";
import { METRIC_BRANCHES } from "@/domain/types";
import { cn } from "@/lib/utils";
import type { Horizon } from "@/server/queries/programs";
import { evaluateTarget } from "@/domain/targets";
import { problemFromMetricPath } from "@/domain/home";
import { Term } from "@/components/app/info-tip";
import type { MetricHistoryRow, MetricRow, MetricValueRow } from "@/server/queries/structure";
import { BranchBadge, DirectionLabel, MetricTypeBadge, metricOptionLabel } from "./metric-badges";
import { MetricFormDialog, type Option } from "./metric-form-dialog";
import { MetricTreeEditor, type MetricInsight } from "./metric-tree-editor";
import { TargetStatusSummary } from "./target-status";

export type TreeView = "arbol" | "tabla";

export function parseTreeView(value: string | string[] | undefined): TreeView {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "tabla" ? "tabla" : "arbol";
}

interface Props {
  programId: string;
  lineId: string;
  baseHref: string;
  view: TreeView;
  metrics: MetricRow[];
  members: Option[];
  horizons: Horizon[];
  currentHorizonId: string | null;
  values: MetricValueRow[];
  history: MetricHistoryRow[];
  today: string;
  programStart: string | null;
  canEdit: boolean;
  canDelete: boolean;
}

/** Semáforo, serie e historial por métrica (se calcula aquí y viaja al editor). */
function buildInsights({ metrics, values, history, horizons, today, programStart }: Props): Record<string, MetricInsight> {
  return Object.fromEntries(
    metrics.map((m) => {
      const series = values
        .filter((v) => v.metric_id === m.id)
        .sort((a, b) => a.week_start.localeCompare(b.week_start))
        .map((v) => ({ week_start: v.week_start, value: v.value }));
      const evaluation = evaluateTarget({
        baseline: m.baseline,
        direction: m.direction,
        targets: m.targets,
        horizons,
        values: series,
        today,
        programStart,
      });
      return [m.id, { evaluation, series, history: history.filter((h) => h.metric_id === m.id) }];
    }),
  );
}

/** Pestaña "Árbol de métricas": editor visual y vista de tabla (`?vista=tabla`). */
export function TreeTab(props: Props) {
  const { programId, lineId, baseHref, view, metrics, members, canEdit } = props;
  const northStar = metrics.find((m) => m.type === "north_star");
  const counts = countByBranch(metrics);

  if (!metrics.length) {
    return (
      <EmptyState
        icon={Network}
        title="El árbol está vacío"
        description="El árbol parte de la métrica norte y la descompone en métricas de entrada por rama: volumen de demanda, conversión, eficiencia, y recuperación y recurrencia. Empiece por definir la métrica norte: ¿y por dónde es?"
        action={
          <Button asChild variant={canEdit ? "default" : "outline"}>
            <Link href={`${baseHref}?tab=norte`}>
              <Star aria-hidden /> {canEdit ? "Definir métrica norte" : "Ver métrica norte"}
            </Link>
          </Button>
        }
      />
    );
  }

  const allOptions = metrics.map((m) => ({ id: m.id, label: metricOptionLabel(m) }));
  const insights = buildInsights(props);

  return (
    <Section
      title="Árbol de métricas"
      description="Cada métrica de entrada cuelga de otra y pertenece a una rama. Los ejercicios atacan métricas de este árbol."
      actions={
        <>
          <nav aria-label="Vista del árbol" className="inline-flex rounded-full border p-0.5">
            <ViewLink href={`${baseHref}?tab=arbol`} active={view === "arbol"} icon={ListTree} label="Árbol" />
            <ViewLink href={`${baseHref}?tab=arbol&vista=tabla`} active={view === "tabla"} icon={Table2} label="Tabla" />
          </nav>
          {canEdit ? (
            <MetricFormDialog
              programId={programId}
              lineId={lineId}
              type="input"
              defaultParentId={northStar?.id ?? null}
              parentOptions={allOptions}
              members={members}
              trigger={
                <Button size="sm">
                  <Plus aria-hidden /> Agregar métrica de entrada
                </Button>
              }
            />
          ) : null}
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs" aria-label="Ramas del árbol">
        <span className="inline-flex items-center gap-1 text-soft">
          <span aria-hidden className="h-3 w-1 rounded-sm bg-highlight" /> Raíz (métrica norte)
        </span>
        {METRIC_BRANCHES.map((b) => (
          <span key={b} className="inline-flex items-center gap-1">
            <BranchBadge branch={b} />
            <span className="tabular-nums text-soft">{counts[b]}</span>
          </span>
        ))}
      </div>

      {!northStar ? (
        <p className="mb-4 rounded-xl border border-dashed px-3 py-2 text-sm text-soft">
          Falta la métrica norte, que es la raíz del árbol.{" "}
          <Link href={`${baseHref}?tab=norte`} className="underline underline-offset-4 hover:text-ink">
            Defínala en la pestaña Métrica norte
          </Link>
          .
        </p>
      ) : null}

      {view === "tabla" ? (
        <MetricsTable {...props} insights={insights} />
      ) : (
        <MetricTreeEditor
          programId={programId}
          lineId={lineId}
          metrics={metrics}
          members={members}
          horizons={props.horizons}
          currentHorizonId={props.currentHorizonId}
          canEdit={canEdit}
          canDelete={props.canDelete}
          insights={insights}
        />
      )}
    </Section>
  );
}

function ViewLink({ href, active, icon: Icon, label }: { href: string; active: boolean; icon: typeof ListTree; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-soft hover:text-ink",
        active && "bg-gray-1 text-ink",
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </Link>
  );
}

function MetricsTable(props: Props & { insights: Record<string, MetricInsight> }) {
  const { metrics, horizons, insights } = props;
  const rows = flattenTree(buildMetricTree(metrics));
  const nameOf = new Map(metrics.map((m) => [m.id, m.name]));
  return (
    <div className="overflow-x-auto">
      <Table className="tabular-nums">
        <TableHeader>
          <TableRow>
            <TableHead>Métrica</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Rama</TableHead>
            <TableHead>Padre</TableHead>
            <TableHead>Unidad</TableHead>
            <TableHead>Dirección</TableHead>
            <TableHead className="text-right">
              <Term k="baseline" />
            </TableHead>
            {horizons.map((h) => (
              <TableHead key={h.id} className="text-right">
                Objetivo {h.name}
              </TableHead>
            ))}
            <TableHead>
              <Term k="targetStatus" />
            </TableHead>
            <TableHead>Responsable</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="min-w-56 font-medium">
                <span className="flex items-center" style={{ paddingLeft: `${m.depth * 1}rem` }}>
                  {m.depth > 0 ? (
                    <span aria-hidden className="mr-1.5 text-soft">
                      └
                    </span>
                  ) : null}
                  {m.name}
                </span>
              </TableCell>
              <TableCell>
                <MetricTypeBadge type={m.type} />
              </TableCell>
              <TableCell>{m.type === "input" && m.branch ? <BranchBadge branch={m.branch} /> : <span className="text-soft">—</span>}</TableCell>
              <TableCell className="text-soft">{m.parent_id ? (nameOf.get(m.parent_id) ?? "—") : "—"}</TableCell>
              <TableCell>{m.unit ?? "—"}</TableCell>
              <TableCell>
                <DirectionLabel direction={m.direction} />
              </TableCell>
              <TableCell className="text-right">{formatMetricValue(m.baseline, m.unit)}</TableCell>
              {horizons.map((h) => {
                const t = m.targets.find((x) => x.horizon_id === h.id);
                return (
                  <TableCell key={h.id} className={cn("text-right", !t && "text-soft")}>
                    {t ? formatMetricValue(t.target, m.unit) : "—"}
                  </TableCell>
                );
              })}
              <TableCell className="min-w-48">
                {insights[m.id] ? <TargetStatusSummary
                    evaluation={insights[m.id].evaluation}
                    unit={m.unit}
                    compact
                    problemHref={`/programas/${props.programId}${problemFromMetricPath(m.id)}`}
                  /> : null}
              </TableCell>
              <TableCell>{m.owner_name ?? <span className="text-soft">Sin responsable</span>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="mt-2 text-xs text-soft">
        {rows.length} métricas · ramas:{" "}
        {METRIC_BRANCHES.map((b) => `${METRIC_BRANCH_LABEL[b]} ${countByBranch(metrics)[b]}`).join(" · ")}
      </p>
    </div>
  );
}
