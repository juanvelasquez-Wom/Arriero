"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Calculator, ChevronDown, Plus, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyFieldErrors, FormError, FormField } from "@/components/app/form";
import { Callout } from "@/components/app/page";
import { PilotTerm } from "@/components/pilots/pilot-term";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DIRECTION_LABEL } from "@/domain/labels";
import { METRIC_CALC_LABEL, METRIC_SCOPE_LABEL, PLATFORM_METRIC_WARNING } from "@/domain/pilots/labels";
import { pctText } from "@/domain/pilots/numbers";
import { computePower, DEFAULT_DAILY_CV } from "@/domain/pilots/power";
import { PILOT_METRIC_SCOPES, type PowerInputs } from "@/domain/pilots/types";
import { formatCop } from "@/domain/value";
import { pilotMetricsSchema, type PilotMetricsInput } from "@/lib/validation/pilots";
import { savePilotMetrics } from "@/server/actions/pilots";
import type { CatalogMetric } from "@/server/queries/pilots";
import { NumberInput } from "./inputs";
import { WizardFooter, type SaveThen } from "./wizard-footer";
import { pilotStepHref } from "./wizard-links";

type MetricsValues = z.output<typeof pilotMetricsSchema>;
type MetricsForm = Omit<PilotMetricsInput, "power_inputs"> & { power_inputs: PowerInputs };

export interface StepMetricsProps {
  pilotId: string;
  metrics: CatalogMetric[];
  initial: MetricsForm;
  /** Para la calculadora en vivo (el servidor la vuelve a calcular al guardar). */
  expectedPct: number | null;
  arms: number;
  budgetCop: number | null;
}

const MAX_GUARDRAILS = 3;
const blankNumber = (v: number | null | undefined) => v == null || Number.isNaN(v);

/** Sin línea base no hay cálculo de potencia: se guarda vacío (queda en "qué falta"). */
const metricsResolver: Resolver<MetricsForm, unknown, MetricsValues> = (values, ctx, options) =>
  zodResolver(pilotMetricsSchema)(
    { ...values, power_inputs: blankNumber(values.power_inputs?.baseline) ? null : values.power_inputs },
    ctx,
    options as never,
  ) as ReturnType<Resolver<MetricsForm, unknown, MetricsValues>>;

function MetricOption({ m }: { m: CatalogMetric }) {
  return (
    <span className="flex flex-col">
      <span>{m.name}</span>
      <span className="text-xs text-soft">
        {METRIC_CALC_LABEL[m.calc]} · {DIRECTION_LABEL[m.direction]} es mejor
      </span>
    </span>
  );
}

function ResultTile({ label, value, hint }: { label: React.ReactNode; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-paper p-3">
      <div className="text-xs font-medium text-soft">{label}</div>
      <div className="mt-0.5 font-heading text-2xl font-extrabold tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-soft">{hint}</div> : null}
    </div>
  );
}

export function StepMetrics({ pilotId, metrics, initial, expectedPct, arms, budgetCop }: StepMetricsProps) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const form = useForm<MetricsForm, unknown, MetricsValues>({ resolver: metricsResolver, defaultValues: initial });
  const { errors } = form.formState;
  const primaryId = useWatch({ control: form.control, name: "primary_metric_id" });
  const guardrails = useWatch({ control: form.control, name: "guardrails" }) ?? [];
  const power = useWatch({ control: form.control, name: "power_inputs" });
  const primary = metrics.find((m) => m.id === primaryId) ?? null;
  const isRate = primary?.calc === "rate";

  const result = primary
    ? computePower(
        primary.calc,
        {
          ...power,
          baseline: blankNumber(power.baseline) ? Number.NaN : power.baseline,
          daily_cv: blankNumber(power.daily_cv) ? null : power.daily_cv,
        },
        expectedPct,
        Math.max(2, arms),
        budgetCop,
      )
    : null;

  const grouped = PILOT_METRIC_SCOPES.map((s) => ({ scope: s, items: metrics.filter((m) => m.scope === s) })).filter((g) => g.items.length);
  // Negocio primero: es lo que de verdad cuenta.
  grouped.sort((a, b) => (a.scope === "business" ? -1 : b.scope === "business" ? 1 : 0));

  const setGuardrails = (next: MetricsForm["guardrails"]) => form.setValue("guardrails", next, { shouldDirty: true });

  const save = (then: SaveThen) =>
    form.handleSubmit(
      (data) => {
        setError(undefined);
        startTransition(async () => {
          const r = await savePilotMetrics(pilotId, data);
          if (!r.ok) {
            setError(r.error);
            applyFieldErrors(r.fieldErrors, form.setError);
            return;
          }
          toast.success(r.message ?? "Métricas y potencia guardadas.");
          if (then === "next") router.push(pilotStepHref(pilotId, "reglas"));
          else router.refresh();
        });
      },
      () => setError("Revise los campos marcados, sin afán."),
    )();

  const powerError = (k: keyof PowerInputs) => (errors.power_inputs as Record<string, { message?: string }> | undefined)?.[k]?.message;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save("next");
      }}
      className="space-y-6"
    >
      <FormError message={error} />

      <section className="space-y-4 rounded-2xl border bg-paper p-4 shadow-card sm:p-5">
        <h2 className="text-base font-bold">Métrica principal</h2>
        <FormField id="metric-primary" label="La que define quién gana" error={errors.primary_metric_id?.message}>
          <Controller
            control={form.control}
            name="primary_metric_id"
            render={({ field }) => (
              <Select
                value={field.value || undefined}
                onValueChange={(v) => {
                  field.onChange(v);
                  // La principal no puede ser también guardrail.
                  setGuardrails(guardrails.filter((g) => g.metric_id !== v));
                }}
              >
                <SelectTrigger id="metric-primary" className="min-h-11 w-full" aria-invalid={!!errors.primary_metric_id}>
                  <SelectValue placeholder="Elija la métrica principal" />
                </SelectTrigger>
                <SelectContent>
                  {grouped.map((g) => (
                    <SelectGroup key={g.scope}>
                      <SelectLabel>{METRIC_SCOPE_LABEL[g.scope]}</SelectLabel>
                      {g.items.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <MetricOption m={m} />
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        {primary?.scope === "platform" ? (
          <Callout icon={TriangleAlert} title="Métrica de plataforma">
            {PLATFORM_METRIC_WARNING} Si puede, use una de negocio como principal y deje esta como guardrail.
          </Callout>
        ) : null}
      </section>

      <section className="space-y-4 rounded-2xl border bg-paper p-4 shadow-card sm:p-5">
        <div>
          <h2 className="text-base font-bold">
            <PilotTerm k="guardrail" />
          </h2>
          <p className="text-xs text-soft">De 1 a 3. Si uno se rompe, el piloto no escala aunque gane.</p>
        </div>
        {errors.guardrails?.message || errors.guardrails?.root?.message ? (
          <p className="text-sm text-destructive">{errors.guardrails?.message ?? errors.guardrails?.root?.message}</p>
        ) : null}
        <ul className="space-y-3">
          {guardrails.map((g, i) => {
            const options = metrics.filter((m) => m.id !== primaryId && (m.id === g.metric_id || !guardrails.some((x) => x.metric_id === m.id)));
            const m = metrics.find((x) => x.id === g.metric_id);
            const gErr = errors.guardrails?.[i];
            return (
              <li key={`${g.metric_id}-${i}`} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <FormField id={`guardrail-${i}-metric`} label="Métrica" className="min-w-48 flex-1" error={gErr?.metric_id?.message}>
                    <Select
                      value={g.metric_id || undefined}
                      onValueChange={(v) => setGuardrails(guardrails.map((x, j) => (j === i ? { ...x, metric_id: v } : x)))}
                    >
                      <SelectTrigger id={`guardrail-${i}-metric`} className="min-h-11 w-full">
                        <SelectValue placeholder="Elija la métrica" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            <MetricOption m={o} />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField id={`guardrail-${i}-limit`} label="No empeora más de" className="w-36" error={gErr?.limit_pct?.message}>
                    <NumberInput
                      id={`guardrail-${i}-limit`}
                      className="[&_input]:min-h-11"
                      suffix="%"
                      value={g.limit_pct}
                      onChange={(v) => setGuardrails(guardrails.map((x, j) => (j === i ? { ...x, limit_pct: v as number } : x)))}
                    />
                  </FormField>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={`Quitar guardrail ${m?.name ?? ""}`.trim()}
                    onClick={() => setGuardrails(guardrails.filter((_, j) => j !== i))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                {m ? (
                  <p className="mt-2 text-xs text-soft">
                    {m.direction === "down" ? "Se rompe si sube" : "Se rompe si baja"} más de {g.limit_pct ? pctText(g.limit_pct) : "el límite"} frente al control.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        {guardrails.length < MAX_GUARDRAILS ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setGuardrails([...guardrails, { metric_id: "", limit_pct: 15, note: null }])}
          >
            <Plus aria-hidden /> Agregar guardrail
          </Button>
        ) : null}
        {!guardrails.length ? <p className="text-sm text-soft">Agregue al menos uno: ¿qué no se puede dañar mientras prueba?</p> : null}
      </section>

      <section className="space-y-4 rounded-2xl border bg-paper p-4 shadow-card sm:p-5">
        <div className="flex items-center gap-2">
          <Calculator aria-hidden className="size-4" />
          <h2 className="text-base font-bold">
            Calculadora de <PilotTerm k="power">potencia</PilotTerm>
          </h2>
        </div>
        {!primary ? (
          <p className="text-sm text-soft">Elija primero la métrica principal: la calculadora cambia según sea una tasa o una suma.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {isRate ? (
                <>
                  <FormField id="power-baseline" label="Línea base (%)" error={powerError("baseline")} description="La tasa de hoy, p. ej. 3,2 % de conversaciones que terminan en venta.">
                    <Controller
                      control={form.control}
                      name="power_inputs.baseline"
                      render={({ field }) => <NumberInput id="power-baseline" className="[&_input]:min-h-11" suffix="%" scale={100} value={field.value} onChange={(v) => field.onChange(v ?? Number.NaN)} />}
                    />
                  </FormField>
                  <FormField
                    id="power-volume"
                    label="Volumen diario por grupo"
                    error={powerError("daily_volume_per_arm")}
                    description="Cuántos casos entran por día a cada grupo (la base de la tasa: conversaciones, visitas…)."
                  >
                    <Controller
                      control={form.control}
                      name="power_inputs.daily_volume_per_arm"
                      render={({ field }) => <NumberInput id="power-volume" className="[&_input]:min-h-11" value={field.value} onChange={field.onChange} />}
                    />
                  </FormField>
                </>
              ) : (
                <>
                  <FormField id="power-baseline" label="Valor diario promedio" error={powerError("baseline")} description={`Cuánto da hoy la métrica en un día (${METRIC_CALC_LABEL[primary.calc].toLowerCase()}).`}>
                    <Controller
                      control={form.control}
                      name="power_inputs.baseline"
                      render={({ field }) => <NumberInput id="power-baseline" className="[&_input]:min-h-11" value={field.value} onChange={(v) => field.onChange(v ?? Number.NaN)} />}
                    />
                  </FormField>
                  <FormField
                    id="power-cv"
                    label="Variación diaria (%)"
                    error={powerError("daily_cv")}
                    description={`Qué tanto sube y baja de un día a otro. Si no la sabe, deje ${pctText(DEFAULT_DAILY_CV * 100)}: es lo típico en medios.`}
                  >
                    <Controller
                      control={form.control}
                      name="power_inputs.daily_cv"
                      render={({ field }) => <NumberInput id="power-cv" className="[&_input]:min-h-11" suffix="%" scale={100} value={field.value} onChange={field.onChange} />}
                    />
                  </FormField>
                </>
              )}
              <FormField id="power-days" label="Días planeados" error={powerError("planned_days")}>
                <Controller
                  control={form.control}
                  name="power_inputs.planned_days"
                  render={({ field }) => (
                    <NumberInput
                      id="power-days"
                      className="[&_input]:min-h-11"
                      value={field.value}
                      onChange={(v) => field.onChange(v == null || Number.isNaN(v) ? Number.NaN : Math.round(v))}
                    />
                  )}
                />
              </FormField>
              <FormField
                id="power-spend"
                label="Inversión diaria (COP)"
                error={powerError("daily_spend_cop")}
                description={budgetCop ? `Presupuesto total: ${formatCop(budgetCop)}.` : "Sin presupuesto en el paso 2 no se calcula para cuántos días alcanza."}
              >
                <Controller
                  control={form.control}
                  name="power_inputs.daily_spend_cop"
                  render={({ field }) => <NumberInput id="power-spend" className="[&_input]:min-h-11" prefix="$" value={field.value} onChange={field.onChange} />}
                />
              </FormField>
              <FormField
                id="power-target"
                label={
                  <>
                    <PilotTerm k="mde">MDE</PilotTerm> objetivo (%)
                  </>
                }
                error={powerError("target_mde_pct")}
                description={expectedPct != null ? `La hipótesis espera ${pctText(Math.abs(expectedPct))}.` : "El efecto que quiere alcanzar a ver."}
              >
                <Controller
                  control={form.control}
                  name="power_inputs.target_mde_pct"
                  render={({ field }) => <NumberInput id="power-target" className="[&_input]:min-h-11" suffix="%" value={field.value} onChange={field.onChange} />}
                />
              </FormField>
            </div>

            <Collapsible>
              <CollapsibleTrigger className="group inline-flex min-h-11 items-center gap-1 text-sm underline underline-offset-4">
                Opciones avanzadas <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 grid gap-4 sm:grid-cols-2">
                <FormField id="power-alpha" label={<PilotTerm k="alpha" />} error={powerError("alpha")}>
                  <Controller
                    control={form.control}
                    name="power_inputs.alpha"
                    render={({ field }) => <NumberInput id="power-alpha" className="[&_input]:min-h-11" suffix="%" scale={100} value={field.value} onChange={(v) => field.onChange(v ?? 0.05)} />}
                  />
                </FormField>
                <FormField id="power-power" label={<PilotTerm k="power" />} error={powerError("power")}>
                  <Controller
                    control={form.control}
                    name="power_inputs.power"
                    render={({ field }) => <NumberInput id="power-power" className="[&_input]:min-h-11" suffix="%" scale={100} value={field.value} onChange={(v) => field.onChange(v ?? 0.8)} />}
                  />
                </FormField>
                {arms > 2 ? (
                  <p className="text-xs text-soft sm:col-span-2">
                    Con {arms} grupos, cada variante se compara contra el control: la calculadora divide α entre {arms - 1} para no ver ganadores de más.
                  </p>
                ) : null}
              </CollapsibleContent>
            </Collapsible>

            {result ? (
              <div aria-live="polite" className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <ResultTile
                    label={
                      <>
                        <PilotTerm k="mde">MDE alcanzable</PilotTerm>
                      </>
                    }
                    value={result.mde_pct == null ? "—" : pctText(result.mde_pct)}
                    hint={result.mde_pct == null ? undefined : `Con ${power.planned_days || "?"} días`}
                  />
                  <ResultTile
                    label="Días necesarios"
                    value={result.days_needed == null ? "—" : String(result.days_needed)}
                    hint={power.target_mde_pct ? `Para ver ${pctText(power.target_mde_pct)}` : undefined}
                  />
                  <ResultTile label="Días que alcanza el presupuesto" value={result.budget_days == null ? "—" : String(result.budget_days)} />
                </div>
                {result.warnings.map((w) => (
                  <Callout key={w} icon={TriangleAlert}>
                    {w}
                  </Callout>
                ))}
                {!result.warnings.length && result.mde_pct != null ? (
                  <Callout icon={ShieldCheck} tone="neutral">
                    ¡Eso! Con estos números la prueba alcanza a ver el efecto que espera.
                  </Callout>
                ) : null}
                <p className="text-xs text-soft">Es una guía para planear. Al guardar, Arriero vuelve a calcularla con lo guardado en el diseño.</p>
              </div>
            ) : null}
          </>
        )}
      </section>

      <WizardFooter prevHref={pilotStepHref(pilotId, "prueba")} pending={pending} onSave={save} />
    </form>
  );
}
