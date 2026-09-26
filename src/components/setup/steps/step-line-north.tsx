"use client";

import { Gauge, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/app/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatDateRange } from "@/domain/format";
import type { MetricSuggestion } from "@/domain/growth-templates";
import { parseDecimal, toInputValue } from "@/domain/metric-tree";
import type { MetricDirection } from "@/domain/types";
import { saveNorthStarStep } from "@/server/actions/setup";
import type { MetricRow } from "@/server/queries/structure";
import { FIELD_HELP } from "../help-content";
import { HelpLabel, UseExampleButton } from "../help";
import { StepFooter } from "../step-footer";

interface Draft {
  id?: string;
  name: string;
  unit: string;
  direction: MetricDirection;
  definition: string;
  baseline: string;
  targets: Record<string, string>;
}

function toDraft(existing: MetricRow | undefined, suggestion: MetricSuggestion): Draft {
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

function MetricFields({
  prefix,
  title,
  icon: Icon,
  help,
  draft,
  onChange,
  horizons,
  readOnly,
  errors,
}: {
  prefix: string;
  title: string;
  icon: typeof Star;
  help: string;
  draft: Draft;
  onChange: (d: Draft) => void;
  horizons: { id: string; name: string; start_date: string; end_date: string }[];
  readOnly?: boolean;
  errors: Record<string, string>;
}) {
  const bad = (v: string) => v.trim() !== "" && Number.isNaN(parseDecimal(v));
  return (
    <fieldset disabled={readOnly} className="space-y-4">
      <legend className="mb-2 flex items-center gap-2 font-semibold">
        <Icon className="size-4" aria-hidden /> {title}
      </legend>
      <div className="grid gap-4 sm:grid-cols-[1fr_140px_150px]">
        <div className="space-y-1.5">
          <HelpLabel htmlFor={`${prefix}-name`} help={help} required>
            Nombre
          </HelpLabel>
          <Input id={`${prefix}-name`} value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} aria-invalid={!!errors[`${prefix}.name`]} />
        </div>
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
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <div className="space-y-1.5">
          <HelpLabel htmlFor={`${prefix}-base`} help={FIELD_HELP.baseline}>
            Hoy (línea base)
          </HelpLabel>
          <Input id={`${prefix}-base`} inputMode="decimal" value={draft.baseline} placeholder="420" onChange={(e) => onChange({ ...draft, baseline: e.target.value })} aria-invalid={bad(draft.baseline)} />
        </div>
        <div className="space-y-1.5">
          <HelpLabel help={FIELD_HELP.target}>Meta por horizonte</HelpLabel>
          <div className="flex flex-wrap gap-3">
            {horizons.map((h) => (
              <div key={h.id} className="w-36 space-y-1">
                <label htmlFor={`${prefix}-t-${h.id}`} className="text-xs text-soft" title={formatDateRange(h.start_date, h.end_date)}>
                  {h.name}
                </label>
                <Input
                  id={`${prefix}-t-${h.id}`}
                  inputMode="decimal"
                  value={draft.targets[h.id] ?? ""}
                  onChange={(e) => onChange({ ...draft, targets: { ...draft.targets, [h.id]: e.target.value } })}
                  aria-invalid={bad(draft.targets[h.id] ?? "")}
                />
              </div>
            ))}
            {!horizons.length ? <p className="text-sm text-soft">Define los horizontes para fijar metas.</p> : null}
          </div>
        </div>
      </div>
    </fieldset>
  );
}

export function StepLineNorth({
  programId,
  line,
  lineIndex,
  lineCount,
  northSuggestion,
  efficiencySuggestion,
  existingNorth,
  existingEfficiency,
  horizons,
  prevHref,
  nextHref,
  readOnly,
}: {
  programId: string;
  line: { id: string; name: string };
  lineIndex: number;
  lineCount: number;
  northSuggestion: MetricSuggestion;
  efficiencySuggestion: MetricSuggestion;
  existingNorth?: MetricRow;
  existingEfficiency?: MetricRow;
  horizons: { id: string; name: string; start_date: string; end_date: string }[];
  prevHref: string;
  nextHref: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [north, setNorth] = useState<Draft>(toDraft(existingNorth, northSuggestion));
  const [eff, setEff] = useState<Draft>(toDraft(existingEfficiency, efficiencySuggestion));
  const [withEff, setWithEff] = useState(existingEfficiency ? true : !existingNorth);
  const [later, setLater] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function toPayload(d: Draft) {
    const targets: Record<string, number | null> = {};
    for (const h of horizons) {
      const v = parseDecimal(d.targets[h.id] ?? "");
      targets[h.id] = v != null && !Number.isNaN(v) ? v : null;
    }
    const base = parseDecimal(d.baseline);
    return {
      metric: { id: d.id, name: d.name, unit: d.unit, direction: d.direction, definition: d.definition, baseline: base != null && !Number.isNaN(base) ? base : null },
      targets,
      invalid: [d.baseline, ...Object.values(d.targets)].some((v) => v.trim() !== "" && Number.isNaN(parseDecimal(v))),
      missing: !d.baseline.trim() || horizons.some((h) => !(d.targets[h.id] ?? "").trim()),
    };
  }

  function next() {
    if (readOnly) {
      router.push(nextHref);
      return;
    }
    setError(undefined);
    setErrors({});
    const n = toPayload(north);
    const e = toPayload(eff);
    if (north.name.trim().length < 2) {
      setErrors({ "n.name": "x" });
      setError("Escribe el nombre de la métrica norte.");
      return;
    }
    if (n.invalid || (withEff && e.invalid)) {
      setError("Revisa los números: escribe solo cifras, por ejemplo 420 o 185.000.");
      return;
    }
    if (!later && (n.missing || (withEff && e.missing))) {
      setError("Faltan la línea base o alguna meta. Complétalas o marca \"Lo completo después\".");
      return;
    }
    startTransition(async () => {
      const r = await saveNorthStarStep(programId, line.id, {
        northStar: n.metric,
        efficiency: withEff ? e.metric : null,
        northTargets: n.targets,
        efficiencyTargets: withEff ? e.targets : {},
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(nextHref);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-wash px-4 py-2 text-sm">
        <span>
          Línea {lineIndex + 1} de {lineCount}: <strong>{line.name}</strong>
        </span>
        {!readOnly ? (
          <UseExampleButton
            label="Usar la sugerencia"
            onClick={() => {
              setNorth({ ...toDraft(undefined, northSuggestion), id: north.id, baseline: north.baseline, targets: north.targets });
              setEff({ ...toDraft(undefined, efficiencySuggestion), id: eff.id, baseline: eff.baseline, targets: eff.targets });
              setWithEff(true);
            }}
          />
        ) : null}
      </div>

      <div className="rounded-xl border border-l-4 border-l-highlight bg-paper p-5">
        <MetricFields prefix="n" title="Métrica norte" icon={Star} help={FIELD_HELP.northStar} draft={north} onChange={setNorth} horizons={horizons} readOnly={readOnly} errors={errors} />
      </div>

      <div className="rounded-xl border bg-paper p-5">
        <div className="mb-4 flex items-center gap-3">
          <Switch id="with-eff" checked={withEff} disabled={readOnly} onCheckedChange={setWithEff} />
          <label htmlFor="with-eff" className="text-sm">
            Medir también la eficiencia (recomendado)
          </label>
        </div>
        {withEff ? (
          <MetricFields prefix="e" title="Métrica de eficiencia" icon={Gauge} help={FIELD_HELP.efficiency} draft={eff} onChange={setEff} horizons={horizons} readOnly={readOnly} errors={errors} />
        ) : (
          <p className="text-sm text-soft">Sin eficiencia, el programa podría crecer la métrica norte a cualquier costo.</p>
        )}
      </div>

      {!readOnly ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={later} onCheckedChange={(c) => setLater(!!c)} />
          Aún no tengo la línea base o las metas: lo completo después (quedará en los pendientes).
        </label>
      ) : null}
      <FormError message={error} />
      <StepFooter prevHref={prevHref} pending={pending} onNext={next} />
    </div>
  );
}
