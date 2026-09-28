"use client";

import { Lock, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { FormField } from "@/components/app/form";
import { Term } from "@/components/app/info-tip";
import { Callout } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { decisionRuleTemplate } from "@/domain/experiment-templates";
import { formatScore } from "@/domain/format";
import { TEST_TYPE_LABEL } from "@/domain/labels";
import { TEST_TYPES, type MetricDirection } from "@/domain/types";
import { cn } from "@/lib/utils";
import type { WizardData, WizardValues, WizardVariant } from "../wizard-values";
import { GuardrailsPicker } from "./guardrails-picker";
import { PowerCalculator } from "./power-calculator";
import type { SetField, SetValues } from "./shared";
import { TiaDesignHelp } from "./tia-help";

/** Paso 4 · Diseño de la prueba (se bloquea al pasar a En prueba). */
export function StepDesign({
  programId,
  v,
  set,
  setV,
  locked,
  metric,
  lineMetrics,
  direction,
  rigorReady,
}: {
  programId: string;
  v: WizardValues;
  set: SetField;
  setV: SetValues;
  locked: boolean;
  metric: WizardData["metrics"][number] | undefined;
  lineMetrics: WizardData["metrics"];
  direction: MetricDirection;
  rigorReady: boolean;
}) {
  const metricName = metric?.name;
  const [newControlMetric, setNewControlMetric] = useState("");
  function updateVariant(i: number, patch: Partial<WizardVariant>) {
    setV((prev) => ({
      ...prev,
      variants: prev.variants.map((x, j) => (j === i ? { ...x, ...patch } : patch.is_control ? { ...x, is_control: false } : x)),
    }));
  }
  const weeks = v.min_duration_days ? v.min_duration_days / 7 : null;
  const effect = v.expected_effect_pct;

  return (
    <fieldset disabled={locked} className="space-y-6">
      {locked ? (
        <Callout icon={Lock} title="Diseño bloqueado">
          El ejercicio ya está en prueba: variantes, métricas, duración y regla de decisión son de solo lectura. Solo el owner puede
          desbloquearlo desde el detalle.
        </Callout>
      ) : (
        <>
          <p className="text-sm text-soft">El diseño se fija antes de lanzar y no se reinterpreta después. Al pasar a En prueba queda bloqueado.</p>
          <TiaDesignHelp programId={programId} v={v} setV={setV} />
        </>
      )}
      <div>
        <div className="mb-2 text-sm font-medium">
          <Term k="testType" />
        </div>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tipo de prueba">
          {TEST_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={v.test_type === t}
              onClick={() => set("test_type", t)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-sm transition-colors hover:border-ink/40",
                v.test_type === t && "border-ink bg-wash font-medium",
              )}
            >
              {TEST_TYPE_LABEL[t]}
              <span className="block text-xs font-normal text-soft">
                {t === "ab" ? "Con volumen: se divide el tráfico." : t === "geo" ? "Una zona prueba, otra es control." : "Se compara con un periodo anterior."}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium">
            <Term k="variant">Variantes</Term>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setV((prev) => ({
                ...prev,
                variants: [...prev.variants, { name: `Variante ${String.fromCharCode(64 + prev.variants.length)}`, is_control: false, description: "" }],
              }))
            }
          >
            <Plus aria-hidden /> Agregar variante
          </Button>
        </div>
        <ul className="space-y-2">
          {v.variants.map((x, i) => (
            <li key={x.id ?? i} className="grid items-start gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_2fr_auto_auto]">
              <Input aria-label={`Nombre de la variante ${i + 1}`} value={x.name} onChange={(e) => updateVariant(i, { name: e.target.value })} />
              <Input
                aria-label={`Descripción de la variante ${i + 1}`}
                placeholder="Qué ve o recibe este grupo"
                value={x.description}
                onChange={(e) => updateVariant(i, { description: e.target.value })}
              />
              <label className="flex h-8 items-center gap-2 text-sm">
                <input type="radio" name="control-variant" checked={x.is_control} onChange={() => updateVariant(i, { is_control: true })} />
                Control
              </label>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Quitar ${x.name}`}
                onClick={() => setV((prev) => ({ ...prev, variants: prev.variants.filter((_, j) => j !== i) }))}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        {!v.variants.some((x) => x.is_control) ? (
          <p className="mt-2 text-sm">
            Marque una variante como <Term k="controlVariant">control</Term>.
          </p>
        ) : null}
      </div>

      <PowerCalculator v={v} set={set} setV={setV} metric={metric} direction={direction} rigorReady={rigorReady} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <div className="text-sm font-medium">Métrica principal</div>
          <p className="flex h-9 items-center text-sm">{metricName ?? <span className="text-soft">Elija la métrica del árbol en el paso 1</span>}</p>
          <p className="text-xs text-soft">La que decide el resultado: la métrica del árbol que eligió en el paso 1.</p>
        </div>
        <FormField
          id="min_duration_days"
          label={<Term k="minDuration">Duración mínima (días)</Term>}
          description={weeks ? `≈ ${formatScore(weeks)} semanas` : "Por ejemplo: 28 días = 4 semanas."}
        >
          <Input
            id="min_duration_days"
            type="number"
            min={1}
            inputMode="numeric"
            value={v.min_duration_days ?? ""}
            onChange={(e) => set("min_duration_days", e.target.value ? Number(e.target.value) : null)}
          />
        </FormField>
      </div>

      {rigorReady ? (
        <GuardrailsPicker
          guardrails={v.guardrails}
          onChange={(next) => set("guardrails", next)}
          metrics={lineMetrics}
          targetMetricId={v.metric_id}
        />
      ) : null}

      <div>
        <div className="text-sm font-medium">Métricas de control</div>
        <p className="text-xs text-soft">Las que no deben empeorar (con su umbral, si lo hay).</p>
        <ul className="mt-2 space-y-1">
          {v.control_metrics.map((c, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="flex-1 rounded-md border bg-wash px-2 py-1">{c}</span>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`Quitar ${c}`}
                onClick={() => set("control_metrics", v.control_metrics.filter((_, j) => j !== i))}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <Input
            aria-label="Nueva métrica de control"
            value={newControlMetric}
            placeholder="Tasa de bloqueo del número (no más de 1,5%)"
            onChange={(e) => setNewControlMetric(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newControlMetric.trim()) {
                e.preventDefault();
                set("control_metrics", [...v.control_metrics, newControlMetric.trim()]);
                setNewControlMetric("");
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!newControlMetric.trim()}
            onClick={() => {
              set("control_metrics", [...v.control_metrics, newControlMetric.trim()]);
              setNewControlMetric("");
            }}
          >
            <Plus aria-hidden /> Agregar
          </Button>
        </div>
      </div>

      <FormField
        id="decision_rule"
        label={<Term k="decisionRule" />}
        description="Qué resultado lleva a escalar, ajustar o apagar. Se fija antes de lanzar."
      >
        <Textarea
          id="decision_rule"
          rows={2}
          value={v.decision_rule}
          placeholder="Escalar si la variante supera al control en al menos 10% relativo y el bloqueo no pasa de 1,5%."
          onChange={(e) => set("decision_rule", e.target.value)}
        />
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (v.decision_rule.trim() && !window.confirm("Ya hay una regla escrita. ¿La reemplaza por la plantilla?")) return;
              set("decision_rule", decisionRuleTemplate(metricName, direction, effect != null && effect !== 0 ? Math.abs(effect) : 10));
            }}
          >
            Usar plantilla
          </Button>
        </div>
      </FormField>
    </fieldset>
  );
}
