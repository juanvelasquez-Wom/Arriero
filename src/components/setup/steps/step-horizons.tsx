"use client";

import { ChevronDown, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { addDays, daysBetween } from "@/domain/dates";
import { formatDate, formatDateRange } from "@/domain/format";
import { FIELD_HELP } from "../help-content";
import { InfoTip } from "../help";

export interface HorizonDraft {
  id?: string;
  name: string;
  start_date: string;
  end_date: string;
}

const weeks = (h: HorizonDraft) => Math.max(0, Math.round((daysBetween(h.start_date, h.end_date) + 1) / 7));

/**
 * Horizontes dentro del paso de calendario: se proponen solos desde el punto de
 * decisión (`auto`) y se muestran en una línea de tiempo; se pueden ajustar en
 * la sección desplegable, y entonces dejan de seguir al punto de decisión.
 */
export function HorizonsSection({
  program,
  decisionDate,
  rows,
  auto,
  onChange,
  onReset,
  problems,
  readOnly,
}: {
  program: { start_date: string; end_date: string };
  decisionDate: string | null;
  rows: HorizonDraft[];
  auto: boolean;
  onChange: (rows: HorizonDraft[]) => void;
  onReset: () => void;
  problems: string[];
  readOnly?: boolean;
}) {
  const total = daysBetween(program.start_date, program.end_date) + 1;
  const update = (i: number, patch: Partial<HorizonDraft>) => onChange(rows.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const decisionInside = !!decisionDate && decisionDate > program.start_date && decisionDate < program.end_date;

  return (
    <div className="rounded-2xl border bg-paper p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        Horizontes <InfoTip label="Horizonte">{FIELD_HELP.horizon}</InfoTip>
      </h2>
      <p className="mt-1 text-sm text-soft">
        {auto
          ? decisionInside
            ? "Se acomodan solos al punto de decisión: en H1 se prueba y se aprende; en H2 se escala lo que funcionó."
            : "Sin punto de decisión queda un solo horizonte para todo el programa. Ponga la fecha arriba y se parte en dos."
          : "Los ajustó a mano: ya no siguen al punto de decisión."}
      </p>

      {/* Línea de tiempo */}
      <div className="mt-4" aria-hidden>
        <div className="relative h-10 overflow-hidden rounded-lg bg-wash">
          {rows.map((h, i) => {
            const left = (Math.max(0, daysBetween(program.start_date, h.start_date)) / total) * 100;
            const width = (Math.max(1, daysBetween(h.start_date, h.end_date) + 1) / total) * 100;
            return (
              <div
                key={i}
                className={i % 2 ? "absolute inset-y-1 rounded-md bg-gray-3/70 transition-all duration-300" : "absolute inset-y-1 rounded-md bg-gray-2 transition-all duration-300"}
                style={{ left: `${left}%`, width: `${Math.max(0, Math.min(width, 100 - left))}%` }}
              >
                <span className="px-2 text-xs leading-8 font-semibold">{h.name}</span>
              </div>
            );
          })}
          {decisionInside ? (
            <div className="absolute inset-y-0 w-0.5 bg-highlight transition-all duration-300" style={{ left: `${(daysBetween(program.start_date, decisionDate!) / total) * 100}%` }} />
          ) : null}
        </div>
        <div className="mt-1 flex justify-between text-xs text-soft">
          <span>{formatDate(program.start_date)}</span>
          {decisionInside ? <span className="text-ink">▲ Punto de decisión</span> : null}
          <span>{formatDate(program.end_date)}</span>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-2 text-sm">
        {rows.map((h, i) => (
          <li key={i} className="rounded-full border bg-wash px-3 py-1 tabular-nums">
            <strong>{h.name}</strong> · {formatDateRange(h.start_date, h.end_date)} · {weeks(h)} semanas
          </li>
        ))}
      </ul>

      {!readOnly ? (
        <Collapsible className="mt-4" defaultOpen={!auto}>
          <CollapsibleTrigger className="group inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4">
            Ajustar los horizontes <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent className="slide-in mt-3 space-y-2">
            {rows.map((h, i) => (
              <div key={i} className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-[100px_1fr_1fr_auto]">
                <div className="space-y-1">
                  <label className="text-xs text-soft" htmlFor={`h-n-${i}`}>
                    Nombre
                  </label>
                  <Input id={`h-n-${i}`} value={h.name} onChange={(e) => update(i, { name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-soft" htmlFor={`h-s-${i}`}>
                    Desde
                  </label>
                  <Input id={`h-s-${i}`} type="date" value={h.start_date} onChange={(e) => update(i, { start_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-soft" htmlFor={`h-e-${i}`}>
                    Hasta
                  </label>
                  <Input id={`h-e-${i}`} type="date" value={h.end_date} onChange={(e) => update(i, { end_date: e.target.value })} />
                </div>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar ${h.name}`} disabled={rows.length <= 1} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const last = rows[rows.length - 1];
                  const start = last ? addDays(last.end_date, 1) : program.start_date;
                  onChange([...rows, { name: `H${rows.length + 1}`, start_date: start, end_date: program.end_date }]);
                }}
              >
                <Plus aria-hidden /> Agregar horizonte
              </Button>
              {!auto ? (
                <Button type="button" size="sm" variant="ghost" onClick={onReset}>
                  <RotateCcw aria-hidden /> Volver a la propuesta
                </Button>
              ) : null}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {problems.length ? (
        <ul className="mt-3 space-y-1 text-sm font-medium" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
