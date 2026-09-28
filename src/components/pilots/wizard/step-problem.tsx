"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Quote, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyFieldErrors, FormError, FormField } from "@/components/app/form";
import { advanceOnEnter, onWizardSubmit } from "@/components/app/step-wizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { hypothesisSentence } from "@/domain/pilots/flow";
import { pilotProblemSchema, type PilotProblemInput } from "@/lib/validation/pilots";
import { linkInsight } from "@/server/actions/insights";
import { createPilot, savePilotLinks, savePilotProblem } from "@/server/actions/pilots";
import type { LinkOptions, PilotMember } from "@/server/queries/pilots";
import { NumberInput } from "./inputs";
import { LinksFields, sameLinks, type PilotLinksValue } from "./links-fields";
import { suggestPilotTitle } from "./sub-flow";
import { PilotStage, useSubSteps, WizardFooter, type SaveThen } from "./wizard-footer";
import { pilotStepHref } from "./wizard-links";

type ProblemValues = z.output<typeof pilotProblemSchema>;

export interface StepProblemProps {
  /** null = piloto nuevo: al guardar se crea. */
  pilotId: string | null;
  initial: PilotProblemInput;
  links: PilotLinksValue;
  linkOptions: LinkOptions;
  members: PilotMember[];
  /** Si el piloto nace de un insight: al crearlo, el insight queda «Sembrado» en él. */
  insightId?: string;
}

export function StepProblem({ pilotId, initial, links: initialLinks, linkOptions, members, insightId }: StepProblemProps) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [links, setLinks] = useState(initialLinks);
  const [savedLinks, setSavedLinks] = useState(initialLinks);
  const { stepper, screen, jumpToError } = useSubSteps("problema");

  const form = useForm<PilotProblemInput, unknown, ProblemValues>({
    resolver: zodResolver(pilotProblemSchema),
    defaultValues: initial,
  });
  const { errors } = form.formState;
  const [change, scope, metric, expectedPct, reason, title] = useWatch({
    control: form.control,
    name: ["hypothesis_change", "hypothesis_scope", "hypothesis_metric", "hypothesis_expected_pct", "hypothesis_reason", "title"],
  });
  const titleSuggestion = suggestPilotTitle(change, scope);
  const sentence = hypothesisSentence({
    change: change ?? null,
    scope: scope ?? null,
    metric: metric ?? null,
    expectedPct: expectedPct == null || Number.isNaN(expectedPct) ? null : expectedPct,
    reason: reason ?? null,
  });
  const hypothesisComplete = !sentence.includes("[");

  const save = (then: SaveThen) =>
    form.handleSubmit(
      (values) => {
        setError(undefined);
        startTransition(async () => {
          let id = pilotId;
          if (id) {
            const r = await savePilotProblem(id, values);
            if (!r.ok) {
              setError(r.error);
              applyFieldErrors(r.fieldErrors, form.setError);
              jumpToError(Object.keys(r.fieldErrors ?? {}));
              return;
            }
          } else {
            const r = await createPilot(values);
            if (!r.ok) {
              setError(r.error);
              applyFieldErrors(r.fieldErrors, form.setError);
              jumpToError(Object.keys(r.fieldErrors ?? {}));
              return;
            }
            id = r.data.id;
            if (insightId) {
              const linked = await linkInsight(insightId, { pilotId: id });
              if (!linked.ok) toast.error("El piloto quedó creado, pero no se pudo marcar el insight", { description: linked.error });
            }
          }
          if (!sameLinks(links, savedLinks)) {
            const r = await savePilotLinks(id, links);
            if (!r.ok) {
              toast.error("El piloto quedó guardado, pero los vínculos no", { description: r.error });
            } else setSavedLinks(links);
          }
          toast.success(pilotId ? "Problema e hipótesis guardados." : "Piloto creado en borrador. Hágale pues con el diseño.");
          if (then === "next" || !pilotId) router.push(pilotStepHref(id, then === "next" ? "prueba" : "problema"));
          else router.refresh();
        });
      },
      (errs) => {
        setError("Revise los campos marcados, sin afán.");
        jumpToError(Object.keys(errs));
      },
    )();

  /** "Siga": valida solo la pantalla actual; en la última, guarda el paso. */
  const advance = async () => {
    if (stepper.isLast) return save("next");
    if (screen.fields.length && !(await form.trigger(screen.fields as (keyof PilotProblemInput)[]))) return;
    setError(undefined);
    stepper.next();
  };

  const sentenceBox = (
    <figure className="rounded-xl border-l-4 border-l-highlight bg-wash px-4 py-3" aria-live="polite">
      <figcaption className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-soft">
        <Quote aria-hidden className="size-3.5" /> Así va la hipótesis
      </figcaption>
      <p className="text-[15px]">{sentence}</p>
      {!hypothesisComplete ? <p className="mt-1 text-xs text-soft">Llene los [corchetes]: la hipótesis completa se pide para enviar a revisión.</p> : null}
    </figure>
  );

  return (
    <form noValidate onSubmit={onWizardSubmit(advance)} onKeyDown={advanceOnEnter}>
      <PilotStage
        step="problema"
        stepper={stepper}
        header={error ? <FormError message={error} /> : null}
        footer={
          <WizardFooter
            stepper={stepper}
            prevHref={null}
            pending={pending}
            onSave={save}
            showDraft={!!pilotId}
            nextLabel={pilotId ? "Guardar y seguir" : "Crear y seguir"}
          />
        }
      >
        {screen.key === "problema" ? (
          <>
            <FormField id="pilot-problem" label="Problema" required error={errors.problem?.message} description="Qué está pasando en medios y a quién le duele.">
              <Textarea
                id="pilot-problem"
                rows={4}
                data-autofocus
                placeholder="Ej. El costo por venta en CTWA Pospago subió 35 % en dos meses."
                aria-invalid={!!errors.problem}
                {...form.register("problem")}
              />
            </FormField>
            <FormField id="pilot-evidence" label="Evidencia" error={errors.problem_evidence?.message} description="El dato o el informe que lo muestra.">
              <Textarea
                id="pilot-evidence"
                rows={3}
                placeholder="Ej. Informe de Meta ago–sep: CPA de $ 38.000 a $ 51.000; la tasa de venta cayó de 4,1 % a 3,2 %."
                {...form.register("problem_evidence")}
              />
            </FormField>
          </>
        ) : null}

        {screen.key === "cambio" ? (
          <>
            <FormField id="h-change" label="Si hacemos" error={errors.hypothesis_change?.message} description="El cambio, en pocas palabras.">
              <Input id="h-change" className="min-h-11" data-autofocus placeholder="videos UGC en lugar de estáticos" {...form.register("hypothesis_change")} />
            </FormField>
            <FormField id="h-scope" label="En" error={errors.hypothesis_scope?.message} description="El medio, la campaña o la línea donde corre.">
              <Input id="h-scope" className="min-h-11" placeholder="CTWA Pospago" {...form.register("hypothesis_scope")} />
            </FormField>
            {sentenceBox}
          </>
        ) : null}

        {screen.key === "efecto" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <FormField id="h-metric" label="Esperamos mover" error={errors.hypothesis_metric?.message}>
                <Input id="h-metric" className="min-h-11" data-autofocus placeholder="la tasa de venta" {...form.register("hypothesis_metric")} />
              </FormField>
              <FormField id="h-pct" label="En (%)" error={errors.hypothesis_expected_pct?.message} description="Negativo si esperamos que baje.">
                <Controller
                  control={form.control}
                  name="hypothesis_expected_pct"
                  render={({ field }) => (
                    <NumberInput
                      id="h-pct"
                      className="[&_input]:min-h-11"
                      suffix="%"
                      placeholder="10"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      aria-invalid={!!errors.hypothesis_expected_pct}
                    />
                  )}
                />
              </FormField>
            </div>
            <FormField id="h-reason" label="Porque" error={errors.hypothesis_reason?.message}>
              <Textarea id="h-reason" rows={2} placeholder="la gente confía más en alguien como uno que en una pieza de marca" {...form.register("hypothesis_reason")} />
            </FormField>
            {sentenceBox}
          </>
        ) : null}

        {screen.key === "nombre" ? (
          <>
            <FormField id="pilot-title" label="Nombre del piloto" required error={errors.title?.message} description="Mínimo 5 caracteres.">
              <Input
                id="pilot-title"
                className="min-h-11 text-base"
                data-autofocus
                placeholder={titleSuggestion || "Ej. Video UGC en CTWA Pospago"}
                aria-invalid={!!errors.title}
                {...form.register("title")}
              />
            </FormField>
            {titleSuggestion && titleSuggestion !== (title ?? "").trim() ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9"
                onClick={() => form.setValue("title", titleSuggestion, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })}
              >
                <Sparkles aria-hidden /> Usar la sugerencia
              </Button>
            ) : null}
          </>
        ) : null}

        {screen.key === "vinculos" ? (
          <>
            <p data-explain className="text-sm text-soft">
              Si el piloto nace de un ejercicio o ataca una métrica del árbol de un programa, vincúlelo: así la ficha del ejercicio muestra sus pilotos y
              nadie mide lo mismo dos veces. Si no, siga derecho.
            </p>
            <LinksFields idPrefix="wizard-links" value={links} onChange={setLinks} options={linkOptions} members={members} />
          </>
        ) : null}
      </PilotStage>
    </form>
  );
}
