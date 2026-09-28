"use client";

import { Sparkles, TriangleAlert } from "lucide-react";
import { FormField } from "@/components/app/form";
import { Callout } from "@/components/app/page";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inferControl } from "@/domain/experiment-inference";
import { EXPERIMENT_TEMPLATES, type ExperimentTemplate } from "@/domain/experiment-templates";
import { METRIC_TYPE_LABEL } from "@/domain/labels";
import type { WizardData, WizardValues } from "../wizard-values";
import type { SetField, SetValues } from "./shared";
import { SimilarBox } from "./similar-box";

/** Paso 1 · Problema y métrica del árbol (y plantilla opcional). */
export function StepOrigin({
  data,
  v,
  set,
  setV,
  errors,
  designLocked,
  controlTouched,
  problemsByLine,
  lineMetrics,
  hasProblem,
  draftText,
  experimentId,
  onPickTemplate,
}: {
  data: WizardData;
  v: WizardValues;
  set: SetField;
  setV: SetValues;
  errors: Record<string, string>;
  designLocked: boolean;
  controlTouched: boolean;
  problemsByLine: { line: WizardData["lines"][number]; problems: WizardData["problems"] }[];
  lineMetrics: WizardData["metrics"];
  hasProblem: boolean;
  draftText: string;
  experimentId?: string;
  onPickTemplate: (t: ExperimentTemplate) => void;
}) {
  return (
    <div className="space-y-4">
      {problemsByLine.length === 0 ? (
        <Callout icon={TriangleAlert} title="No hay problemas disponibles">
          Primero registre un problema con evidencia: no hay ejercicio sin problema.
        </Callout>
      ) : null}
      <FormField id="problem_id" label="Problema" required error={errors.problem_id} description="El ejercicio ataca este problema.">
        <Select
          value={v.problem_id || undefined}
          onValueChange={(pid) => {
            const p = data.problems.find((x) => x.id === pid);
            setV((prev) => ({
              ...prev,
              problem_id: pid,
              metric_id: data.metrics.some((m) => m.id === prev.metric_id && m.line_id === p?.line_id) ? prev.metric_id : "",
              control: controlTouched ? prev.control : inferControl(p?.control, prev.control),
              // Los guardrails son de la línea: si cambia de línea, se limpian.
              guardrails: prev.guardrails.filter((g) => data.metrics.some((m) => m.id === g.metric_id && m.line_id === p?.line_id)),
            }));
          }}
        >
          <SelectTrigger id="problem_id" className="w-full" aria-invalid={!!errors.problem_id}>
            <SelectValue placeholder="Elija el problema" />
          </SelectTrigger>
          <SelectContent>
            {problemsByLine.map((g) => (
              <SelectGroup key={g.line.id}>
                <SelectLabel>{g.line.name}</SelectLabel>
                {g.problems.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title} · {p.stage_name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField
        id="metric_id"
        label="Métrica del árbol"
        required
        error={errors.metric_id}
        description={
          hasProblem ? "Solo métricas de la misma línea del problema. Es también la métrica principal de la prueba." : "Elija primero el problema."
        }
      >
        <Select value={v.metric_id || undefined} onValueChange={(mid) => set("metric_id", mid)} disabled={!hasProblem || designLocked}>
          <SelectTrigger id="metric_id" className="w-full" aria-invalid={!!errors.metric_id}>
            <SelectValue placeholder="Elija la métrica" />
          </SelectTrigger>
          <SelectContent>
            {lineMetrics.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name} · {METRIC_TYPE_LABEL[m.type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      {hasProblem && lineMetrics.length === 0 ? (
        <Callout icon={TriangleAlert}>Esta línea todavía no tiene métricas en su árbol. Créelas en la vista de la línea.</Callout>
      ) : null}
      {!designLocked ? (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="size-4" aria-hidden /> Partir de una plantilla
            <span className="font-normal text-soft">(opcional)</span>
          </div>
          <p className="mb-2 text-xs text-soft">Llena solo lo que esté vacío: título, hipótesis, tipo de prueba, duración, regla y variantes.</p>
          <div className="flex flex-wrap gap-2">
            {EXPERIMENT_TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                title={t.description}
                onClick={() => onPickTemplate(t)}
                className="rounded-full border bg-paper px-3 py-1 text-sm transition-colors hover:border-ink/40 hover:bg-wash"
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <FormField id="title" label="Título del ejercicio" required error={errors.title}>
        <Input
          id="title"
          value={v.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Recordatorio de recarga con paquete sugerido por WhatsApp"
        />
      </FormField>
      <SimilarBox data={data} draftText={draftText} excludeExperimentId={experimentId} excludeLearningId={v.derived_from_learning_id} />
    </div>
  );
}
