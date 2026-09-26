import {
  CheckCheck,
  CircleDashed,
  CircleDot,
  FlaskConical,
  Gavel,
  Lightbulb,
  ListOrdered,
  PencilRuler,
  Rocket,
  ScanSearch,
  Trophy,
  XCircle,
  MinusCircle,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { STATUS_LABEL, VERDICT_LABEL, DECISION_LABEL, PROBLEM_STATUS_LABEL, IMPACT_LABEL } from "@/domain/labels";
import type { Decision, ExperimentStatus, ImpactLevel, ProblemStatus, Verdict } from "@/domain/types";
import { cn } from "@/lib/utils";

// Estados en grises de distinta intensidad; amarillo solo para En prueba y Ganador.
// Siempre ícono + etiqueta: nunca se depende solo del color.
const STATUS_STYLE: Record<ExperimentStatus, { icon: LucideIcon; className: string }> = {
  idea: { icon: Lightbulb, className: "bg-paper text-soft border-line" },
  prioritized: { icon: ListOrdered, className: "bg-gray-1 text-ink border-gray-2" },
  in_design: { icon: PencilRuler, className: "bg-gray-2 text-ink border-gray-3" },
  in_test: { icon: FlaskConical, className: "bg-highlight text-[#1f1f1f] border-highlight" },
  in_reading: { icon: ScanSearch, className: "bg-gray-3 text-[#1f1f1f] border-gray-3 dark:text-paper" },
  decided: { icon: Gavel, className: "bg-gray-4 text-paper border-gray-4" },
  scaled: { icon: Rocket, className: "bg-ink text-paper border-ink" },
  discarded: { icon: XCircle, className: "bg-paper text-soft border-dashed border-gray-3 line-through decoration-gray-3" },
};

export function StatusBadge({ status, className }: { status: ExperimentStatus; className?: string }) {
  const { icon: Icon, className: style } = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap",
        style,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {STATUS_LABEL[status]}
    </span>
  );
}

const VERDICT_STYLE: Record<Verdict, { icon: LucideIcon; className: string }> = {
  winner: { icon: Trophy, className: "bg-highlight text-[#1f1f1f] border-highlight" },
  loser: { icon: XCircle, className: "bg-gray-4 text-paper border-gray-4" },
  inconclusive: { icon: HelpCircle, className: "bg-gray-1 text-ink border-gray-2" },
};

export function VerdictBadge({ verdict, className }: { verdict: Verdict | null; className?: string }) {
  if (!verdict) return <span className="text-soft">—</span>;
  const { icon: Icon, className: style } = VERDICT_STYLE[verdict];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold", style, className)}>
      <Icon aria-hidden className="size-3.5" />
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

const DECISION_ICON: Record<Decision, LucideIcon> = { scale: Rocket, adjust: CircleDot, kill: MinusCircle };

export function DecisionBadge({ decision }: { decision: Decision | null }) {
  if (!decision) return <span className="text-soft">—</span>;
  const Icon = DECISION_ICON[decision];
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full border border-line bg-paper px-2 text-xs font-medium">
      <Icon aria-hidden className="size-3.5" />
      {DECISION_LABEL[decision]}
    </span>
  );
}

const PROBLEM_ICON: Record<ProblemStatus, LucideIcon> = {
  to_validate: CircleDashed,
  validated: CheckCheck,
  discarded: XCircle,
};

export function ProblemStatusBadge({ status }: { status: ProblemStatus }) {
  const Icon = PROBLEM_ICON[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold",
        status === "validated" ? "border-ink/30 bg-gray-1 text-ink" : "border-line bg-paper text-soft",
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {PROBLEM_STATUS_LABEL[status]}
    </span>
  );
}

export function ImpactBadge({ impact }: { impact: ImpactLevel }) {
  const bars = impact === "high" ? 3 : impact === "medium" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span aria-hidden className="inline-flex items-end gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn("w-1 rounded-sm", i <= bars ? "bg-ink" : "bg-gray-2")} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      {IMPACT_LABEL[impact]}
    </span>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border border-dashed border-gray-4 px-2 text-[11px] font-semibold uppercase tracking-wide text-soft",
        className,
      )}
    >
      Ejemplo
    </span>
  );
}
