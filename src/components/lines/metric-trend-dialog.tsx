"use client";

import { CalendarPlus, ChartLine } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/app/page";
import { TiaExplainMetric } from "@/components/tia/tia-explain-metric";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { TargetEvaluation } from "@/domain/targets";
import type { MetricHistoryRow } from "@/server/queries/structure";
import { MetricEvolutionChart, type ChartTarget } from "./metric-evolution-chart";
import { MetricHistoryList } from "./metric-history";
import { TargetStatusSummary } from "./target-status";

/** Tendencia semanal, semáforo e historial de una métrica de entrada, en un diálogo. */
export function MetricTrendDialog({
  name,
  unit,
  baseline,
  series,
  targets,
  evaluation,
  history,
  trigger,
  programId,
  metricId,
}: {
  name: string;
  unit: string | null;
  baseline: number | null;
  series: { week_start: string; value: number }[];
  targets: ChartTarget[];
  evaluation: TargetEvaluation;
  history: MetricHistoryRow[];
  trigger: ReactNode;
  /** Con programa y métrica aparece "La Tía le explica los números". */
  programId?: string;
  metricId?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>Evolución semanal frente a la línea base y la meta.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <TargetStatusSummary evaluation={evaluation} unit={unit} />
          {programId && metricId && series.length ? <TiaExplainMetric programId={programId} metricId={metricId} /> : null}
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-soft">
              <ChartLine aria-hidden className="size-3.5" /> Evolución semanal
            </h3>
            {series.length ? (
              <MetricEvolutionChart name={name} values={series} baseline={baseline} targets={targets} unit={unit} />
            ) : (
              <EmptyState art="portatil"
                icon={CalendarPlus}
                className="py-6"
                title="Todavía no hay valores semanales"
                description="Cárguelos en la carga semanal y aquí aparece la tendencia."
              />
            )}
          </div>
          <MetricHistoryList rows={history} unit={unit} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
