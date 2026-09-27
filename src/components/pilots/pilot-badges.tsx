import {
  Ban,
  CircleCheck,
  CircleDashed,
  FlaskConical,
  Gavel,
  Lock,
  PencilLine,
  ScanSearch,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { PILOT_STATUS_LABEL, PILOT_TEST_TYPE_LABEL, WEAK_EVIDENCE_LABEL } from "@/domain/pilots/labels";
import type { PilotStatus, PilotTestType } from "@/domain/pilots/types";
import { cn } from "@/lib/utils";

// Mismo lenguaje visual que StatusBadge de los ejercicios: grises de distinta
// intensidad y amarillo solo para "En prueba". Siempre ícono + etiqueta.
const STYLE: Record<PilotStatus, { icon: LucideIcon; className: string }> = {
  draft: { icon: PencilLine, className: "bg-paper text-soft border-line" },
  in_review: { icon: CircleDashed, className: "bg-gray-1 text-ink border-gray-2" },
  approved: { icon: Lock, className: "bg-gray-2 text-ink border-gray-3" },
  in_test: { icon: FlaskConical, className: "bg-highlight text-[#1f1f1f] border-highlight" },
  in_reading: { icon: ScanSearch, className: "bg-gray-3 text-[#1f1f1f] border-gray-3 dark:text-paper" },
  decided: { icon: Gavel, className: "bg-gray-4 text-paper border-gray-4" },
  cancelled: { icon: Ban, className: "bg-paper text-soft border-dashed border-gray-3 line-through decoration-gray-3" },
};

export function PilotStatusBadge({ status, className }: { status: PilotStatus; className?: string }) {
  const { icon: Icon, className: style } = STYLE[status];
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap", style, className)}
    >
      <Icon aria-hidden className="size-3.5" />
      {PILOT_STATUS_LABEL[status]}
    </span>
  );
}

/** Tipo de prueba; antes / después lleva siempre la etiqueta "Evidencia débil". */
export function PilotTestTypeBadge({ testType, className }: { testType: PilotTestType | null; className?: string }) {
  if (!testType) return <span className="text-xs text-soft">Sin tipo de prueba</span>;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 text-xs font-medium whitespace-nowrap">
        <CircleCheck aria-hidden className="size-3.5 text-soft" />
        {PILOT_TEST_TYPE_LABEL[testType]}
      </span>
      {testType === "pre_post" ? <WeakEvidenceBadge /> : null}
    </span>
  );
}

export function WeakEvidenceBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-gray-4 px-2.5 text-xs font-semibold whitespace-nowrap",
        className,
      )}
      title="Antes / después con control: úsela con cuidado."
    >
      <TriangleAlert aria-hidden className="size-3.5" />
      {WEAK_EVIDENCE_LABEL}
    </span>
  );
}
