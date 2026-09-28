import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatSignedPercent } from "@/domain/format";
import { trendTone } from "@/domain/pilots/campaigns";
import { cn } from "@/lib/utils";

/** Cambio vs. el periodo anterior: flecha + %. Lo que empeora se resalta (amarillo = atención). */
export function Trend({ change, lowerIsBetter = false, neutral = false }: { change: number | null; lowerIsBetter?: boolean; neutral?: boolean }) {
  const raw = trendTone(change, lowerIsBetter);
  // En la inversión subir o bajar no es bueno ni malo por sí solo.
  const tone = neutral && (raw === "good" || raw === "bad") ? "neutral" : raw;
  if (tone === "none") return <span className="text-xs text-soft">sin base</span>;
  const Icon = tone === "flat" ? Minus : change! > 0 ? ArrowUpRight : ArrowDownRight;
  const label = tone === "flat" ? "igual" : formatSignedPercent(change);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 text-xs tabular-nums",
        tone === "bad" ? "bg-highlight/25 font-semibold text-ink" : "text-soft",
      )}
      title={tone === "bad" ? "Empeoró frente al periodo anterior" : tone === "good" ? "Mejoró frente al periodo anterior" : tone === "neutral" ? "Cambio frente al periodo anterior" : "Sin cambio"}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
      <span className="sr-only">{tone === "bad" ? " (empeoró)" : tone === "good" ? " (mejoró)" : ""}</span>
    </span>
  );
}
