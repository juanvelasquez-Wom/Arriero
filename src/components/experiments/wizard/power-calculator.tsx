"use client";

import { Calculator, TriangleAlert } from "lucide-react";
import { FormField } from "@/components/app/form";
import { Term } from "@/components/app/info-tip";
import { Button } from "@/components/ui/button";
import {
  computeExperimentPower,
  DEFAULT_DAILY_CV_PCT,
  powerCalcFor,
  powerShortfall,
  suggestedBaseline,
} from "@/domain/experiment-power";
import { formatScore } from "@/domain/format";
import { sampleSizePerVariant, suggestedDays } from "@/domain/sample-size";
import type { MetricDirection } from "@/domain/types";
import type { WizardData, WizardValues } from "../wizard-values";
import { DecimalInput, integer, type SetField, type SetValues } from "./shared";

const pct = (n: number | null) => (n == null ? "—" : `${formatScore(n)} %`);

/**
 * ¿Cuánto debe durar y alcanza a ver el efecto? Efecto esperado + los datos de
 * la métrica del árbol → muestra, días sugeridos y efecto mínimo detectable
 * (MDE). La potencia que se guarda la calcula el servidor con los mismos datos.
 */
export function PowerCalculator({
  v,
  set,
  setV,
  metric,
  direction,
  rigorReady,
}: {
  v: WizardValues;
  set: SetField;
  setV: SetValues;
  metric: WizardData["metrics"][number] | undefined;
  direction: MetricDirection;
  rigorReady: boolean;
}) {
  const calc = powerCalcFor(metric?.unit);
  const inputs = v.power_inputs;
  const setInput = (k: keyof WizardValues["power_inputs"], n: number | null) =>
    setV((prev) => ({ ...prev, power_inputs: { ...prev.power_inputs, [k]: n } }));
  const arms = Math.max(2, v.variants.length);
  const effect = v.expected_effect_pct;
  const suggested = metric ? suggestedBaseline(metric) : null;

  // Muestra y días (solo tasas): la guía de siempre.
  const perVariant =
    calc === "rate" && inputs.baseline != null && effect != null
      ? sampleSizePerVariant(inputs.baseline / 100, ((direction === "down" ? -1 : 1) * Math.abs(effect)) / 100)
      : null;
  const rateDays = suggestedDays(perVariant, arms, inputs.weekly_traffic ?? null);
  const calcInvalid = calc === "rate" && inputs.baseline != null && effect != null && perVariant == null;

  const power = computeExperimentPower({ calc, inputs, expectedPct: effect, arms, plannedDays: v.min_duration_days });
  const shortfall = powerShortfall(power, effect);
  const daysToUse = calc === "rate" ? rateDays : (power?.days_needed ?? null);
  const warnings = (power?.warnings ?? []).filter((w) => !/no alcanza a ver el efecto que espera/.test(w));

  return (
    <div className="rounded-xl border bg-wash/60 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-medium">
        <Calculator className="size-4" aria-hidden /> ¿Cuánto debe durar? · <Term k="sampleSize" />
      </div>
      <p className="mb-3 text-xs text-soft">
        Una guía para planear, con 95 % de confianza y 80 % de potencia. No reemplaza la regla de decisión.
        {calc === "rate" ? " La métrica es una tasa: se usa la tasa actual y las personas por semana." : " La métrica es un volumen: se usa su valor semanal y cuánto varía de un día a otro."}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id="calc-effect" label="Efecto esperado (%)" description="Cuánto cree que mejora la métrica si la hipótesis se cumple.">
          <DecimalInput id="calc-effect" placeholder="10" value={effect} onValueChange={(n) => set("expected_effect_pct", n)} />
        </FormField>
        {calc === "rate" ? (
          <>
            <FormField id="calc-rate" label="Tasa actual (%)">
              <DecimalInput id="calc-rate" placeholder={suggested != null ? formatScore(suggested) : "4,5"} value={inputs.baseline} onValueChange={(n) => setInput("baseline", n)} />
            </FormField>
            <FormField id="calc-traffic" label="Personas por semana">
              <DecimalInput
                id="calc-traffic"
                inputMode="numeric"
                placeholder="20000"
                value={inputs.weekly_traffic ?? null}
                onValueChange={(n) => setInput("weekly_traffic", n)}
              />
            </FormField>
          </>
        ) : (
          <>
            <FormField id="calc-weekly" label="Valor semanal actual">
              <DecimalInput id="calc-weekly" placeholder={suggested != null ? formatScore(suggested) : "1200"} value={inputs.baseline} onValueChange={(n) => setInput("baseline", n)} />
            </FormField>
            <FormField id="calc-cv" label="Variación diaria (%)" description={`Si no la sabe, se asume ${formatScore(DEFAULT_DAILY_CV_PCT)} %.`}>
              <DecimalInput
                id="calc-cv"
                placeholder={formatScore(DEFAULT_DAILY_CV_PCT)}
                value={inputs.daily_cv_pct ?? null}
                onValueChange={(n) => setInput("daily_cv_pct", n)}
              />
            </FormField>
          </>
        )}
      </div>
      {inputs.baseline == null && suggested != null ? (
        <Button type="button" size="xs" variant="ghost" className="mt-1" onClick={() => setInput("baseline", suggested)}>
          Usar el último valor de {metric?.name ?? "la métrica"} ({formatScore(suggested)})
        </Button>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm" aria-live="polite">
        {calcInvalid ? (
          <span className="text-soft">Esos números no dan: la tasa va entre 0 y 100 % y el efecto no puede ser cero. Revíselos, sin afán.</span>
        ) : perVariant != null ? (
          <span>
            Muestra por variante: <strong className="tabular-nums">{integer.format(perVariant)}</strong> personas
          </span>
        ) : null}
        {daysToUse != null ? (
          <span>
            Días sugeridos: <strong className="tabular-nums">{daysToUse}</strong>
            <span className="text-soft"> ({arms} variantes)</span>
          </span>
        ) : null}
        {power?.mde_pct != null ? (
          <span>
            Con {v.min_duration_days} días ve cambios desde <strong className="tabular-nums">{pct(power.mde_pct)}</strong>
          </span>
        ) : null}
        {daysToUse != null ? (
          <Button type="button" size="sm" variant="outline" onClick={() => set("min_duration_days", daysToUse)}>
            Usar como duración mínima
          </Button>
        ) : null}
        {!calcInvalid && perVariant == null && daysToUse == null && power?.mde_pct == null ? (
          <span className="text-soft">Ponga el efecto esperado y los datos de la métrica, y aquí sale la cuenta.</span>
        ) : null}
      </div>
      {shortfall ? (
        <p className="mt-2 flex items-start gap-1.5 text-sm" role="note">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Ojo: {shortfall}</span>
        </p>
      ) : null}
      {warnings.length && (effect != null || inputs.baseline != null) ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-soft">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      {!rigorReady ? (
        <p className="mt-2 text-xs text-soft">El efecto esperado y la potencia se podrán guardar cuando se actualice la base de datos. Por ahora es solo la cuenta.</p>
      ) : null}
    </div>
  );
}
