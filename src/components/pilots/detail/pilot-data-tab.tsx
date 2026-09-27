import { CalendarRange, Database, Hand, Info, Lock, PencilLine, Plug } from "lucide-react";
import { Callout, EmptyState, Section } from "@/components/app/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { weekStart, todayIso } from "@/domain/dates";
import { formatDate, formatDateTime, formatNumber } from "@/domain/format";
import { defaultPeriod, groupByPeriod, type StoredValue } from "@/domain/pilots/data-entry";
import { allowedRange, baseMetricsFor, type ImportContext } from "@/domain/pilots/data-import";
import { MEASUREMENT_SOURCE_LABEL } from "@/domain/pilots/labels";
import { metricsForReading, needsPrePeriod, pilotGranularity } from "@/domain/pilots/reading";
import type { PilotArm, PilotMetricDef } from "@/domain/pilots/types";
import type { PilotCatalogs, PilotDetail } from "@/server/queries/pilots";
import { DeleteMeasurementButton, PilotCsvImport, PilotManualEntry } from "./pilot-data-client";

/** Solo los campos del motor (sin descripciones del catálogo) para pasar al cliente. */
function toDef(m: PilotMetricDef): PilotMetricDef {
  return {
    id: m.id,
    name: m.name,
    unit: m.unit,
    direction: m.direction,
    scope: m.scope,
    calc: m.calc,
    numerator_id: m.numerator_id,
    denominator_id: m.denominator_id,
    is_spend: m.is_spend,
  };
}

function valueText(metric: PilotMetricDef | undefined, value: number): string {
  return metric?.unit === "cop" ? `$ ${formatNumber(value)}` : formatNumber(value);
}

const SOURCE_ICON = { manual: Hand, csv: Database, mcp: Plug } as const;

export function PilotDataTab({ detail, catalogs, canLoad }: { detail: PilotDetail; catalogs: PilotCatalogs; canLoad: boolean }) {
  const { pilot } = detail;
  const today = todayIso();
  const granularity = pilotGranularity(pilot);
  const byCity = pilot.test_type === "geo";
  const needsPre = needsPrePeriod(pilot.test_type);
  const metricIds = [pilot.primary_metric_id, ...detail.guardrails.map((g) => g.metric_id)].filter((x): x is string => !!x);
  const base = baseMetricsFor(metricIds, catalogs.metrics).map(toDef);
  const coherenceMetrics = metricsForReading(metricIds, catalogs.metrics).map(toDef);
  const metricById = new Map(catalogs.metrics.map((m) => [m.id, toDef(m)]));
  const armById = new Map(detail.arms.map((a) => [a.id, a]));
  const range = allowedRange({
    plannedStart: pilot.planned_start,
    plannedEnd: pilot.planned_end,
    actualStart: pilot.actual_start,
    actualEnd: pilot.actual_end,
    preStart: pilot.design_config.pre_start ?? null,
    needsPre,
  });
  // En semanas, la primera semana arranca el lunes anterior al inicio.
  const entryRange = range && granularity === "week" ? { min: weekStart(range.min), max: range.max } : range;
  const arms: PilotArm[] = detail.arms.map((a) => ({ id: a.id, name: a.name, is_control: a.is_control, split_pct: a.split_pct, cities: a.cities }));
  const stored: StoredValue[] = detail.measurements.map((m) => ({
    arm_id: m.arm_id,
    metric_id: m.metric_id,
    unit_label: m.unit_label,
    period_start: m.period_start,
    granularity: m.granularity,
    value: m.value,
  }));
  const connected = detail.media.filter((m) => m.data_mode === "mcp").map((m) => m.media_name);
  const showCity = byCity || detail.measurements.some((m) => m.unit_label);
  const groups = groupByPeriod(detail.measurements);
  const person = (id: string | null) => (id ? (detail.people[id] ?? "Alguien del equipo") : "—");

  const designReady = !!pilot.test_type && !!pilot.primary_metric_id && detail.arms.length > 0 && base.length > 0;
  const closed = pilot.status === "decided" || pilot.status === "cancelled";

  return (
    <div className="space-y-5">
      <Section title="Qué se carga" description="Solo se cargan totales (sumas). Las tasas y los costos por resultado se calculan solos.">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-soft">Métricas que se cargan</dt>
            <dd className="mt-1.5 flex flex-wrap gap-1.5">
              {base.length ? (
                base.map((m) => (
                  <span key={m.id} className="inline-flex h-6 items-center rounded-full border border-line bg-wash px-2.5 text-xs font-medium">
                    {m.name}
                    {m.unit === "cop" ? " (COP)" : ""}
                  </span>
                ))
              ) : (
                <span className="text-soft">Todavía no hay métrica principal.</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-soft">Cada cuánto</dt>
            <dd className="mt-1.5 font-medium">{granularity === "week" ? "Por semana (fecha del lunes)" : "Por día"}</dd>
            {byCity ? <dd className="mt-0.5 text-xs text-soft">Por grupo y ciudad.</dd> : null}
          </div>
          <div>
            <dt className="text-xs font-medium text-soft">Fechas permitidas</dt>
            <dd className="mt-1.5 inline-flex items-center gap-1.5 font-medium tabular-nums">
              <CalendarRange aria-hidden className="size-4 text-soft" />
              {range ? `${formatDate(range.min)} – ${formatDate(range.max)}` : "Faltan las fechas del piloto"}
            </dd>
            {range && needsPre ? (
              <dd className="mt-0.5 text-xs text-soft">Incluye el periodo previo (el “antes”) para comparar.</dd>
            ) : null}
          </div>
        </dl>
        <p className="mt-4 flex items-start gap-1.5 text-xs text-soft">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {connected.length
              ? `${connected.join(", ")} ${connected.length === 1 ? "tiene" : "tienen"} integración; lo demás va a mano. `
              : ""}
            Si el medio no tiene integración, todo va a mano: nada se bloquea.
          </span>
        </p>
      </Section>

      {!canLoad ? (
        <Callout icon={Lock} tone="neutral" title="Solo lectura">
          {closed
            ? "El piloto ya se cerró: los datos quedan como se leyeron."
            : "Con el rol de Lector se ven los datos, pero no se cargan. Si necesita cargar, pídale a un aprobador el rol de Creador."}
        </Callout>
      ) : !designReady ? (
        <Callout icon={PencilLine} title="Primero el diseño">
          Para cargar datos el piloto necesita tipo de prueba, métrica principal y grupos. Complételos en el asistente.
        </Callout>
      ) : !range ? (
        <Callout icon={CalendarRange} title="Faltan las fechas del piloto">
          Ponga las fechas planeadas en el asistente para saber qué periodos se pueden cargar.
        </Callout>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <PilotManualEntry
            pilotId={pilot.id}
            arms={arms}
            metrics={base}
            coherenceMetrics={coherenceMetrics}
            byCity={byCity}
            granularity={granularity}
            range={entryRange!}
            stored={stored}
            initialPeriod={defaultPeriod(today, granularity, entryRange)}
          />
          <PilotCsvImport
            pilotId={pilot.id}
            pilotTitle={pilot.title}
            today={today}
            coherenceMetrics={coherenceMetrics}
            context={
              {
                arms,
                metrics: base,
                byCity,
                granularity,
                minDate: entryRange!.min,
                maxDate: entryRange!.max,
              } satisfies ImportContext
            }
          />
        </div>
      )}

      <Section title="Datos cargados" description="Del periodo más reciente al más antiguo.">
        {groups.length === 0 ? (
          <EmptyState
            art="mula-datos"
            icon={Database}
            title="Todavía no hay datos"
            description={canLoad ? "Cargue el primer periodo a mano o suba un CSV." : "Cuando el equipo cargue el primer periodo, aparece aquí."}
            className="py-8"
          />
        ) : (
          <div className="stagger space-y-3">
            {groups.map((g, i) => (
              <details key={`${g.period}|${g.granularity}`} open={i < 3} className="group rounded-xl border">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ink">
                  <span className="tabular-nums">
                    {g.granularity === "week" ? `Semana del ${formatDate(g.period)}` : formatDate(g.period)}
                  </span>
                  <span className="text-xs font-normal text-soft tabular-nums">
                    {g.rows.length} {g.rows.length === 1 ? "valor" : "valores"}
                    {g.granularity !== granularity ? ` · cargado ${g.granularity === "week" ? "por semana" : "por día"}, no entra en la lectura` : ""}
                  </span>
                </summary>
                <div className="border-t">
                  <Table className="tabular-nums">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Grupo</TableHead>
                        {showCity ? <TableHead>Ciudad</TableHead> : null}
                        <TableHead>Métrica</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Fuente</TableHead>
                        <TableHead>Última actualización</TableHead>
                        {canLoad ? <TableHead className="w-10"><span className="sr-only">Acciones</span></TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.rows.map((m) => {
                        const metric = metricById.get(m.metric_id);
                        const armName = armById.get(m.arm_id)?.name ?? "Grupo";
                        const SourceIcon = SOURCE_ICON[m.source];
                        const adjusted = m.original_value != null && !!m.adjusted_at;
                        const label = `${metric?.name ?? "el dato"} de ${armName}${m.unit_label ? ` (${m.unit_label})` : ""} del ${formatDate(m.period_start)}`;
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="font-medium">{armName}</TableCell>
                            {showCity ? <TableCell>{m.unit_label || "—"}</TableCell> : null}
                            <TableCell>{metric?.name ?? "Métrica"}</TableCell>
                            <TableCell className="text-right">
                              {valueText(metric, m.value)}
                              {adjusted ? (
                                <span className="mt-0.5 block text-xs text-soft">
                                  Original: {valueText(metric, m.original_value!)}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex h-6 items-center gap-1 rounded-full border border-line bg-paper px-2 text-xs font-medium">
                                  <SourceIcon aria-hidden className="size-3.5" />
                                  {MEASUREMENT_SOURCE_LABEL[m.source]}
                                </span>
                                {adjusted ? (
                                  <span
                                    className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-gray-4 px-2 text-xs font-semibold"
                                    title={`Ajustado por ${person(m.adjusted_by)} el ${formatDateTime(m.adjusted_at)}`}
                                  >
                                    <PencilLine aria-hidden className="size-3.5" />
                                    Ajustado a mano
                                  </span>
                                ) : null}
                              </span>
                              {adjusted ? (
                                <span className="mt-0.5 block text-xs text-soft">
                                  {person(m.adjusted_by)} · {formatDateTime(m.adjusted_at)}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-xs text-soft">
                              <span className="block text-ink">{person(m.updated_by ?? m.created_by)}</span>
                              {formatDateTime(m.updated_at)}
                            </TableCell>
                            {canLoad ? (
                              <TableCell>
                                <DeleteMeasurementButton pilotId={pilot.id} measurementId={m.id} label={label} />
                              </TableCell>
                            ) : null}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </details>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
