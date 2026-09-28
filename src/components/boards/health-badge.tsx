import { CircleCheck, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { HEALTH_LABEL, type Health, type HealthLevel } from "@/domain/boards";
import { cn } from "@/lib/utils";

// Semáforo sin rojo ni verde (regla de marca): gris oscuro = en riesgo,
// amarillo = atención, contorno claro = al día. Siempre ícono + etiqueta.
const STYLE: Record<HealthLevel, { icon: LucideIcon; className: string }> = {
  red: { icon: OctagonAlert, className: "bg-ink text-paper border-ink" },
  yellow: { icon: TriangleAlert, className: "bg-highlight text-[#1f1f1f] border-highlight" },
  green: { icon: CircleCheck, className: "bg-paper text-soft border-line" },
};

export function HealthBadge({ health, className }: { health: Health; className?: string }) {
  const { icon: Icon, className: style } = STYLE[health.level];
  return (
    <span
      title={health.reasons.join(" ") || "Sin alertas."}
      className={cn("inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[11px] font-semibold whitespace-nowrap", style, className)}
    >
      <Icon aria-hidden className="size-3" />
      {HEALTH_LABEL[health.level]}
    </span>
  );
}

export function HealthLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-soft" aria-label="Semáforo">
      <span className="inline-flex items-center gap-1.5">
        <HealthBadge health={{ level: "red", reasons: [] }} /> pasó la fecha de fin o choca con un congelamiento
      </span>
      <span className="inline-flex items-center gap-1.5">
        <HealthBadge health={{ level: "yellow", reasons: [] }} /> quieto, atrasado o sin datos recientes
      </span>
      <span className="inline-flex items-center gap-1.5">
        <HealthBadge health={{ level: "green", reasons: [] }} /> va bien
      </span>
    </div>
  );
}
