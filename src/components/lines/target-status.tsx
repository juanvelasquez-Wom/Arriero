import { CircleAlert, CircleCheck, CircleDashed, FilePlus2, OctagonAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { suggestsProblem } from "@/domain/home";
import { formatMetricValue, formatSignedPercent } from "@/domain/format";
import { NO_DATA_REASON_LABEL, TARGET_STATUS_LABEL, type TargetEvaluation, type TargetStatus } from "@/domain/targets";
import { cn } from "@/lib/utils";

// Semáforo sutil: color semántico suave, siempre con ícono y etiqueta.
const STYLE: Record<TargetStatus, { icon: LucideIcon; badge: string }> = {
  on_track: {
    icon: CircleCheck,
    badge: "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  },
  behind: {
    icon: CircleAlert,
    badge: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  },
  off_track: {
    icon: OctagonAlert,
    badge: "border-red-600/30 bg-red-600/10 text-red-800 dark:text-red-300",
  },
  no_data: { icon: CircleDashed, badge: "border-line bg-paper text-soft" },
};

export function TargetStatusBadge({ status, className }: { status: TargetStatus; className?: string }) {
  const { icon: Icon, badge } = STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[11px] font-semibold whitespace-nowrap",
        badge,
        className,
      )}
    >
      <Icon aria-hidden className="size-3" />
      {TARGET_STATUS_LABEL[status]}
    </span>
  );
}

/** "Convertir en problema": atajo cuando la métrica va atrás. */
function ProblemLink({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-ink underline underline-offset-4">
      <FilePlus2 aria-hidden className="size-3.5" /> Convertir en oportunidad de mejora
    </Link>
  );
}

/**
 * Semáforo + "valor vs. esperado". `compact` = una sola línea para listas y
 * nodos del árbol. Con `problemHref`, si va atrás ofrece convertirlo en problema.
 */
export function TargetStatusSummary({
  evaluation: ev,
  unit,
  compact = false,
  problemHref,
  className,
}: {
  evaluation: TargetEvaluation;
  unit: string | null;
  compact?: boolean;
  problemHref?: string;
  className?: string;
}) {
  const problem = problemHref && suggestsProblem(ev.status) ? <ProblemLink href={problemHref} /> : null;
  if (ev.status === "no_data") {
    return (
      <span className={cn("inline-flex flex-wrap items-center gap-1.5 text-xs text-soft", className)}>
        <TargetStatusBadge status="no_data" />
        {ev.reason ? NO_DATA_REASON_LABEL[ev.reason] : null}
      </span>
    );
  }
  const detail = (
    <>
      <span className="font-medium text-ink">{formatMetricValue(ev.latest, unit)}</span> vs.{" "}
      {formatMetricValue(ev.expected != null ? Math.round(ev.expected * 100) / 100 : null, unit)} esperado
      {ev.gap != null ? ` (${formatSignedPercent(ev.gap)})` : ""}
    </>
  );
  if (compact) {
    return (
      <span className={cn("inline-flex flex-wrap items-center gap-1.5 text-xs text-soft tabular-nums", className)}>
        <TargetStatusBadge status={ev.status} />
        <span>{detail}</span>
        {problem}
      </span>
    );
  }
  return (
    <div className={cn("space-y-1 text-sm tabular-nums", className)}>
      <TargetStatusBadge status={ev.status} />
      <p className="text-soft">{detail}</p>
      <p className="text-xs text-soft">
        Meta {ev.horizonName}: {formatMetricValue(ev.target, unit)} · camino recto desde la línea base.
      </p>
      {problem}
    </div>
  );
}
