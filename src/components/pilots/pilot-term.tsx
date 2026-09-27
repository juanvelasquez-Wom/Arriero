import type { ReactNode } from "react";
import { InfoTip } from "@/components/app/info-tip";
import { PILOT_TERMS, type PilotTermKey } from "@/domain/pilots/labels";
import { cn } from "@/lib/utils";

/** Término técnico del módulo con su explicación corta (burbuja ⓘ). */
export function PilotTerm({ k, children, className }: { k: PilotTermKey; children?: ReactNode; className?: string }) {
  const entry = PILOT_TERMS[k];
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {children ?? entry.label}
      <InfoTip label={entry.label}>{entry.simple}</InfoTip>
    </span>
  );
}
