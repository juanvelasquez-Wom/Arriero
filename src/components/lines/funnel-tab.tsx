import { ClipboardList, FlaskConical, Filter, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { EmptyState, Section } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { funnelStats, funnelWidths, type FunnelStageStats } from "@/domain/metric-tree";
import { cn } from "@/lib/utils";
import type { StageRow } from "@/server/queries/structure";
import type { Option } from "./metric-form-dialog";
import { StageEditor } from "./stage-editor";

interface Props {
  programId: string;
  lineId: string;
  stages: StageRow[];
  problems: Parameters<typeof funnelStats>[1];
  experiments: Parameters<typeof funnelStats>[2];
  metricOptions: Option[];
  canEdit: boolean;
  canDelete: boolean;
}

/** Pestaña "Embudo": visualización con conteos por etapa y editor de etapas. */
export function FunnelTab({ programId, lineId, stages, problems, experiments, metricOptions, canEdit, canDelete }: Props) {
  const stats = funnelStats(stages, problems, experiments);
  const widths = funnelWidths(stages.length);
  const attention = stats.filter((s) => s.needsAttention).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <Section
        title="Embudo de la línea"
        description="Problemas (sin contar descartados) y ejercicios vigentes por etapa. Un ejercicio cuenta en la etapa de su problema."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/programas/${programId}/problemas`}>
              <ClipboardList aria-hidden /> Ver problemas
            </Link>
          </Button>
        }
      >
        {stages.length === 0 ? (
          <EmptyState
            icon={Filter}
            title="El embudo no tiene etapas"
            description="Las etapas ordenan el recorrido del cliente (adquisición, activación, conversión, recuperación). Cada problema se ubica en una etapa."
          />
        ) : (
          <>
            {attention ? (
              <p className="mb-3 flex items-center gap-1.5 text-sm">
                <TriangleAlert aria-hidden className="size-4" />
                {attention === 1
                  ? "1 etapa tiene problemas validados y ningún ejercicio."
                  : `${attention} etapas tienen problemas validados y ningún ejercicio.`}
              </p>
            ) : null}
            <ol className="flex flex-col items-center gap-1.5" aria-label="Etapas del embudo">
              {stages.map((s, i) => (
                <FunnelBar key={s.id} name={s.name} index={i} width={widths[i]} stat={stats[i]} />
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-soft">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-3 rounded-sm border bg-gray-1" /> Con actividad
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-3 rounded-sm border border-highlight bg-highlight/40" />
                <TriangleAlert aria-hidden className="size-3" /> Problemas validados sin ejercicio
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-3 rounded-sm border border-dashed bg-paper" /> Vacía
              </span>
            </div>
          </>
        )}
      </Section>

      <Section title="Etapas" description="Edite el nombre, qué significa en esta línea, la métrica que la mide y el orden.">
        <StageEditor
          programId={programId}
          lineId={lineId}
          stages={stages}
          metricOptions={metricOptions}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </Section>
    </div>
  );
}

function FunnelBar({ name, index, width, stat }: { name: string; index: number; width: number; stat: FunnelStageStats }) {
  const status = stat.needsAttention ? "Requiere atención" : stat.empty ? "Vacía" : null;
  return (
    <li
      style={{ width: `${Math.round(width * 100)}%` }}
      className={cn(
        "min-w-[15rem] max-w-full rounded-xl border px-3 py-2",
        stat.needsAttention
          ? "border-highlight bg-highlight/25"
          : stat.empty
            ? "border-dashed bg-paper text-soft"
            : "border-gray-2 bg-gray-1",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 items-center gap-1.5 font-medium">
          <span className="text-xs tabular-nums text-soft">{index + 1}.</span>
          <span className="truncate">{name}</span>
          {stat.needsAttention ? <TriangleAlert aria-hidden className="size-4 shrink-0" /> : null}
          {status ? <span className="sr-only">({status})</span> : null}
        </span>
        <span className="flex items-center gap-3 text-xs tabular-nums">
          <span className="inline-flex items-center gap-1" title="Problemas">
            <ClipboardList aria-hidden className="size-3.5" />
            {stat.problems} {stat.problems === 1 ? "problema" : "problemas"}
            {stat.validatedProblems ? <span className="text-soft">({stat.validatedProblems} validados)</span> : null}
          </span>
          <span className="inline-flex items-center gap-1" title="Ejercicios">
            <FlaskConical aria-hidden className="size-3.5" />
            {stat.experiments} {stat.experiments === 1 ? "ejercicio" : "ejercicios"}
          </span>
        </span>
      </div>
      {stat.needsAttention ? (
        <p className="mt-0.5 text-xs">Hay problemas validados sin ejercicio. ¿Y por dónde es? Diseñe uno.</p>
      ) : stat.empty ? (
        <p className="mt-0.5 text-xs">Sin problemas ni ejercicios.</p>
      ) : null}
    </li>
  );
}
