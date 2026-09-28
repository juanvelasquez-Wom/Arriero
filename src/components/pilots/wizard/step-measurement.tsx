"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, CircleCheck, Plus, Save, Send, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { applyFieldErrors, FormError, FormField } from "@/components/app/form";
import { Callout } from "@/components/app/page";
import { advanceOnEnter, onWizardSubmit, WizardFooter as StepFooter } from "@/components/app/step-wizard";
import { PilotTerm } from "@/components/pilots/pilot-term";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { suggestChecklist } from "@/domain/pilots/checklist-suggestions";
import { PILOT_STEPS, type MissingItem } from "@/domain/pilots/flow";
import { CHECKLIST_PLATFORM_LABEL } from "@/domain/pilots/labels";
import { CHECKLIST_PLATFORMS, type ChecklistPlatform } from "@/domain/pilots/types";
import { cn } from "@/lib/utils";
import { checklistSchema } from "@/lib/validation/pilots";
import { saveChecklist, submitPilot } from "@/server/actions/pilots";
import type { ReviewRow } from "./review-summary";
import { PilotStage, useSubSteps } from "./wizard-footer";
import { pilotStepHref } from "./wizard-links";

const formSchema = z.object({ items: checklistSchema });
type ChecklistForm = z.input<typeof formSchema>;
type ChecklistValues = z.output<typeof formSchema>;

export interface StepMeasurementProps {
  pilotId: string;
  initial: ChecklistForm["items"];
  /** Medios del piloto, para sugerir eventos. */
  media: { name: string; provider: string | null }[];
  /** Qué falta para enviar (desde lo guardado), con el paso donde se arregla. */
  missing: MissingItem[];
  /** Lo que dice la base (public.pilot_missing), por si difiere. */
  serverMissing: string[];
  /** "Así queda el piloto", con lo guardado. */
  summary?: ReviewRow[];
}

const stepTitle = (key: string) => PILOT_STEPS.find((s) => s.key === key)?.title.toLowerCase();

export function StepMeasurement({ pilotId, initial, media, missing, serverMissing, summary = [] }: StepMeasurementProps) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const { stepper, screen, jumpToError } = useSubSteps("medicion");
  const form = useForm<ChecklistForm, unknown, ChecklistValues>({ resolver: zodResolver(formSchema), defaultValues: { items: initial } });
  const { errors, isDirty } = form.formState;
  const items = useWatch({ control: form.control, name: "items" }) ?? [];
  const setItems = (next: ChecklistForm["items"]) => form.setValue("items", next, { shouldDirty: true });
  const pendingItems = missing.length ? missing : serverMissing.map((text) => ({ text, step: "problema" as const, unknownStep: true }));
  const ready = missing.length === 0 && serverMissing.length === 0;

  const suggest = () => {
    const s = suggestChecklist(media, items);
    if (!s.length) {
      toast("No hay más sugerencias", { description: "La lista ya tiene los eventos típicos de estos medios." });
      return;
    }
    setItems([...items, ...s.map((x) => ({ platform: x.platform, event_name: x.event_name, description: x.description }))]);
    toast.success(`¡Eso! ${s.length} ${s.length === 1 ? "evento sugerido" : "eventos sugeridos"}`, { description: "Quite los que no apliquen a este piloto." });
  };

  /** Guarda la lista; devuelve false si no se pudo. */
  const persist = (values: ChecklistValues) =>
    new Promise<boolean>((resolve) => {
      startTransition(async () => {
        const r = await saveChecklist(pilotId, values.items);
        if (!r.ok) {
          setError(r.error);
          applyFieldErrors(
            r.fieldErrors && Object.fromEntries(Object.entries(r.fieldErrors).map(([k, v]) => [`items.${k}`, v])),
            form.setError,
          );
          jumpToError(["items"]);
          resolve(false);
          return;
        }
        form.reset(values);
        resolve(true);
      });
    });

  const invalid = () => {
    setError("Revise los campos marcados, sin afán.");
    jumpToError(["items"]);
  };

  const saveOnly = () =>
    form.handleSubmit(async (values) => {
      setError(undefined);
      if (await persist(values)) {
        toast.success("Lista de chequeo guardada.");
        router.refresh();
      }
    }, invalid)();

  /** De los eventos a la revisión: guarda la lista (si cambió) para que "qué falta" quede al día. */
  const toReview = () =>
    form.handleSubmit(async (values) => {
      setError(undefined);
      if (isDirty) {
        if (!(await persist(values))) return;
        toast.success("Lista de chequeo guardada.");
        router.refresh();
      }
      stepper.next();
    }, invalid)();

  const send = () =>
    form.handleSubmit(async (values) => {
      setError(undefined);
      if (isDirty && !(await persist(values))) return;
      startSubmit(async () => {
        const r = await submitPilot(pilotId);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        toast.success(r.message ?? "Enviado a revisión.");
        router.push(`/pilotos/${pilotId}`);
      });
    }, invalid)();

  const busy = pending || submitting;

  return (
    <form noValidate onSubmit={onWizardSubmit(() => {
        if (!stepper.isLast) toReview();
        else if (ready) send();
      })} onKeyDown={advanceOnEnter}>
      <PilotStage
        step="medicion"
        stepper={stepper}
        header={error ? <FormError message={error} /> : null}
        footer={
          <StepFooter
            onBack={stepper.isFirst ? undefined : stepper.back}
            backHref={stepper.isFirst ? pilotStepHref(pilotId, "reglas") : null}
            backLabel={stepper.isFirst ? "Paso anterior" : "Atrás"}
            pending={busy}
            disabled={stepper.isLast && !ready}
            hint={!stepper.isLast || ready}
            nextLabel={stepper.isLast ? "Enviar a revisión" : "Siga"}
            nextIcon={stepper.isLast ? submitting ? null : <Send aria-hidden /> : undefined}
            extra={
              <Button type="button" variant="outline" size="lg" className="min-h-11 w-full sm:w-auto" disabled={busy} onClick={saveOnly}>
                {pending && !submitting ? <Spinner /> : <Save aria-hidden />} Guardar borrador
              </Button>
            }
          />
        }
      >
        {screen.key === "eventos" ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                <PilotTerm k="checklist" />
              </p>
              <Button type="button" variant="outline" className="min-h-11" onClick={suggest} data-autofocus={items.length ? undefined : true}>
                <Sparkles aria-hidden /> Sugerir eventos
              </Button>
            </div>

            {!items.length ? (
              <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-soft">
                ¿Y por dónde es? Todavía no hay eventos. Use «Sugerir eventos» o agregue uno.
              </p>
            ) : (
              <ul className="stagger space-y-3">
                {items.map((item, i) => {
                  const e = errors.items?.[i];
                  return (
                    <li key={item.id || `new-${i}`} className="rounded-xl border p-3">
                      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
                        <FormField id={`check-${i}-platform`} label="Plataforma" error={e?.platform?.message}>
                          <Select
                            value={item.platform}
                            onValueChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, platform: v as ChecklistPlatform } : x)))}
                          >
                            <SelectTrigger id={`check-${i}-platform`} className="min-h-11 w-full" data-autofocus={i === 0 ? true : undefined}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CHECKLIST_PLATFORMS.map((p) => (
                                <SelectItem key={p} value={p}>
                                  {CHECKLIST_PLATFORM_LABEL[p]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormField>
                        <FormField id={`check-${i}-event`} label="Evento" error={e?.event_name?.message}>
                          <Input
                            id={`check-${i}-event`}
                            className="min-h-11"
                            placeholder="Ej. Lead"
                            value={item.event_name}
                            onChange={(ev) => setItems(items.map((x, j) => (j === i ? { ...x, event_name: ev.target.value } : x)))}
                            aria-invalid={!!e?.event_name}
                          />
                        </FormField>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-11"
                          aria-label={`Quitar ${item.event_name || "evento"}`}
                          onClick={() => setItems(items.filter((_, j) => j !== i))}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                      <FormField id={`check-${i}-description`} label="Descripción" className="mt-3" error={e?.description?.message}>
                        <Input
                          id={`check-${i}-description`}
                          className="min-h-11"
                          placeholder="Dónde y cuándo tiene que disparar"
                          value={item.description ?? ""}
                          onChange={(ev) => setItems(items.map((x, j) => (j === i ? { ...x, description: ev.target.value } : x)))}
                        />
                      </FormField>
                    </li>
                  );
                })}
              </ul>
            )}
            <Button
              type="button"
              variant="outline"
              className="min-h-11 self-start"
              disabled={items.length >= 30}
              onClick={() => setItems([...items, { platform: "ga4", event_name: "", description: "" }])}
            >
              <Plus aria-hidden /> Agregar evento
            </Button>
          </>
        ) : null}

        {screen.key === "revision" ? (
          <>
            {summary.length ? (
              <dl className="stagger divide-y rounded-2xl border bg-paper">
                {summary.map((row) => (
                  <div key={row.label} className="flex items-start gap-3 px-4 py-3">
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                        row.filled ? "border-ink bg-ink text-paper" : "border-dashed",
                      )}
                    >
                      {row.filled ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-soft">{row.label}</dt>
                      <dd className={cn("mt-0.5 text-sm", !row.filled && "text-soft")}>{row.value}</dd>
                    </div>
                    {row.step !== "medicion" ? (
                      <Link href={pilotStepHref(pilotId, row.step)} className="inline-flex min-h-9 shrink-0 items-center text-sm underline underline-offset-4">
                        Cambiar<span className="sr-only"> {row.label.toLowerCase()}</span>
                      </Link>
                    ) : (
                      <button type="button" className="inline-flex min-h-9 shrink-0 items-center text-sm underline underline-offset-4" onClick={() => stepper.goTo("eventos")}>
                        Cambiar<span className="sr-only"> {row.label.toLowerCase()}</span>
                      </button>
                    )}
                  </div>
                ))}
              </dl>
            ) : null}

            <div aria-live="polite">
              {ready ? (
                <Callout icon={CircleCheck} tone="neutral" title="¡Eso! No falta nada">
                  El aprobador revisa el diseño y lo aprueba o se lo devuelve con comentarios. Al aprobar, el diseño queda bloqueado.
                </Callout>
              ) : (
                <>
                  <p className="mb-2 text-sm font-medium">Para enviar a revisión falta:</p>
                  <ul className="space-y-1.5">
                    {pendingItems.map((m) => (
                      <li key={m.text} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                        <span>{m.text.charAt(0).toUpperCase() + m.text.slice(1)}</span>
                        {"unknownStep" in m ? null : m.step === "medicion" ? (
                          <button type="button" className="inline-flex min-h-9 items-center text-sm font-medium underline underline-offset-4" onClick={() => stepper.goTo("eventos")}>
                            Ir a los eventos
                          </button>
                        ) : (
                          <Link href={pilotStepHref(pilotId, m.step)} className="inline-flex min-h-9 items-center text-sm font-medium underline underline-offset-4">
                            Ir a {stepTitle(m.step)}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </>
        ) : null}
      </PilotStage>
    </form>
  );
}
