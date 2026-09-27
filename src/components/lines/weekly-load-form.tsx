"use client";

import { CircleCheck, CircleDashed, Eye, PencilLine, Save, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Callout } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatMetricValue, formatSignedPercent } from "@/domain/format";
import { outlierChange } from "@/domain/paste-import";
import {
  diffWeeklyLoad,
  parseDecimal,
  pendingMetricIds,
  toInputValue,
  type WeeklyDraft,
  type WeeklySaved,
} from "@/domain/metric-tree";
import type { MetricBranch, MetricDirection, MetricType } from "@/domain/types";
import { cn } from "@/lib/utils";
import { saveWeeklyValues } from "@/server/actions/metric-values";
import { BranchBadge, DirectionLabel, MetricTypeBadge } from "./metric-badges";
import { PasteImportDialog } from "./paste-import-dialog";
import { WeekPicker } from "./week-picker";

export interface LoadMetric {
  id: string;
  name: string;
  type: MetricType;
  branch: MetricBranch | null;
  unit: string | null;
  direction: MetricDirection;
}

export interface LoadGroup {
  lineId: string;
  lineName: string;
  metrics: LoadMetric[];
}

type SavedMap = Record<string, WeeklySaved>;

/** Carga semanal en lote: un valor y una nota opcional por métrica. */
export function WeeklyLoadForm({
  programId,
  baseHref,
  week,
  currentWeek,
  groups,
  saved: savedProp,
  previous,
  canLoad,
}: {
  programId: string;
  baseHref: string;
  week: string;
  currentWeek: string;
  groups: LoadGroup[];
  saved: SavedMap;
  previous: SavedMap;
  canLoad: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<SavedMap>(savedProp);
  const [draft, setDraft] = useState<Record<string, WeeklyDraft>>(() =>
    Object.fromEntries(
      groups.flatMap((g) => g.metrics).map((m) => [m.id, { value: toInputValue(savedProp[m.id]?.value), note: savedProp[m.id]?.note ?? "" }]),
    ),
  );
  const [onlyPending, setOnlyPending] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const allIds = useMemo(() => groups.flatMap((g) => g.metrics.map((m) => m.id)), [groups]);
  const savedMap = useMemo(() => new Map(Object.entries(saved)), [saved]);
  const { rows, errors } = useMemo(
    () => diffWeeklyLoad(allIds, savedMap, new Map(Object.entries(draft))),
    [allIds, savedMap, draft],
  );
  const changedIds = new Set(rows.map((r) => r.metric_id));
  const pendingIds = pendingMetricIds(allIds, savedMap);
  const dirty = rows.length > 0 || errors.size > 0;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function setField(id: string, field: keyof WeeklyDraft, value: string) {
    setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? { value: "", note: "" }), [field]: value } }));
    setServerErrors((e) => {
      if (!e[id]) return e;
      const next = { ...e };
      delete next[id];
      return next;
    });
  }

  const pasteMetrics = useMemo(() => groups.flatMap((g) => g.metrics.map((m) => ({ id: m.id, name: m.name }))), [groups]);

  function applyPasted(values: Record<string, string>) {
    const n = Object.keys(values).length;
    setDraft((d) => {
      const next = { ...d };
      for (const [id, value] of Object.entries(values)) next[id] = { ...(next[id] ?? { value: "", note: "" }), value };
      return next;
    });
    setServerErrors({});
    setOnlyPending(false);
    toast.success(n === 1 ? "¡Eso! Se llenó 1 valor" : `¡Eso! Se llenaron ${n} valores`, {
      description: "Revíselos y haga clic en “Guardar todo”.",
    });
  }

  function onSave() {
    if (errors.size) {
      setError("Corrija las filas marcadas antes de guardar.");
      return;
    }
    if (!rows.length) return;
    setError(undefined);
    startTransition(async () => {
      const result = await saveWeeklyValues(programId, { week_start: week, rows });
      if (!result.ok) {
        setError(result.error);
        const byMetric: Record<string, string> = {};
        for (const [key, msgs] of Object.entries(result.fieldErrors ?? {})) {
          const idx = /^rows\.(\d+)\./.exec(key)?.[1];
          const row = idx != null ? rows[Number(idx)] : undefined;
          if (row) byMetric[row.metric_id] = msgs[0];
        }
        setServerErrors(byMetric);
        return;
      }
      setSaved((s) => ({ ...s, ...Object.fromEntries(rows.map((r) => [r.metric_id, { value: r.value, note: r.note }])) }));
      toast.success(result.message ?? "Valores guardados");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WeekPicker baseHref={baseHref} week={week} currentWeek={currentWeek} dirty={dirty} />
        <div className="flex flex-wrap items-center gap-2">
          <span
            role="status"
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium tabular-nums",
              pendingIds.length ? "border-highlight bg-highlight/20" : "border-line bg-gray-1",
            )}
          >
            {pendingIds.length ? <CircleDashed aria-hidden className="size-3.5" /> : <CircleCheck aria-hidden className="size-3.5" />}
            {pendingIds.length
              ? `${pendingIds.length} de ${allIds.length} ${pendingIds.length === 1 ? "métrica pendiente" : "métricas pendientes"}`
              : "¡Eso! Semana completa"}
          </span>
          {canLoad ? <PasteImportDialog metrics={pasteMetrics} week={week} onApply={applyPasted} /> : null}
          <Button
            variant="outline"
            size="sm"
            aria-pressed={onlyPending}
            onClick={() => setOnlyPending((v) => !v)}
            disabled={!pendingIds.length && !onlyPending}
          >
            <Eye aria-hidden /> {onlyPending ? "Mostrar todas" : "Solo pendientes"}
          </Button>
        </div>
      </div>

      {!canLoad ? (
        <Callout tone="neutral" title="Solo lectura">
          Con su rol puede consultar los valores. La carga semanal la hacen owners y colaboradores del programa.
        </Callout>
      ) : null}

      {groups.map((g) => {
        const visible = onlyPending ? g.metrics.filter((m) => !saved[m.id]) : g.metrics;
        if (!visible.length) return null;
        const groupPending = g.metrics.filter((m) => !saved[m.id]).length;
        return (
          <section key={g.lineId} aria-labelledby={`line-${g.lineId}`} className="rounded-2xl border bg-paper shadow-card">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
              <h2 id={`line-${g.lineId}`} className="text-sm font-bold">
                {g.lineName}
              </h2>
              <span className="text-xs tabular-nums text-soft">
                {groupPending ? `${groupPending} pendientes` : "Completa"} · {g.metrics.length} métricas
              </span>
            </header>
            <div
              aria-hidden
              className="hidden grid-cols-[minmax(0,1.6fr)_8rem_9rem_minmax(0,1fr)_7rem] gap-3 border-b bg-wash px-4 py-1.5 text-[11px] font-medium text-soft md:grid"
            >
              <span>Métrica</span>
              <span className="text-right">Semana anterior</span>
              <span>Valor</span>
              <span>Nota (opcional)</span>
              <span>Estado</span>
            </div>
            <ul className="divide-y">
              {visible.map((m) => {
                const d = draft[m.id] ?? { value: "", note: "" };
                const prev = previous[m.id];
                const rowError = errors.get(m.id) ?? serverErrors[m.id];
                const changed = changedIds.has(m.id);
                const isSaved = !!saved[m.id];
                const valueId = `v-${m.id}`;
                const typed = parseDecimal(d.value);
                const jump = !rowError && typed != null ? outlierChange(typed, prev?.value) : null;
                const noteId = `n-${m.id}`;
                return (
                  <li
                    key={m.id}
                    className={cn(
                      "grid gap-2 px-4 py-2.5 md:grid-cols-[minmax(0,1.6fr)_8rem_9rem_minmax(0,1fr)_7rem] md:items-start md:gap-3",
                      changed && "border-l-4 border-l-highlight pl-3",
                    )}
                  >
                    <div className="min-w-0">
                      <label htmlFor={canLoad ? valueId : undefined} className="block font-medium">
                        {m.name}
                      </label>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-soft">
                        {m.type === "input" && m.branch ? <BranchBadge branch={m.branch} /> : <MetricTypeBadge type={m.type} />}
                        <DirectionLabel direction={m.direction} />
                        {m.unit ? <span>· {m.unit}</span> : null}
                      </div>
                    </div>
                    <div className="text-sm tabular-nums md:pt-1.5 md:text-right">
                      <span className="text-xs text-soft md:hidden">Semana anterior: </span>
                      {prev ? formatMetricValue(prev.value, m.unit) : <span className="text-soft">Sin dato</span>}
                    </div>
                    {canLoad ? (
                      <>
                        <div>
                          <Input
                            id={valueId}
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="Ej. 1234,5"
                            className="tabular-nums"
                            value={d.value}
                            aria-invalid={!!rowError}
                            aria-describedby={rowError ? `${valueId}-error` : undefined}
                            onChange={(e) => setField(m.id, "value", e.target.value)}
                          />
                        </div>
                        <div>
                          <label htmlFor={noteId} className="sr-only">
                            Nota para {m.name}
                          </label>
                          <Input
                            id={noteId}
                            autoComplete="off"
                            placeholder="Ej. Caída por mantenimiento del sitio"
                            value={d.note}
                            maxLength={500}
                            onChange={(e) => setField(m.id, "note", e.target.value)}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm font-medium tabular-nums md:pt-1.5">
                          <span className="text-xs font-normal text-soft md:hidden">Valor: </span>
                          {isSaved ? formatMetricValue(saved[m.id].value, m.unit) : "—"}
                        </div>
                        <div className="text-sm text-soft md:pt-1.5">{saved[m.id]?.note ?? ""}</div>
                      </>
                    )}
                    <RowStatus changed={changed} saved={isSaved} />
                    {rowError ? (
                      <p id={`${valueId}-error`} role="alert" className="text-xs font-medium text-ink md:col-span-5">
                        {rowError}
                      </p>
                    ) : jump != null && (changed || !isSaved) ? (
                      <p className="flex items-center gap-1 text-xs text-ink md:col-span-5">
                        <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                        ¿Seguro? Es {formatSignedPercent(jump)} frente a la semana pasada. Si es correcto, deje una nota que lo explique.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {onlyPending && !pendingIds.length ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-soft">
          ¡Qué belleza! No hay métricas pendientes esta semana..
        </p>
      ) : null}

      {canLoad ? (
        <div className="sticky bottom-0 z-10 -mx-4 border-t bg-paper/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              {error ? (
                <span role="alert" className="font-medium">
                  {error}
                </span>
              ) : rows.length ? (
                <span className="tabular-nums">
                  {rows.length === 1 ? "1 cambio sin guardar" : `${rows.length} cambios sin guardar`}
                  {errors.size ? ` · ${errors.size} con error` : ""}
                </span>
              ) : errors.size ? (
                <span className="tabular-nums">{errors.size === 1 ? "1 fila con error" : `${errors.size} filas con error`}</span>
              ) : (
                <span className="text-soft">Sin cambios. Solo se guardan las filas que modifique.</span>
              )}
            </div>
            <Button onClick={onSave} disabled={pending || (!rows.length && !errors.size)}>
              {pending ? <Spinner /> : <Save aria-hidden />}
              Guardar todo
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RowStatus({ changed, saved }: { changed: boolean; saved: boolean }) {
  if (changed) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium md:pt-2">
        <PencilLine aria-hidden className="size-3.5" /> Sin guardar
      </span>
    );
  }
  if (saved) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-soft md:pt-2">
        <CircleCheck aria-hidden className="size-3.5" /> Cargado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-soft md:pt-2">
      <CircleDashed aria-hidden className="size-3.5" /> Pendiente
    </span>
  );
}
