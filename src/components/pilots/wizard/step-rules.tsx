"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { NotebookPen, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyFieldErrors, FormError, FormField } from "@/components/app/form";
import { PilotTerm } from "@/components/pilots/pilot-term";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PILOT_TERMS } from "@/domain/pilots/labels";
import { DEFAULT_DECISION_RULES, type DecisionRules } from "@/domain/pilots/types";
import { rulesSentence } from "@/domain/pilots/wizard";
import { decisionRulesSchema, type DecisionRulesInput } from "@/lib/validation/pilots";
import { savePilotRules } from "@/server/actions/pilots";
import { NumberInput } from "./inputs";
import { WizardFooter, type SaveThen } from "./wizard-footer";
import { pilotStepHref } from "./wizard-links";

type RulesValues = z.output<typeof decisionRulesSchema>;

export function StepRules({ pilotId, initial, saved }: { pilotId: string; initial: DecisionRules; saved: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const form = useForm<DecisionRulesInput, unknown, RulesValues>({ resolver: zodResolver(decisionRulesSchema), defaultValues: initial });
  const { errors } = form.formState;
  const values = useWatch({ control: form.control }) as DecisionRules;
  const valid = [values.scale_min_probability, values.scale_min_lift_pct, values.kill_max_probability].every((n) => n != null && Number.isFinite(n));

  const save = (then: SaveThen) =>
    form.handleSubmit(
      (data) => {
        setError(undefined);
        startTransition(async () => {
          const r = await savePilotRules(pilotId, data);
          if (!r.ok) {
            setError(r.error);
            applyFieldErrors(r.fieldErrors, form.setError);
            return;
          }
          toast.success(r.message ?? "Reglas de decisión registradas.");
          if (then === "next") router.push(pilotStepHref(pilotId, "medicion"));
          else router.refresh();
        });
      },
      () => setError("Revise los campos marcados, sin afán."),
    )();

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
      <p data-explain className="text-sm text-soft">
        {PILOT_TERMS.decisionRules.simple} Quedan registradas con el diseño y no se cambian después de aprobar.
      </p>

      <section className="space-y-4 rounded-2xl border bg-paper p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold">
            <PilotTerm k="decisionRules" />
          </h2>
          <Button type="button" variant="ghost" size="sm" className="min-h-9" onClick={() => form.reset(DEFAULT_DECISION_RULES)}>
            <RotateCcw aria-hidden /> Usar las de la casa
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            id="rules-scale-prob"
            label={<PilotTerm k="probabilityToWin">Probabilidad mínima para escalar</PilotTerm>}
            error={errors.scale_min_probability?.message}
          >
            <Controller
              control={form.control}
              name="scale_min_probability"
              render={({ field }) => (
                <NumberInput id="rules-scale-prob" className="[&_input]:min-h-11" suffix="%" scale={100} value={field.value} onChange={(v) => field.onChange(v ?? Number.NaN)} />
              )}
            />
          </FormField>
          <FormField
            id="rules-lift"
            label={<PilotTerm k="lift">Mejora mínima</PilotTerm>}
            error={errors.scale_min_lift_pct?.message}
            description="0 % = basta con no ser peor."
          >
            <Controller
              control={form.control}
              name="scale_min_lift_pct"
              render={({ field }) => (
                <NumberInput id="rules-lift" className="[&_input]:min-h-11" suffix="%" value={field.value} onChange={(v) => field.onChange(v ?? Number.NaN)} />
              )}
            />
          </FormField>
          <FormField id="rules-kill" label="Probabilidad máxima para apagar" error={errors.kill_max_probability?.message}>
            <Controller
              control={form.control}
              name="kill_max_probability"
              render={({ field }) => (
                <NumberInput id="rules-kill" className="[&_input]:min-h-11" suffix="%" scale={100} value={field.value} onChange={(v) => field.onChange(v ?? Number.NaN)} />
              )}
            />
          </FormField>
        </div>
        <Controller
          control={form.control}
          name="guardrails_block_scale"
          render={({ field }) => (
            <div className="flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2">
              <Switch id="rules-guardrail" checked={field.value} onCheckedChange={field.onChange} />
              <Label htmlFor="rules-guardrail" className="font-normal">
                Un <PilotTerm k="guardrail">guardrail</PilotTerm> roto impide escalar
              </Label>
            </div>
          )}
        />
      </section>

      <figure className="rounded-xl border-l-4 border-l-highlight bg-wash px-4 py-3" aria-live="polite">
        <figcaption className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-soft">
          <NotebookPen aria-hidden className="size-3.5" /> En palabras
        </figcaption>
        <p className="text-[15px]">{valid ? rulesSentence(values) : "Complete los tres valores para leer la regla."}</p>
        {!saved ? <p className="mt-1 text-xs text-soft">Todavía no están registradas: guárdelas para enviar a revisión.</p> : null}
      </figure>

      <WizardFooter prevHref={pilotStepHref(pilotId, "metricas")} pending={pending} onSave={save} />
    </form>
  );
}
