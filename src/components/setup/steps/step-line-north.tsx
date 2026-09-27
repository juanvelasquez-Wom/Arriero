"use client";

import { ChevronDown, Gauge, Star } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatDateRange } from "@/domain/format";
import type { MetricSuggestion } from "@/domain/growth-templates";
import { parseDecimal, toInputValue } from "@/domain/metric-tree";
import type { MetricDirection } from "@/domain/types";
import type { MetricRow } from "@/server/queries/structure";
import { FIELD_HELP } from "../help-content";
import { HelpLabel } from "../help";

export interface MetricDraft {
  id?: string;
  name: string;
  unit: string;
  direction: MetricDirection;
  definition: string;
  baseline: string;
  targets: Record<string, string>;
}

export interface NorthState {
  north: MetricDraft;
  eff: MetricDraft;
  withEff: boolean;
}

type HorizonRef = { id: string; name: string; start_date: string; end_date: string };

export function toMetricDraft(existing: MetricRow | undefined, suggestion: MetricSuggestion): MetricDraft {
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      unit: existing.unit ?? "",
      direction: existing.direction,
      definition: existing.definition ?? "",
      baseline: toInputValue(existing.baseline),
      targets: Object.fromEntries(existing.targets.map((t) => [t.horizon_id, toInputValue(t.target)])),
    };
  }
  return { name: suggestion.name, unit: suggestion.unit, direction: suggestion.direction, definition: suggestion.definition, baseline: "", targets: {} };
}

export const badNumber = (v: string) => v.trim() !== "" && Number.isNaN(parseDecimal(v));

/** Borrador → datos para guardar (línea base y metas vacías quedan en null). */
export function metricPayload(d: MetricDraft, horizons: HorizonRef[]) {
  const targets: Record<string, number | null> = {};
  for (const h of horizons) {
    const v = parseDecimal(d.targets[h.id] ?? "");
    targets[h.id] = v != null && !Number.isNaN(v) ? v : null;
  }
  const base = parseDecimal(d.baseline);
  return {
    metric: { id: d.id, name: d.name, unit: d.unit, direction: d.direction, definition: d.definition, baseline: base != null && !Number.isNaN(base) ? base : null },
    targets,
    invalid: [d.baseline, ...Object.values(d.targets)].some(badNumber),
  };
}

function MetricFields({
  prefix,
  title,
  icon: Icon,
  help,
  draft,
  onChange,
  horizons,
  readOnly,
  nameError,
  autoFocus,
}: {
  prefix: string;
  title: string;
  icon: typeof Star;
  help: string;
  draft: MetricDraft;
  onChange: (d: MetricDraft) => void;
  horizons: HorizonRef[];
  readOnly?: boolean;
  nameError?: string;
  autoFocus?: boolean;
}) {
  return (
    <fieldset disabled={readOnly} className="space-y-4">
      <legend className="mb-2 flex items-center gap-2 font-heading text-base font-bold">
        <Icon className="size-4" aria-hidden /> {title}
      </legend>
      <div className="space-y-1.5">
        <HelpLabel htmlFor={`${prefix}-name`} help={help} required>
          Nombre
        </HelpLabel>
        <Input
          id={`${prefix}-name`}
          value={draft.name}
          autoFocus={autoFocus}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          aria-invalid={!!nameError}
          aria-describedby={nameError ? `${prefix}-name-error` : undefined}
        />
        {nameError ? (
          <p id={`${prefix}-name-error`} className="text-sm font-medium">
            {nameError}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <div className="space-y-1.5">
          <HelpLabel htmlFor={`${prefix}-base`} help={FIELD_HELP.baseline}>
            Hoy (línea base)
          </HelpLabel>
          <Input
            id={`${prefix}-base`}
            inputMode="decimal"
            value={draft.baseline}
            placeholder="Opcional"
            onChange={(e) => onChange({ ...draft, baseline: e.target.value })}
            aria-invalid={badNumber(draft.baseline)}
          />
          {badNumber(draft.baseline) ? <p className="text-xs font-medium">Solo cifras, por ejemplo 420 o 185.000.</p> : null}
        </div>
        <div className="space-y-1.5">
          <HelpLabel help={FIELD_HELP.target}>Meta por horizonte</HelpLabel>
          <div className="flex flex-wrap gap-3">
            {horizons.map((h) => (
              <div key={h.id} className="w-32 space-y-1">
                <label htmlFor={`${prefix}-t-${h.id}`} className="text-xs text-soft" title={formatDateRange(h.start_date, h.end_date)}>
                  {h.name}
                </label>
                <Input
                  id={`${prefix}-t-${h.id}`}
                  inputMode="decimal"
                  placeholder="Opcional"
                  value={draft.targets[h.id] ?? ""}
                  onChange={(e) => onChange({ ...draft, targets: { ...draft.targets, [h.id]: e.target.value } })}
                  aria-invalid={badNumber(draft.targets[h.id] ?? "")}
                />
              </div>
            ))}
            {!horizons.length ? <p className="text-sm text-soft">Defina los horizontes en el paso de calendario para poder fijar metas.</p> : null}
          </div>
        </div>
      </div>
      <Collapsible>
        <CollapsibleTrigger className="group inline-flex items-center gap-1 text-xs text-soft underline underline-offset-4 hover:text-ink">
          Unidad, dirección y definición <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent className="slide-in mt-3 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <HelpLabel htmlFor={`${prefix}-unit`} help={FIELD_HELP.unit}>
                Unidad
              </HelpLabel>
              <Input id={`${prefix}-unit`} value={draft.unit} placeholder="altas, %, COP" onChange={(e) => onChange({ ...draft, unit: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <HelpLabel htmlFor={`${prefix}-dir`} help={FIELD_HELP.direction}>
                Lo bueno es que
              </HelpLabel>
              <Select value={draft.direction} onValueChange={(v) => onChange({ ...draft, direction: v as MetricDirection })}>
                <SelectTrigger id={`${prefix}-dir`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="up">Suba</SelectItem>
                  <SelectItem value="down">Baje</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <HelpLabel htmlFor={`${prefix}-def`} help="Cómo se calcula, para que todos la midan igual.">
              Definición
            </HelpLabel>
            <Textarea id={`${prefix}-def`} rows={2} value={draft.definition} onChange={(e) => onChange({ ...draft, definition: e.target.value })} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </fieldset>
  );
}

/** Sección "Métrica norte y eficiencia" de la pantalla de una línea (controlada). */
export function NorthEditor({
  value,
  onChange,
  horizons,
  readOnly,
  nameError,
  autoFocus,
}: {
  value: NorthState;
  onChange: (v: NorthState) => void;
  horizons: HorizonRef[];
  readOnly?: boolean;
  nameError?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-l-4 border-l-highlight p-4">
        <MetricFields
          prefix="n"
          title="Métrica norte"
          icon={Star}
          help={FIELD_HELP.northStar}
          draft={value.north}
          onChange={(north) => onChange({ ...value, north })}
          horizons={horizons}
          readOnly={readOnly}
          nameError={nameError}
          autoFocus={autoFocus}
        />
      </div>
      <div className="rounded-xl border p-4">
        <div className="mb-4 flex items-center gap-3">
          <Switch id="with-eff" checked={value.withEff} disabled={readOnly} onCheckedChange={(withEff) => onChange({ ...value, withEff })} />
          <label htmlFor="with-eff" className="text-sm">
            Medir también la eficiencia (recomendado)
          </label>
        </div>
        {value.withEff ? (
          <MetricFields
            prefix="e"
            title="Métrica de eficiencia"
            icon={Gauge}
            help={FIELD_HELP.efficiency}
            draft={value.eff}
            onChange={(eff) => onChange({ ...value, eff })}
            horizons={horizons}
            readOnly={readOnly}
          />
        ) : (
          <p className="text-sm text-soft">Sin eficiencia, el programa podría crecer la métrica norte a cualquier costo.</p>
        )}
      </div>
      <p className="text-xs text-soft">¿No tiene la línea base o las metas? Déjelas vacías: quedan en los pendientes del resumen.</p>
    </div>
  );
}
