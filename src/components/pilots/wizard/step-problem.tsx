"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Link2, Quote } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyFieldErrors, FormError, FormField } from "@/components/app/form";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { hypothesisSentence } from "@/domain/pilots/flow";
import { pilotProblemSchema, type PilotProblemInput } from "@/lib/validation/pilots";
import { createPilot, savePilotLinks, savePilotProblem } from "@/server/actions/pilots";
import type { LinkOptions, PilotMember } from "@/server/queries/pilots";
import { NumberInput } from "./inputs";
import { LinksFields, sameLinks, type PilotLinksValue } from "./links-fields";
import { WizardFooter, type SaveThen } from "./wizard-footer";
import { pilotStepHref } from "./wizard-links";

type ProblemValues = z.output<typeof pilotProblemSchema>;

export interface StepProblemProps {
  /** null = piloto nuevo: al guardar se crea. */
  pilotId: string | null;
  initial: PilotProblemInput;
  links: PilotLinksValue;
  linkOptions: LinkOptions;
  members: PilotMember[];
}

export function StepProblem({ pilotId, initial, links: initialLinks, linkOptions, members }: StepProblemProps) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [links, setLinks] = useState(initialLinks);
  const [savedLinks, setSavedLinks] = useState(initialLinks);
  const hasLinks = !!(initialLinks.program_id || initialLinks.experiment_id || initialLinks.tree_metric_id);

  const form = useForm<PilotProblemInput, unknown, ProblemValues>({
    resolver: zodResolver(pilotProblemSchema),
    defaultValues: initial,
  });
  const { errors } = form.formState;
  const [change, scope, metric, expectedPct, reason] = useWatch({
    control: form.control,
    name: ["hypothesis_change", "hypothesis_scope", "hypothesis_metric", "hypothesis_expected_pct", "hypothesis_reason"],
  });
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
              return;
            }
          } else {
            const r = await createPilot(values);
            if (!r.ok) {
              setError(r.error);
              applyFieldErrors(r.fieldErrors, form.setError);
              return;
            }
            id = r.data.id;
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

      <section className="space-y-4 rounded-2xl border bg-paper p-4 shadow-card sm:p-5">
        <FormField id="pilot-title" label="Nombre del piloto" required error={errors.title?.message} description="Corto y claro: así aparece en el portafolio.">
          <Input id="pilot-title" className="min-h-11" placeholder="Ej. Video UGC en CTWA Pospago" aria-invalid={!!errors.title} {...form.register("title")} />
        </FormField>
        <FormField id="pilot-problem" label="Problema" required error={errors.problem?.message} description="Qué está pasando en medios y a quién le duele.">
          <Textarea
            id="pilot-problem"
            rows={3}
            placeholder="Ej. El costo por venta en CTWA Pospago subió 35 % en dos meses."
            aria-invalid={!!errors.problem}
            {...form.register("problem")}
          />
        </FormField>
        <FormField id="pilot-evidence" label="Evidencia" error={errors.problem_evidence?.message} description="El dato o el informe que lo muestra.">
          <Textarea
            id="pilot-evidence"
            rows={2}
            placeholder="Ej. Informe de Meta ago–sep: CPA de $ 38.000 a $ 51.000; la tasa de venta cayó de 4,1 % a 3,2 %."
            {...form.register("problem_evidence")}
          />
        </FormField>
      </section>

      <section className="space-y-4 rounded-2xl border bg-paper p-4 shadow-card sm:p-5">
        <div>
          <h2 className="text-base font-bold">Hipótesis</h2>
          <p className="text-xs text-soft">Si hacemos… en…, esperamos mover… en… % porque…</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="h-change" label="Si hacemos" error={errors.hypothesis_change?.message}>
            <Input id="h-change" className="min-h-11" placeholder="videos UGC en lugar de estáticos" {...form.register("hypothesis_change")} />
          </FormField>
          <FormField id="h-scope" label="En" error={errors.hypothesis_scope?.message}>
            <Input id="h-scope" className="min-h-11" placeholder="CTWA Pospago" {...form.register("hypothesis_scope")} />
          </FormField>
          <FormField id="h-metric" label="Esperamos mover" error={errors.hypothesis_metric?.message}>
            <Input id="h-metric" className="min-h-11" placeholder="la tasa de venta" {...form.register("hypothesis_metric")} />
          </FormField>
          <FormField id="h-pct" label="En (%)" error={errors.hypothesis_expected_pct?.message} description="Negativo si esperamos que baje (p. ej. un costo).">
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

        <figure className="rounded-xl border-l-4 border-l-highlight bg-wash px-4 py-3" aria-live="polite">
          <figcaption className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-soft">
            <Quote aria-hidden className="size-3.5" /> Así queda la hipótesis
          </figcaption>
          <p className="text-[15px]">{sentence}</p>
          {!hypothesisComplete ? <p className="mt-1 text-xs text-soft">Llene los [corchetes]: la hipótesis completa se pide para enviar a revisión.</p> : null}
        </figure>
      </section>

      <Collapsible defaultOpen={hasLinks} className="rounded-2xl border bg-paper shadow-card">
        <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium sm:px-5">
          <span className="inline-flex items-center gap-2">
            <Link2 aria-hidden className="size-4" /> ¿Viene de un ejercicio de Arriero? · Responsable
          </span>
          <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t px-4 py-4 sm:px-5">
          <p data-explain className="mb-4 text-sm text-soft">
            Opcional. Si el piloto nace de un ejercicio o ataca una métrica del árbol de un programa, vincúlelo: así la ficha del ejercicio muestra sus pilotos y nadie mide lo mismo dos veces.
          </p>
          <LinksFields idPrefix="wizard-links" value={links} onChange={setLinks} options={linkOptions} members={members} />
        </CollapsibleContent>
      </Collapsible>

      <WizardFooter prevHref={null} pending={pending} onSave={save} showDraft={!!pilotId} nextLabel={pilotId ? "Guardar y seguir" : "Crear y seguir"} />
    </form>
  );
}
