import {
  FlaskConical,
  Gavel,
  Lightbulb,
  ListOrdered,
  PencilRuler,
  Rocket,
  ScanSearch,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ExperimentStatus } from "@/domain/types";

// Mismo criterio que StatusBadge: grises por intensidad y amarillo solo para
// En prueba. Siempre se acompaña de ícono y etiqueta.
export const STATUS_FILL: Record<ExperimentStatus, { icon: LucideIcon; className: string }> = {
  idea: { icon: Lightbulb, className: "bg-paper text-soft border border-gray-3" },
  prioritized: { icon: ListOrdered, className: "bg-gray-1 text-ink border border-gray-3" },
  in_design: { icon: PencilRuler, className: "bg-gray-2 text-ink border border-gray-3" },
  in_test: { icon: FlaskConical, className: "bg-highlight text-[#1f1f1f] border border-highlight" },
  in_reading: { icon: ScanSearch, className: "bg-gray-3 text-[#1f1f1f] border border-gray-3 dark:text-paper" },
  decided: { icon: Gavel, className: "bg-gray-4 text-paper border border-gray-4" },
  scaled: { icon: Rocket, className: "bg-ink text-paper border border-ink" },
  discarded: { icon: XCircle, className: "bg-paper text-soft border border-dashed border-gray-3 line-through" },
};
