"use client";

import { CircleCheck, Download, FileUp, Save, Trash2, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/app/confirm-action";
import { FormError } from "@/components/app/form";
import { Callout, Section } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { csvFileName } from "@/domain/csv";
import { formatDate, formatNumber } from "@/domain/format";
import {
  cellKey,
  entryRows,
  existingForPeriod,
  normalizePeriod,
  periodError,
  readEntry,
  type StoredValue,
} from "@/domain/pilots/data-entry";
import { buildTemplate, coherenceIssues, readImport, type ImportContext, type ImportResult } from "@/domain/pilots/data-import";
import type { Granularity, PilotArm, PilotMetricDef } from "@/domain/pilots/types";
import type { IsoDate } from "@/domain/types";
import { cn } from "@/lib/utils";
import { deleteMeasurement, saveMeasurements } from "@/server/actions/pilots";

const MAX_VALUES = 5000;

function valueText(metric: Pick<PilotMetricDef, "unit"> | undefined, value: number): string {
  return metric?.unit === "cop" ? `$ ${formatNumber(value)}` : formatNumber(value);
}

// -----------------------------------------------------------------------------
// Carga manual
// -----------------------------------------------------------------------------

export function PilotManualEntry({
  pilotId,
  arms,
  metrics,
  coherenceMetrics,
  byCity,
  granularity,
  range,
  stored,
  initialPeriod,
}: {
  pilotId: string;
  arms: PilotArm[];
  /** Métricas base (`sum`) que se cargan. */
  metrics: PilotMetricDef[];
  /** Métricas del piloto (con tasas) para revisar coherencia. */
  coherenceMetrics: PilotMetricDef[];
  byCity: boolean;
  granularity: Granularity;
  range: { min: IsoDate; max: IsoDate };
  stored: StoredValue[];
  initialPeriod: IsoDate;
}) {
  const inputId = useId();
  const [period, setPeriod] = useState<IsoDate>(initialPeriod);
  const [snapped, setSnapped] = useState<IsoDate | null>(null);
  const error = periodError(period, granularity, range);
  const existing = useMemo(() => existingForPeriod(stored, period, granularity), [stored, period, granularity]);

  function onPeriod(raw: string) {
    if (!raw) return setPeriod("");
    const next = normalizePeriod(raw, granularity);
    setSnapped(next !== raw ? next : null);
    setPeriod(next);
  }

  return (
    <Section
      title="Cargar a mano"
      description={granularity === "week" ? "Un periodo es una semana: se carga con la fecha del lunes." : "Un periodo es un día."}
    >
      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor={inputId}>{granularity === "week" ? "Semana (lunes)" : "Día"}</Label>
        <Input
          id={inputId}
          type="date"
          value={period}
          min={range.min}
          max={range.max}
          onChange={(e) => onPeriod(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={`${inputId}-help`}
          className="tabular-nums"
        />
        <p id={`${inputId}-help`} className="text-xs text-soft">
          {error ? (
            <span className="font-medium text-ink">{error}</span>
          ) : snapped ? (
            `Las semanas empiezan el lunes: se usa el ${formatDate(snapped)}.`
          ) : (
            `Se puede cargar del ${formatDate(range.min)} al ${formatDate(range.max)}.`
          )}
        </p>
      </div>
      {error ? null : (
        <EntryGrid
          key={`${period}|${granularity}`}
          pilotId={pilotId}
          period={period}
          granularity={granularity}
          arms={arms}
          metrics={metrics}
          coherenceMetrics={coherenceMetrics}
          byCity={byCity}
          existing={existing}
        />
      )}
    </Section>
  );
}

function EntryGrid({
  pilotId,
  period,
  granularity,
  arms,
  metrics,
  coherenceMetrics,
  byCity,
  existing,
}: {
  pilotId: string;
  period: IsoDate;
  granularity: Granularity;
  arms: PilotArm[];
  metrics: PilotMetricDef[];
  coherenceMetrics: PilotMetricDef[];
  byCity: boolean;
  existing: Record<string, string>;
}) {
  const router = useRouter();
  const rows = useMemo(() => entryRows(arms, byCity), [arms, byCity]);
  const [drafts, setDrafts] = useState<Record<string, string>>(existing);
  const [formError, setFormError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [pending, startTransition] = useTransition();
  const entry = useMemo(() => readEntry({ rows, metrics, drafts, existing, period }), [rows, metrics, drafts, existing, period]);
  const coherence = useMemo(() => coherenceIssues(entry.all, coherenceMetrics, coherenceMetrics), [entry.all, coherenceMetrics]);
  const errorList = Object.values(entry.errors);
  const hasPrevious = Object.keys(existing).length > 0;

  function save() {
    setFormError(null);
    setShowErrors(true);
    if (errorList.length) return setFormError("Hay valores que no son números válidos: corríjalos y vuelva a guardar.");
    if (!entry.values.length) return setFormError("No hay cambios para guardar en este periodo.");
    startTransition(async () => {
      const result = await saveMeasurements(pilotId, { granularity, source: "manual", values: entry.values });
      if (!result.ok) return setFormError(result.error);
      toast.success(result.message ?? "Datos guardados.");
      setShowErrors(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-4">
      {hasPrevious ? (
        <p className="mb-2 text-xs text-soft">Este periodo ya tiene datos: los campos traen lo cargado. Cambie solo lo que haga falta.</p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-max text-sm tabular-nums">
          <caption className="sr-only">Valores del periodo {formatDate(period)} por grupo y métrica</caption>
          <thead className="bg-wash text-left text-xs text-soft">
            <tr>
              <th scope="col" className="sticky left-0 bg-wash px-3 py-2 font-medium">
                Grupo
              </th>
              {metrics.map((m) => (
                <th key={m.id} scope="col" className="px-3 py-2 font-medium">
                  {m.name}
                  {m.unit === "cop" ? <span className="font-normal"> (COP)</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="sticky left-0 bg-paper px-3 py-2 text-left font-medium">
                  <span className="block">{row.arm_name}</span>
                  <span className="block text-xs font-normal text-soft">
                    {[row.is_control ? "Control" : null, row.unit_label || null].filter(Boolean).join(" · ")}
                  </span>
                </th>
                {metrics.map((m) => {
                  const key = cellKey(row.key, m.id);
                  const invalid = showErrors && !!entry.errors[key];
                  return (
                    <td key={m.id} className="px-2 py-1.5">
                      <Input
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={`${m.name} · ${row.arm_name}${row.unit_label ? ` · ${row.unit_label}` : ""}`}
                        aria-invalid={invalid}
                        className="w-32 text-right tabular-nums"
                        value={drafts[key] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showErrors && errorList.length ? (
        <ul className="mt-3 space-y-1 text-sm" aria-live="polite">
          {errorList.map((e, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {e}
            </li>
          ))}
        </ul>
      ) : null}
      {coherence.length ? (
        <Callout icon={TriangleAlert} title="Revise estos totales" className="mt-3">
          <ul className="list-disc space-y-0.5 pl-4">
            {coherence.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Callout>
      ) : null}
      <FormError message={formError} className="mt-3" />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? <Spinner /> : <Save aria-hidden />} Guardar datos
        </Button>
        <span className="text-xs text-soft tabular-nums">
          {entry.values.length
            ? `${entry.values.length} ${entry.values.length === 1 ? "valor nuevo o cambiado" : "valores nuevos o cambiados"}`
            : "Sin cambios"}
        </span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// CSV
// -----------------------------------------------------------------------------

export function PilotCsvImport({
  pilotId,
  pilotTitle,
  context,
  coherenceMetrics,
  today,
}: {
  pilotId: string;
  pilotTitle: string;
  context: ImportContext;
  coherenceMetrics: PilotMetricDef[];
  today: IsoDate;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [file, setFile] = useState<{ name: string; result: ImportResult } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const coherence = useMemo(() => (file ? coherenceIssues(file.result.values, coherenceMetrics, coherenceMetrics) : []), [file, coherenceMetrics]);
  const armName = useMemo(() => new Map(context.arms.map((a) => [a.id, a.name])), [context.arms]);
  const metricById = useMemo(() => new Map(context.metrics.map((m) => [m.id, m])), [context.metrics]);

  function downloadTemplate() {
    const blob = new Blob([buildTemplate(context)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFileName("plantilla", pilotTitle, today);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("¡Listo pues! Plantilla descargada", { description: "Llénela en Excel y súbala como CSV." });
  }

  function onFile(f: File | undefined) {
    setFormError(null);
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setFile({ name: f.name, result: readImport(String(reader.result ?? ""), context) });
    reader.onerror = () => setFormError("No se pudo leer el archivo. Revise que sea un CSV y vuelva a subirlo.");
    reader.readAsText(f, "utf-8");
  }

  function clear() {
    setFile(null);
    setFormError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function save() {
    if (!file?.result.values.length) return;
    if (file.result.values.length > MAX_VALUES) {
      return setFormError(`El archivo trae ${formatNumber(file.result.values.length)} valores y el máximo por carga es 5.000: pártalo en dos.`);
    }
    setFormError(null);
    startTransition(async () => {
      const result = await saveMeasurements(pilotId, { granularity: context.granularity, source: "csv", values: file.result.values });
      if (!result.ok) return setFormError(result.error);
      toast.success(result.message ?? "Datos guardados.");
      clear();
      router.refresh();
    });
  }

  const values = file?.result.values ?? [];
  const issues = file?.result.issues ?? [];
  const preview = values.slice(0, 200);

  return (
    <Section
      title="Subir un CSV"
      description="Descargue la plantilla, llénela en Excel o Google Sheets y súbala. Antes de guardar se ve qué entra y qué no."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={downloadTemplate}>
          <Download aria-hidden /> Descargar plantilla
        </Button>
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept=".csv,text/csv,.txt"
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
          <FileUp aria-hidden /> Subir CSV
        </Button>
        {file ? <span className="text-xs text-soft">{file.name}</span> : null}
      </div>

      {file ? (
        <div className="rise mt-4 space-y-3">
          <p role="status" className="text-sm">
            <span className="font-medium tabular-nums">
              {formatNumber(values.length)} {values.length === 1 ? "valor listo" : "valores listos"} para guardar
            </span>
            {issues.length ? (
              <span className="text-soft tabular-nums">
                {" "}
                · {issues.length} {issues.length === 1 ? "línea con problema no entra" : "líneas con problema no entran"}
              </span>
            ) : null}
          </p>

          {issues.length ? (
            <div className="max-h-48 overflow-y-auto rounded-xl border bg-wash px-3 py-2">
              <ul className="space-y-1 text-sm">
                {issues.map((i, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      <span className="font-medium tabular-nums">Línea {i.line}:</span> {i.message}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {file.result.ignoredColumns.length ? (
            <p className="text-xs text-soft">
              Columnas que no son del piloto y se ignoran: {file.result.ignoredColumns.join(", ")}.
            </p>
          ) : null}

          {coherence.length ? (
            <Callout icon={TriangleAlert} title="Revise estos totales">
              <ul className="list-disc space-y-0.5 pl-4">
                {coherence.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </Callout>
          ) : null}

          {values.length ? (
            <div className="max-h-72 overflow-auto rounded-xl border">
              <table className="w-full min-w-max text-sm tabular-nums">
                <caption className="sr-only">Vista previa de los valores del archivo</caption>
                <thead className="sticky top-0 bg-wash text-left text-xs text-soft">
                  <tr>
                    <th scope="col" className="px-3 py-1.5 font-medium">
                      {context.granularity === "week" ? "Semana" : "Fecha"}
                    </th>
                    <th scope="col" className="px-3 py-1.5 font-medium">
                      Grupo
                    </th>
                    {context.byCity ? (
                      <th scope="col" className="px-3 py-1.5 font-medium">
                        Ciudad
                      </th>
                    ) : null}
                    <th scope="col" className="px-3 py-1.5 font-medium">
                      Métrica
                    </th>
                    <th scope="col" className="px-3 py-1.5 text-right font-medium">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.map((v) => (
                    <tr key={`${v.arm_id}|${v.unit_label}|${v.metric_id}|${v.period_start}`}>
                      <td className="px-3 py-1.5">{formatDate(v.period_start)}</td>
                      <td className="px-3 py-1.5">{armName.get(v.arm_id)}</td>
                      {context.byCity ? <td className="px-3 py-1.5">{v.unit_label || "—"}</td> : null}
                      <td className="px-3 py-1.5">{metricById.get(v.metric_id)?.name}</td>
                      <td className="px-3 py-1.5 text-right">{valueText(metricById.get(v.metric_id), v.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {values.length > preview.length ? (
                <p className="border-t px-3 py-1.5 text-xs text-soft tabular-nums">
                  … y {formatNumber(values.length - preview.length)} valores más.
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="text-xs text-soft">Si un valor ya estaba cargado para ese grupo y periodo, se reemplaza (queda en la bitácora).</p>
          <FormError message={formError} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={save} disabled={pending || !values.length}>
              {pending ? <Spinner /> : <CircleCheck aria-hidden />} Revisar y guardar
            </Button>
            <Button type="button" variant="ghost" onClick={clear} disabled={pending}>
              <X aria-hidden /> Descartar archivo
            </Button>
          </div>
        </div>
      ) : (
        <FormError message={formError} className="mt-3" />
      )}
    </Section>
  );
}

// -----------------------------------------------------------------------------
// Borrar un dato
// -----------------------------------------------------------------------------

export function DeleteMeasurementButton({ pilotId, measurementId, label }: { pilotId: string; measurementId: string; label: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      title="¿Borrar este dato?"
      description={`Se borra ${label}. El cambio queda en la bitácora y la lectura se recalcula.`}
      confirmLabel="Sí, borrar"
      onConfirm={async () => {
        const result = await deleteMeasurement(pilotId, measurementId);
        if (!result.ok) return result.error;
        toast.success(result.message ?? "Dato borrado.");
        router.refresh();
      }}
    >
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Borrar ${label}`} className={cn("text-soft hover:text-ink")}>
        <Trash2 aria-hidden />
      </Button>
    </ConfirmAction>
  );
}
