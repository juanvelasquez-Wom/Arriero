"use client";

import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { LineTemplate } from "@/domain/growth-templates";
import type { MetricRow, StageRow } from "@/server/queries/structure";
import { FIELD_HELP } from "../help-content";
import { HelpLabel } from "../help";

/** Descripciones genéricas que crea la base al crear la línea. */
export const DB_STAGE_DEFAULTS = new Set([
  "Cómo llega el cliente: alcance, tráfico y conversaciones iniciadas.",
  "El cliente muestra intención: explora la oferta, responde o agrega al carrito.",
  "El cliente compra, se porta o activa el servicio.",
  "Rescate de abandonos y compras repetidas.",
]);
const NONE = "__none__";
const norm = (s: string) => s.trim().toLowerCase();

export interface FunnelRow {
  id: string;
  name: string;
  description: string;
  /** Nombre de la métrica del árbol que la mide (puede ser nueva, aún sin id). */
  metricName: string | null;
}

/** ¿El embudo ya fue revisado? (alguna etapa con métrica o descripción propia). */
export function funnelConfigured(stages: StageRow[]): boolean {
  return stages.some((s) => s.metric_id || (s.description && !DB_STAGE_DEFAULTS.has(s.description)));
}

/** Etapas con lo guardado o, si siguen como las creó la base, con la sugerencia de la plantilla. */
export function initialFunnelRows(stages: StageRow[], metrics: MetricRow[], template: LineTemplate): FunnelRow[] {
  return [...stages]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => {
      const t = template.funnel[s.name as keyof LineTemplate["funnel"]];
      const useSuggested = !s.description || DB_STAGE_DEFAULTS.has(s.description);
      const saved = s.metric_id ? (metrics.find((m) => m.id === s.metric_id)?.name ?? null) : null;
      return {
        id: s.id,
        name: s.name,
        description: useSuggested ? (t?.description ?? s.description ?? "") : (s.description ?? ""),
        metricName: saved ?? (useSuggested ? (t?.metric ?? null) : null),
      };
    });
}

/** Sección "Embudo" de la pantalla de una línea (controlada). Las métricas son las marcadas en el árbol. */
export function FunnelEditor({
  rows,
  onChange,
  metricNames,
  lineName,
  readOnly,
}: {
  rows: FunnelRow[];
  onChange: (rows: FunnelRow[]) => void;
  metricNames: string[];
  lineName: string;
  readOnly?: boolean;
}) {
  const update = (id: string, patch: Partial<FunnelRow>) => onChange(rows.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const available = new Set(metricNames.map(norm));

  return (
    <div>
      <ol className="stagger space-y-2">
        {rows.map((row, i) => {
          const value = row.metricName && available.has(norm(row.metricName)) ? metricNames.find((n) => norm(n) === norm(row.metricName!))! : NONE;
          return (
            <li key={row.id}>
              <div className="mx-auto rounded-xl border p-4" style={{ width: `${100 - i * 5}%`, minWidth: "min(100%, 300px)" }}>
                <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-paper">{i + 1}</span>
                      <Input
                        aria-label={`Nombre de la etapa ${i + 1}`}
                        className="h-8 font-medium"
                        value={row.name}
                        disabled={readOnly}
                        onChange={(e) => update(row.id, { name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <HelpLabel htmlFor={`st-d-${row.id}`} help="Qué hace el cliente en esta etapa, en esta línea. Así todos ubican los problemas en el mismo lugar.">
                        Qué significa en {lineName}
                      </HelpLabel>
                      <Textarea id={`st-d-${row.id}`} rows={2} value={row.description} disabled={readOnly} onChange={(e) => update(row.id, { description: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <HelpLabel htmlFor={`st-m-${row.id}`} help={FIELD_HELP.stageMetric}>
                      Métrica que la mide
                    </HelpLabel>
                    <Select value={value} disabled={readOnly} onValueChange={(v) => update(row.id, { metricName: v === NONE ? null : v })}>
                      <SelectTrigger id={`st-m-${row.id}`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Sin métrica</SelectItem>
                        {metricNames.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              {i < rows.length - 1 ? <ChevronDown className="mx-auto mt-2 size-4 text-soft" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-soft">Sin afán: después puede agregar, quitar o reordenar etapas desde la vista de la línea.</p>
    </div>
  );
}
