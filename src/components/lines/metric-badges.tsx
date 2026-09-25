import { Filter, Gauge, Megaphone, RefreshCcw, Star, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { METRIC_BRANCH_LABEL, METRIC_TYPE_LABEL } from "@/domain/labels";
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
