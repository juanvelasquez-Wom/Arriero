import { ArrowDown, ArrowUp, Minus, TrendingDown, Waypoints } from "lucide-react";
import Link from "next/link";
import { Fold } from "@/components/app/fold";
import { Callout, Section } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { formatMetricValue, formatPercent, formatShortDate, formatSignedPercent } from "@/domain/format";
import type { FunnelDropResult, FunnelDropStage } from "@/domain/funnel";
import { cn } from "@/lib/utils";

/** "+2,1 pp" / "−0,5 pp". */
function formatPoints(delta: number | null): string {
  if (delta == null || !Number.isFinite(delta)) return "—";
  const v = Math.abs(delta * 100);
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return `${sign}${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(v)} pp`;
}

function Change({ value, label }: { value: number | null; label: string }) {
  const Icon = value == null || value === 0 ? Minus : value > 0 ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only">{label}: </span>
      {formatSignedPercent(value)}
    </span>
  );
}

/**
 * "Caída del embudo": valor de cada etapa (según su métrica), paso desde la
 * etapa anterior, cambio frente a la semana anterior y al promedio de 4 semanas,
 * y el paso donde más gente se cae.
 */
export function FunnelDropOff({ result, loadHref }: { result: FunnelDropResult; loadHref: string }) {
  const description =
    "Sale de la métrica de cada etapa. El paso es el valor de la etapa dividido por el de la anterior.";

  if (result.status === "no_stages") return null;
  if (result.status === "no_metrics") {
    return (
      <Section title="Caída del embudo">
        <p className="flex items-start gap-2 text-sm text-soft">
          <TrendingDown aria-hidden className="mt-0.5 size-4 shrink-0" />
          Asígnele una métrica a cada etapa (en las etapas, más abajo) y con los valores semanales aquí se ve dónde se cae la gente.
        </p>
      </Section>
    );
  }
  if (result.status === "no_values") {
    return (
      <Section
        title="Caída del embudo"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={loadHref}>
              <Waypoints aria-hidden /> Ir a la carga semanal
            </Link>
          </Button>
        }
      >
        <p className="flex items-start gap-2 text-sm text-soft">
          <TrendingDown aria-hidden className="mt-0.5 size-4 shrink-0" />
          Las etapas ya tienen métrica, pero faltan los valores semanales. Cárguelos y aquí se ve dónde se cae la gente.
        </p>
      </Section>
    );
  }

  const biggest = result.stages.find((s) => s.biggestDrop) ?? null;
  const biggestIndex = biggest ? result.stages.indexOf(biggest) : -1;
  const before = biggestIndex > 0 ? result.stages[biggestIndex - 1] : null;

  return (
    <Section
      title="Caída del embudo"
      description={`${description} Semana del ${formatShortDate(result.week)}.`}
    >
      {biggest && before ? (
        <Callout icon={TrendingDown} title="Aquí se está cayendo más gente" className="mb-4">
          De {before.name} a {biggest.name} solo pasa el {formatPercent(biggest.conversion)}
          {biggest.conversionChange != null ? ` (${formatPoints(biggest.conversionChange)} frente a la semana anterior)` : ""}. Ahí
          vale la pena buscar un problema con evidencia.
        </Callout>
      ) : null}

      <Fold bare open={!(biggest && before)} title="Ver el paso de cada etapa">
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[640px] text-sm tabular-nums">
          <caption className="sr-only">Valor por etapa, paso desde la etapa anterior y cambios</caption>
          <thead>
            <tr className="border-b text-left text-xs text-soft">
              <th scope="col" className="py-2 pr-3 font-medium">Etapa</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Valor</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Paso desde la anterior</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Vs. semana anterior</th>
              <th scope="col" className="py-2 text-right font-medium">Vs. promedio 4 semanas</th>
            </tr>
          </thead>
          <tbody>
            {result.stages.map((s, i) => (
              <StageRow key={s.id} stage={s} index={i} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 space-y-1 text-xs text-soft">
        {result.withoutMetric ? (
          <p>
            {result.withoutMetric === 1 ? "1 etapa no tiene métrica" : `${result.withoutMetric} etapas no tienen métrica`}: asígnele una
            métrica a cada etapa para ver dónde se cae la gente.
          </p>
        ) : null}
        {result.rateSteps ? (
          <p>Los pasos donde alguna etapa se mide en % no se dividen: compare esas tasas directamente.</p>
        ) : null}
      </div>
      </Fold>
    </Section>
  );
}

function StageRow({ stage: s, index }: { stage: FunnelDropStage; index: number }) {
  return (
    <tr className={cn("border-b last:border-b-0", s.biggestDrop && "bg-highlight/15")}>
      <th scope="row" className={cn("py-2 pr-3 text-left font-medium", s.biggestDrop && "border-l-4 border-l-highlight pl-2")}>
        <span className="flex items-center gap-1.5">
          <span className="text-xs text-soft">{index + 1}.</span>
          {s.name}
          {s.biggestDrop ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-highlight px-1.5 py-0.5 text-[11px] font-semibold text-[#1f1f1f]">
              <TrendingDown aria-hidden className="size-3" /> Mayor caída
            </span>
          ) : null}
        </span>
        <span className="block text-xs font-normal text-soft">{s.metricName ?? "Sin métrica"}</span>
      </th>
      <td className="py-2 pr-3 text-right">{s.metricId ? formatMetricValue(s.value, s.unit) : <span className="text-soft">—</span>}</td>
      <td className="py-2 pr-3 text-right">
        {s.conversion != null ? (
          <>
            {formatPercent(s.conversion)}
            {s.conversionChange != null ? <span className="block text-xs text-soft">{formatPoints(s.conversionChange)}</span> : null}
          </>
        ) : (
          <span className="text-soft">{index === 0 ? "Entrada" : "—"}</span>
        )}
      </td>
      <td className="py-2 pr-3 text-right">
        {s.changeVsPreviousWeek != null ? <Change value={s.changeVsPreviousWeek} label="Cambio frente a la semana anterior" /> : <span className="text-soft">—</span>}
      </td>
      <td className="py-2 text-right">
        {s.changeVsAverage4 != null ? <Change value={s.changeVsAverage4} label="Cambio frente al promedio de 4 semanas" /> : <span className="text-soft">—</span>}
      </td>
    </tr>
  );
}
