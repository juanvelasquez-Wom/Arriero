"use client";

import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDays, daysBetween } from "@/domain/dates";
import { formatDate, formatDateRange } from "@/domain/format";
import { horizonProblems, proposeHorizons } from "@/domain/growth-templates";
import { saveHorizonsStep } from "@/server/actions/setup";
import { FIELD_HELP } from "../help-content";
import { InfoTip } from "../help";
import { StepFooter } from "../step-footer";

interface H {
  id?: string;
  name: string;
  start_date: string;
  end_date: string;
}

export function StepHorizons({
  programId,
  program,
  decisionDate,
  existing,
  prevHref,
  nextHref,
  readOnly,
}: {
  programId: string;
  program: { start_date: string; end_date: string };
  decisionDate: string | null;
  existing: H[];
  prevHref: string;
  nextHref: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const proposal = proposeHorizons(program.start_date, program.end_date, decisionDate);
  const [rows, setRows] = useState<H[]>(existing.length ? existing : proposal);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const problems = horizonProblems({ start: program.start_date, end: program.end_date }, rows);
  const total = daysBetween(program.start_date, program.end_date) + 1;

  function update(i: number, patch: Partial<H>) {
    setRows((r) => r.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  }

  function next() {
    if (readOnly) {
      router.push(nextHref);
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const r = await saveHorizonsStep(programId, { horizons: rows });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(nextHref);
    });
  }

  return (
    <div className="rounded-2xl border bg-paper shadow-card p-5">
      <p className="text-sm">
        {decisionDate ? (
          <>
            Le proponemos dos horizontes a partir de su punto de decisión del <strong>{formatDate(decisionDate)}</strong>: en{" "}
            <strong>H1</strong> se prueba y se aprende; en <strong>H2</strong> se escala lo que funcionó.
          </>
        ) : (
          <>Como no definió un punto de decisión, le proponemos un solo horizonte para todo el programa. Si necesita más, agréguelos.</>
        )}
      </p>

      {/* Línea de tiempo */}
      <div className="mt-5" aria-hidden>
        <div className="relative h-10 overflow-hidden rounded-lg bg-wash">
          {rows.map((h, i) => {
            const left = (Math.max(0, daysBetween(program.start_date, h.start_date)) / total) * 100;
            const width = (Math.max(1, daysBetween(h.start_date, h.end_date) + 1) / total) * 100;
            return (
              <div
                key={i}
                className={i % 2 ? "absolute inset-y-1 rounded-md bg-gray-3/70" : "absolute inset-y-1 rounded-md bg-gray-2"}
                style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
              >
                <span className="px-2 text-xs leading-8 font-semibold">{h.name}</span>
              </div>
            );
          })}
          {decisionDate && decisionDate > program.start_date && decisionDate < program.end_date ? (
            <div className="absolute inset-y-0 w-0.5 bg-highlight" style={{ left: `${(daysBetween(program.start_date, decisionDate) / total) * 100}%` }} />
          ) : null}
        </div>
        <div className="mt-1 flex justify-between text-xs text-soft">
          <span>{formatDate(program.start_date)}</span>
          {decisionDate ? <span className="text-ink">▲ Punto de decisión</span> : null}
          <span>{formatDate(program.end_date)}</span>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <div className="flex items-center gap-1 text-sm font-medium">
          Horizontes <InfoTip label="Horizonte">{FIELD_HELP.horizon}</InfoTip>
        </div>
        {rows.map((h, i) => (
          <div key={i} className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-[100px_1fr_1fr_auto]">
            <div className="space-y-1">
              <label className="text-xs text-soft" htmlFor={`h-n-${i}`}>
                Nombre
              </label>
              <Input id={`h-n-${i}`} value={h.name} disabled={readOnly} onChange={(e) => update(i, { name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-soft" htmlFor={`h-s-${i}`}>
                Desde
              </label>
              <Input id={`h-s-${i}`} type="date" value={h.start_date} disabled={readOnly} onChange={(e) => update(i, { start_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-soft" htmlFor={`h-e-${i}`}>
                Hasta
              </label>
              <Input id={`h-e-${i}`} type="date" value={h.end_date} disabled={readOnly} onChange={(e) => update(i, { end_date: e.target.value })} />
            </div>
            {!readOnly ? (
              <Button size="icon-sm" variant="ghost" aria-label={`Quitar ${h.name}`} disabled={rows.length <= 1} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
                <Trash2 aria-hidden />
              </Button>
            ) : null}
            <p className="text-xs text-soft sm:col-span-4">
              {formatDateRange(h.start_date, h.end_date)} · {Math.max(0, Math.round((daysBetween(h.start_date, h.end_date) + 1) / 7))} semanas
            </p>
          </div>
        ))}
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const last = rows[rows.length - 1];
                const start = last ? addDays(last.end_date, 1) : program.start_date;
                setRows([...rows, { name: `H${rows.length + 1}`, start_date: start, end_date: program.end_date }]);
              }}
            >
              <Plus aria-hidden /> Agregar horizonte
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRows(proposal.map((p, i) => ({ ...p, id: rows[i]?.id })))}>
              <RotateCcw aria-hidden /> Volver a la propuesta
            </Button>
          </div>
        ) : null}
      </div>

      {problems.length ? (
        <ul className="mt-3 space-y-1 text-sm" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      <FormError message={error} className="mt-3" />
      <StepFooter prevHref={prevHref} pending={pending} onNext={next} disabled={!readOnly && problems.length > 0} />
    </div>
  );
}
