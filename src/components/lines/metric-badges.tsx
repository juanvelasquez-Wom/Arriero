import {
  Briefcase,
  CircleDashed,
  Divide,
  Filter,
  Gauge,
  Megaphone,
  MonitorSmartphone,
  RefreshCcw,
  Star,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { formatMetricValue, formatShortDate } from "@/domain/format";
import { METRIC_BRANCH_LABEL, METRIC_SCOPE_LABEL, METRIC_TYPE_LABEL, PLATFORM_SCOPE_WARNING } from "@/domain/labels";
import { METRIC_GAP_LABEL, metricGaps, type FormulaCheck, type MetricScope } from "@/domain/metric-formula";
import type { MetricBranch, MetricDirection, MetricType } from "@/domain/types";
import { cn } from "@/lib/utils";

// Ramas en grises de distinta intensidad, siempre con ícono y etiqueta.
export const BRANCH_STYLE: Record<MetricBranch, { icon: LucideIcon; badge: string; border: string }> = {
  demand_volume: { icon: Megaphone, badge: "bg-gray-1 text-ink border-gray-2", border: "border-l-gray-2" },
  conversion: { icon: Filter, badge: "bg-gray-2 text-ink border-gray-3", border: "border-l-gray-3" },
  efficiency: { icon: Gauge, badge: "bg-gray-3 text-[#1f1f1f] border-gray-3 dark:text-paper", border: "border-l-gray-4" },
  recovery_recurrence: { icon: RefreshCcw, badge: "bg-gray-4 text-paper border-gray-4", border: "border-l-gray-5" },
};

export function BranchBadge({ branch, className }: { branch: MetricBranch; className?: string }) {
  const { icon: Icon, badge } = BRANCH_STYLE[branch];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[11px] font-medium whitespace-nowrap",
        badge,
        className,
      )}
    >
      <Icon aria-hidden className="size-3" />
      {METRIC_BRANCH_LABEL[branch]}
    </span>
  );
}

const TYPE_ICON: Record<MetricType, LucideIcon> = { north_star: Star, efficiency: Gauge, input: Filter };

export function MetricTypeBadge({ type, className }: { type: MetricType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[11px] font-medium whitespace-nowrap",
        type === "north_star" ? "border-highlight bg-highlight text-[#1f1f1f]" : "border-line bg-paper text-ink",
        className,
      )}
    >
      <Icon aria-hidden className="size-3" />
      {METRIC_TYPE_LABEL[type]}
    </span>
  );
}

export function DirectionLabel({ direction, className }: { direction: MetricDirection; className?: string }) {
  const Icon = direction === "up" ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}>
      <Icon aria-hidden className="size-3.5" />
      {direction === "up" ? "Debe subir" : "Debe bajar"}
    </span>
  );
}

/** Etiqueta de una métrica en listas de opciones: "Nombre · Rama/Tipo". */
export function metricOptionLabel(m: { name: string; type: MetricType; branch: MetricBranch | null }): string {
  const kind = m.type === "input" && m.branch ? METRIC_BRANCH_LABEL[m.branch] : METRIC_TYPE_LABEL[m.type];
  return `${m.name} · ${kind}`;
}

/** Alcance (negocio / plataforma), fórmula y lo que le falta a la métrica, con ícono y etiqueta. */
export function MetricDefinitionFlags({
  metric,
  nameOf,
  check,
  className,
}: {
  metric: { scope: MetricScope | null; numerator_id: string | null; denominator_id: string | null; definition: string | null; source: string | null; owner_id: string | null; unit: string | null };
  nameOf: (id: string) => string | undefined;
  check?: (FormulaCheck & { week: string }) | null;
  className?: string;
}) {
  const gaps = metricGaps(metric);
  const numerator = metric.numerator_id ? nameOf(metric.numerator_id) : undefined;
  const denominator = metric.denominator_id ? nameOf(metric.denominator_id) : undefined;
  if (!metric.scope && !gaps.length && !(numerator && denominator) && !check) return null;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {metric.scope ? (
          <span
            className={cn(
              "inline-flex h-5 items-center gap-1 rounded-full border px-1.5 font-medium whitespace-nowrap",
              metric.scope === "platform" ? "border-gray-3 bg-gray-1" : "border-line bg-paper",
            )}
            title={metric.scope === "platform" ? PLATFORM_SCOPE_WARNING : undefined}
          >
            {metric.scope === "platform" ? <MonitorSmartphone aria-hidden className="size-3" /> : <Briefcase aria-hidden className="size-3" />}
            {METRIC_SCOPE_LABEL[metric.scope]}
          </span>
        ) : null}
        {numerator && denominator ? (
          <span className="inline-flex h-5 items-center gap-1 rounded-full border border-line px-1.5 whitespace-nowrap text-soft">
            <Divide aria-hidden className="size-3" />
            {numerator} ÷ {denominator}
          </span>
        ) : null}
        {gaps.map((g) => (
          <span key={g} className="inline-flex h-5 items-center gap-1 rounded-full border border-dashed border-gray-3 px-1.5 font-medium whitespace-nowrap">
            <CircleDashed aria-hidden className="size-3" />
            {METRIC_GAP_LABEL[g]}
          </span>
        ))}
      </div>
      {metric.scope === "platform" ? <p className="text-xs text-soft">{PLATFORM_SCOPE_WARNING}</p> : null}
      {check && !check.coherent ? (
        <p className="flex items-start gap-1 text-xs font-medium text-ink">
          <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          No cuadra: en la semana del {formatShortDate(check.week)} se cargó {formatMetricValue(check.loaded, metric.unit)}, pero{" "}
          {numerator ?? "el numerador"} ÷ {denominator ?? "el denominador"} da {formatMetricValue(Math.round(check.expected * 100) / 100, metric.unit)}.
        </p>
      ) : null}
    </div>
  );
}
