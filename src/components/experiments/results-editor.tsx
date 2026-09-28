"use client";

import { Save, ShieldAlert, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Term } from "@/components/app/info-tip";
import { Callout } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { describeGuardrail, evaluateGuardrails, type ExperimentGuardrail } from "@/domain/experiment-guardrails";
import { formatNumber, formatPercent, formatSignedPercent } from "@/domain/format";
import { readExperiment, type VariantReading } from "@/domain/results";
import { DIRECTIONAL_LABEL, formatProbability } from "@/domain/stats";
import type { TestType, Variant } from "@/domain/types";
import { formatValueRange, UNIT_VALUE_HINT, type MetricEconomics } from "@/domain/value";
import { cn } from "@/lib/utils";
import { saveResults } from "@/server/actions/experiments";

type Row = { id: string; sample: string; conversions: string; metric_value: string; notes: string; guardrails: Record<string, string> };

const toNum = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

export function ResultsEditor({
  programId,
  experimentId,
  variants,
  canEdit,
  isWinner,
  testType,
  metric,
  guardrails = [],
}: {
  programId: string;
  experimentId: string;
  variants: (Variant & { guardrail_values?: Record<string, number> })[];
  canEdit: boolean;
  isWinner?: boolean;
  testType: TestType | null;
  /** Datos económicos de la métrica del árbol (valor estimado). */
  metric: MetricEconomics | null;
  /** Guardrails fijados en el diseño: se carga un valor por variante. */
  guardrails?: ExperimentGuardrail[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    variants.map((v) => ({
      id: v.id,
      sample: v.sample?.toString() ?? "",
      conversions: v.conversions?.toString() ?? "",
      metric_value: v.metric_value?.toString() ?? "",
      notes: v.notes ?? "",
      guardrails: Object.fromEntries(guardrails.map((g) => [g.id, v.guardrail_values?.[g.id]?.toString() ?? ""])),
    })),
  );
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const reading = useMemo(
    () =>
      readExperiment({
        variants: variants.map((v, i) => ({
          ...v,
          sample: toNum(rows[i]?.sample ?? ""),
          conversions: toNum(rows[i]?.conversions ?? ""),
          metric_value: toNum(rows[i]?.metric_value ?? ""),
        })),
        testType,
        metric,
      }),
    [variants, rows, testType, metric],
  );
  const guardrailReadings = useMemo(
    () =>
      evaluateGuardrails(
        guardrails,
        variants.map((v, i) => ({
          id: v.id,
          name: v.name,
          is_control: v.is_control,
          guardrail_values: Object.fromEntries(guardrails.map((g) => [g.id, toNum(rows[i]?.guardrails[g.id] ?? "")])),
        })),
      ),
    [guardrails, variants, rows],
  );
  const live = reading.rows;
  const directional = reading.kind === "directional";
  const invalid = rows.some(
    (r) =>
      [r.sample, r.conversions, r.metric_value, ...Object.values(r.guardrails)].some((x) => x.trim() !== "" && !Number.isFinite(toNum(x))),
  );

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function updateGuardrail(i: number, guardrailId: string, value: string) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, guardrails: { ...r.guardrails, [guardrailId]: value } } : r)));
  }

  function save() {
    setError(undefined);
    startTransition(async () => {
      const r = await saveResults(
        programId,
        experimentId,
        rows.map((x) => {
          const values: Record<string, number> = {};
          for (const [gid, s] of Object.entries(x.guardrails)) {
            const n = toNum(s);
            if (n != null && Number.isFinite(n)) values[gid] = n;
          }
          return {
            id: x.id,
            sample: toNum(x.sample),
            conversions: toNum(x.conversions),
            metric_value: toNum(x.metric_value),
            notes: x.notes,
            // Solo si hay guardrails: así sigue funcionando sin la migración de guardrails.
            ...(guardrails.length ? { guardrail_values: values } : {}),
          };
        }),
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success("¡Eso! Resultados guardados", { description: "Ahora sí hay con qué decidir." });
      router.refresh();
    });
  }

  if (!variants.length) {
    return <p className="text-sm text-soft">Defina las variantes en el diseño de la prueba para poder cargar resultados.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variante</TableHead>
              <TableHead className="text-right">Muestra</TableHead>
              <TableHead className="text-right">Conversiones</TableHead>
              <TableHead className="text-right">Valor de la métrica</TableHead>
              <TableHead className="text-right">Tasa</TableHead>
              <TableHead className="text-right">
                <Term k="diffVsControl" />
              </TableHead>
              <TableHead className="text-right">
                <Term k="probabilityToWin" />
              </TableHead>
              <TableHead className="text-right">
                <Term k="estimatedValue" />
              </TableHead>
              <TableHead className="min-w-44">Notas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((v, i) => {
              const res = live[i];
              const winner = isWinner && !v.is_control;
              return (
                <TableRow key={v.id} className={cn(winner && "bg-highlight/10")}>
                  <TableCell>
                    <div className="font-medium">
                      {v.name} {v.is_control ? <span className="ml-1 rounded border px-1 text-[11px] text-soft">Control</span> : null}
                    </div>
                    {v.description ? <div className="text-xs text-soft">{v.description}</div> : null}
                  </TableCell>
                  {(["sample", "conversions", "metric_value"] as const).map((k) => (
                    <TableCell key={k} className="text-right">
                      {canEdit ? (
                        <Input
                          aria-label={`${k === "sample" ? "Muestra" : k === "conversions" ? "Conversiones" : "Valor de la métrica"} de ${v.name}`}
                          inputMode="decimal"
                          className="ml-auto w-28 text-right tabular-nums"
                          value={rows[i][k]}
                          onChange={(e) => update(i, { [k]: e.target.value })}
                        />
                      ) : (
                        <span className="tabular-nums">{formatNumber(v[k])}</span>
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{formatPercent(res.rate)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {v.is_control ? <span className="text-soft">base</span> : formatSignedPercent(res.diffVsControl)}
                  </TableCell>
                  <TableCell className="text-right">
                    {v.is_control ? <span className="text-soft">—</span> : <ProbabilityCell row={res} directional={directional} />}
                  </TableCell>
                  <TableCell className="text-right">{v.is_control ? <span className="text-soft">—</span> : <ValueCell row={res} />}</TableCell>
                  <TableCell>
                    {canEdit ? (
                      <Input aria-label={`Notas de ${v.name}`} value={rows[i].notes} onChange={(e) => update(i, { notes: e.target.value })} />
                    ) : (
                      <span className="text-sm">{v.notes || "—"}</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {guardrails.length ? (
        <section aria-label="Guardrails" className="rounded-xl border p-3">
          <div className="mb-1 flex items-center gap-1.5 text-sm font-medium">
            <ShieldCheck className="size-4" aria-hidden /> Guardrails
          </div>
          <p className="mb-2 text-xs text-soft">Cargue el valor de cada guardrail por variante, en la unidad de su métrica. Se compara con el control.</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guardrail</TableHead>
                  {variants.map((v) => (
                    <TableHead key={v.id} className="text-right">
                      {v.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {guardrailReadings.map((gr) => (
                  <TableRow key={gr.guardrail.id}>
                    <TableCell>
                      <div className="font-medium">{gr.guardrail.metric_name}</div>
                      <div className="text-xs text-soft">{describeGuardrail(gr.guardrail)}</div>
                    </TableCell>
                    {variants.map((v, i) => {
                      const cell = gr.rows.find((r) => r.variant_id === v.id);
                      return (
                        <TableCell key={v.id} className="text-right align-top">
                          {canEdit ? (
                            <Input
                              aria-label={`${gr.guardrail.metric_name} de ${v.name}`}
                              inputMode="decimal"
                              className="ml-auto w-24 text-right tabular-nums"
                              value={rows[i].guardrails[gr.guardrail.id] ?? ""}
                              onChange={(e) => updateGuardrail(i, gr.guardrail.id, e.target.value)}
                            />
                          ) : (
                            <span className="tabular-nums">{formatNumber(v.guardrail_values?.[gr.guardrail.id] ?? null)}</span>
                          )}
                          {cell && cell.change_pct != null ? (
                            <div className={cn("mt-1 inline-flex items-center gap-1 text-[11px] tabular-nums", cell.broken ? "font-semibold" : "text-soft")}>
                              {cell.broken ? <ShieldAlert className="size-3" aria-hidden /> : null}
                              {formatSignedPercent(cell.change_pct / 100)} {cell.broken ? "· se rompió" : "· dentro del límite"}
                            </div>
                          ) : null}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {guardrailReadings.some((g) => g.broken) ? (
            <Callout className="mt-2" icon={ShieldAlert} title="Ojo: un guardrail se rompió">
              La variante empeora una métrica que no debía empeorar. Téngalo en cuenta antes de escalar: puede que toque ajustar.
            </Callout>
          ) : null}
        </section>
      ) : null}

      {directional ? (
        <Callout tone="neutral" title={DIRECTIONAL_LABEL}>
          Esta prueba no reparte a la gente al azar (
          {testType === "geo" ? "es por geografía" : testType === "before_after" ? "es antes y después" : "no tiene tipo de prueba definido"}), así
          que la diferencia indica una dirección pero no se puede calcular una probabilidad de ganar. Léala con cuidado y apóyese en la regla de
          decisión.
        </Callout>
      ) : null}
      <p className="text-xs text-soft">
        Tasa = conversiones / muestra. La diferencia se calcula frente al control (sobre la tasa o, si no hay conversiones, sobre el valor de
        la métrica). En A/B, la probabilidad de ganar sale de la muestra y las conversiones; con 95 % o más es confiable. El valor estimado es
        la mejora × el volumen semanal de la métrica × el valor por unidad: el piso usa el extremo menos favorable del intervalo y el techo, la
        mejora observada. Son ayudas: el veredicto lo da una persona frente a la regla de decisión.
      </p>
      {error ? <Callout title="No se pudieron guardar">{error}</Callout> : null}
      {canEdit ? (
        <Button onClick={save} disabled={pending || invalid}>
          {pending ? <Spinner /> : <Save aria-hidden />} Guardar resultados
        </Button>
      ) : null}
    </div>
  );
}

function ProbabilityCell({ row, directional }: { row: VariantReading; directional: boolean }) {
  if (directional) return <span className="text-xs text-soft">Direccional</span>;
  const { probability, interval, band } = row.stats;
  if (probability == null) {
    return <span className="text-xs text-soft">{row.conversions == null ? "Necesita conversiones" : "Faltan datos"}</span>;
  }
  return (
    <div className="tabular-nums whitespace-nowrap">
      <div className="font-medium">
        {formatProbability(probability)}
        {band ? (
          <span
            className={cn(
              "ml-1.5 rounded px-1 text-[11px] font-normal whitespace-nowrap",
              band.level === "reliable" && band.leaning === "better" ? "bg-highlight text-[#1F1F1F]" : "border text-soft",
            )}
          >
            {band.label}
          </span>
        ) : null}
      </div>
      {interval ? (
        <div className="text-[11px] text-soft">
          95 %: {formatSignedPercent(interval.low)} a {formatSignedPercent(interval.high)}
        </div>
      ) : null}
    </div>
  );
}

function ValueCell({ row }: { row: VariantReading }) {
  if (row.value_estimate) {
    return (
      <div className="max-w-56 text-right tabular-nums">
        <div className="font-medium">{formatValueRange(row.value_conservative?.monthly ?? null, row.value_estimate.monthly, "/ mes")}</div>
        <div className="text-[11px] text-soft">{formatValueRange(row.value_conservative?.weekly ?? null, row.value_estimate.weekly, "/ sem.")}</div>
      </div>
    );
  }
  if (row.value_missing === "unit_value") return <span className="text-xs text-soft">{UNIT_VALUE_HINT}</span>;
  if (row.value_missing === "volume") return <span className="text-xs text-soft">Falta el volumen semanal de la métrica</span>;
  return <span className="text-soft">—</span>;
}
