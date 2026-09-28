import { Hourglass, Timer } from "lucide-react";
import { Section, Stat } from "@/components/app/page";
import { bottleneckText, formatDays, type CycleTimeSummary } from "@/domain/cycle-time";
import { cn } from "@/lib/utils";

/**
 * Tiempo de ciclo: días típicos (mediana) en cada tramo del ciclo de vida y
 * tiempo hasta el aprendizaje. El tramo más lento se marca en amarillo.
 */
export function CycleTimePanel({ summary, className }: { summary: CycleTimeSummary; className?: string }) {
  const max = Math.max(1, ...summary.stages.map((s) => s.medianDays ?? 0));
  const bottleneck = bottleneckText(summary);
  const hasData = summary.stages.some((s) => s.count > 0) || summary.timeToLearning.count > 0;

  return (
    <Section
      className={className}
      title={
        <span className="inline-flex items-center gap-1.5">
          <Timer aria-hidden className="size-4" /> Tiempo de ciclo
        </span>
      }
      description="Días típicos (mediana) que se queda un ejercicio en cada estado antes de avanzar. Sale de la bitácora de cambios de estado."
    >
      {!hasData ? (
        <p className="text-sm text-soft">
          Todavía no hay ejercicios que hayan avanzado de estado. Cuando se muevan en el Kanban o con la barra de transiciones, aquí
          aparece cuánto tardan.
        </p>
      ) : (
        <div className="space-y-4">
          {bottleneck ? (
            <p className="flex items-start gap-1.5 rounded-xl border border-highlight bg-highlight/15 px-3 py-2 text-sm font-medium">
              <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0" />
              {bottleneck}.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <ul className="space-y-2 tabular-nums" aria-label="Días típicos por tramo">
              {summary.stages.map((s) => {
                const slow = summary.bottleneck?.stage === s.stage;
                return (
                  <li key={s.stage}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className={cn("truncate", slow && "font-semibold")}>{s.label}</span>
                      <span className="shrink-0">
                        {formatDays(s.medianDays)}
                        <span className="ml-1 text-xs text-soft">({s.count})</span>
                      </span>
                    </div>
                    <div aria-hidden className="mt-1 h-1.5 rounded-full bg-gray-1">
                      <div
                        className={cn("h-full rounded-full", slow ? "bg-highlight" : "bg-gray-4")}
                        style={{ width: `${((s.medianDays ?? 0) / max) * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            <Stat
              label="Tiempo hasta el aprendizaje"
              value={formatDays(summary.timeToLearning.medianDays)}
              hint={
                summary.timeToLearning.count
                  ? `Mediana desde que nace hasta la decisión · ${summary.timeToLearning.count} decidido${summary.timeToLearning.count === 1 ? "" : "s"}`
                  : "Aún no hay ejercicios decididos"
              }
            />
          </div>
          <p className="text-xs text-soft">Entre paréntesis, cuántos ejercicios ya pasaron por ese tramo.</p>
        </div>
      )}
    </Section>
  );
}
