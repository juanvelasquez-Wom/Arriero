"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyFieldErrors, FormError, FormField, SubmitButton } from "@/components/app/form";
import { Callout } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { METRIC_CALC_LABEL, METRIC_SCOPE_LABEL, PILOT_UNIT_LABEL, PLATFORM_METRIC_WARNING } from "@/domain/pilots/labels";
import { PILOT_METRIC_CALCS, PILOT_METRIC_SCOPES, PILOT_UNITS } from "@/domain/pilots/types";
import { METRIC_DIRECTIONS } from "@/domain/types";
import { pilotMetricDefSchema, type PilotMetricDefInput } from "@/lib/validation/pilots";
import { createPilotMetric, updatePilotMetric } from "@/server/actions/pilots";
import type { CatalogMetric, MediaChannel } from "@/server/queries/pilots";
import { NONE } from "./catalog-bits";

export const DIRECTION_TEXT = { up: "Más es mejor", down: "Menos es mejor" } as const;

const CALC_HELP = {
  sum: "Se carga tal cual por periodo y grupo (ej. conversaciones, ventas, inversión).",
  rate: "Se calcula: numerador ÷ base (ej. ventas ÷ conversaciones iniciadas).",
  cost_per: "Se calcula: inversión ÷ resultados (ej. inversión ÷ conversaciones).",
} as const;

/**
 * Métrica del catálogo. Un creador agrega métricas propias de un medio (el
 * medio es obligatorio); un aprobador agrega métricas generales y edita.
 */
export function MetricDefFormDialog({
  metric,
  metrics,
  media,
  isApprover,
  trigger,
}: {
  metric?: CatalogMetric;
  metrics: CatalogMetric[];
  media: MediaChannel[];
  isApprover: boolean;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const idp = `pmetric-${metric?.id ?? "new"}`;
  const bases = metrics.filter((m) => m.calc === "sum" && !m.archived_at && m.id !== metric?.id);
  const activeMedia = media.filter((m) => !m.archived_at || m.id === metric?.media_id);

  const defaults = (): PilotMetricDefInput => ({
    name: metric?.name ?? "",
    description: metric?.description ?? "",
    unit: metric?.unit ?? "count",
    direction: metric?.direction ?? "up",
    scope: metric?.scope ?? "business",
    calc: metric?.calc ?? "sum",
    numerator_id: metric?.numerator_id ?? "",
    denominator_id: metric?.denominator_id ?? "",
    is_spend: metric?.is_spend ?? false,
    media_id: metric?.media_id ?? "",
  });
  const form = useForm<PilotMetricDefInput, unknown, z.output<typeof pilotMetricDefSchema>>({
    resolver: zodResolver(pilotMetricDefSchema),
    defaultValues: defaults(),
  });
  const { errors } = form.formState;
  const calc = useWatch({ control: form.control, name: "calc" });
  const scope = useWatch({ control: form.control, name: "scope" });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(undefined);
      form.reset(defaults());
    }
  }

  const onSubmit = form.handleSubmit((values) => {
    if (!isApprover && !values.media_id) {
      form.setError("media_id", { type: "manual", message: "Elija el medio: las métricas generales las agrega un aprobador." });
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const r = metric ? await updatePilotMetric(metric.id, values) : await createPilotMetric(values);
      if (!r.ok) {
        setError(r.error);
        applyFieldErrors(r.fieldErrors, form.setError);
        return;
      }
      toast.success(r.message ?? "¡Eso! Guardado");
      setOpen(false);
      router.refresh();
    });
  });

  const selectField = (
    name: "unit" | "direction" | "scope" | "calc",
    options: readonly string[],
    label: (v: string) => string,
  ) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger id={`${idp}-${name}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {label(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );

  const baseSelect = (name: "numerator_id" | "denominator_id", placeholder: string) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <Select value={field.value || undefined} onValueChange={field.onChange}>
          <SelectTrigger id={`${idp}-${name}`} className="w-full" aria-invalid={!!errors[name]}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {bases.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{metric ? `Editar «${metric.name}»` : isApprover ? "Agregar métrica" : "Agregar métrica de un medio"}</DialogTitle>
          <DialogDescription>
            {isApprover
              ? "Las métricas generales sirven para todos los pilotos; las de un medio, solo para ese medio."
              : "Las métricas que agrega un creador son propias de un medio. El catálogo general lo edita un aprobador."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup className="gap-4">
            <FormError message={error} />
            <FormField id={`${idp}-name`} label="Nombre" required error={errors.name?.message}>
              <Input id={`${idp}-name`} autoFocus placeholder="Ej. Conversaciones iniciadas" aria-invalid={!!errors.name} {...form.register("name")} />
            </FormField>
            <FormField id={`${idp}-description`} label="Definición" error={errors.description?.message}>
              <Textarea id={`${idp}-description`} rows={2} placeholder="Qué cuenta y de dónde sale." {...form.register("description")} />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id={`${idp}-calc`} label="Cómo se calcula" required description={calc ? CALC_HELP[calc] : undefined}>
                {selectField("calc", PILOT_METRIC_CALCS, (v) => METRIC_CALC_LABEL[v as keyof typeof METRIC_CALC_LABEL])}
              </FormField>
              <FormField id={`${idp}-unit`} label="Unidad" required>
                {selectField("unit", PILOT_UNITS, (v) => PILOT_UNIT_LABEL[v as keyof typeof PILOT_UNIT_LABEL])}
              </FormField>
            </div>

            {calc && calc !== "sum" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  id={`${idp}-numerator_id`}
                  label={calc === "rate" ? "Numerador" : "Inversión"}
                  required
                  error={errors.numerator_id?.message}
                >
                  {baseSelect("numerator_id", calc === "rate" ? "Ej. Ventas" : "Ej. Inversión")}
                </FormField>
                <FormField
                  id={`${idp}-denominator_id`}
                  label={calc === "rate" ? "Base" : "Resultados"}
                  required
                  error={errors.denominator_id?.message}
                >
                  {baseSelect("denominator_id", calc === "rate" ? "Ej. Conversaciones iniciadas" : "Ej. Conversaciones")}
                </FormField>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id={`${idp}-direction`} label="Dirección" required>
                {selectField("direction", METRIC_DIRECTIONS, (v) => DIRECTION_TEXT[v as keyof typeof DIRECTION_TEXT])}
              </FormField>
              <FormField id={`${idp}-scope`} label="Alcance" required>
                {selectField("scope", PILOT_METRIC_SCOPES, (v) => METRIC_SCOPE_LABEL[v as keyof typeof METRIC_SCOPE_LABEL])}
              </FormField>
            </div>
            {scope === "platform" ? (
              <Callout icon={TriangleAlert} tone="neutral">
                {PLATFORM_METRIC_WARNING}
              </Callout>
            ) : null}

            <FormField
              id={`${idp}-media_id`}
              label="Medio"
              required={!isApprover}
              description={isApprover ? "Déjelo en «General» si sirve para todos los medios." : "La métrica queda disponible solo para este medio."}
              error={errors.media_id?.message}
            >
              <Controller
                control={form.control}
                name="media_id"
                render={({ field }) => (
                  <Select value={field.value || (isApprover ? NONE : undefined)} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
                    <SelectTrigger id={`${idp}-media_id`} className="w-full" aria-invalid={!!errors.media_id}>
                      <SelectValue placeholder="Elija el medio" />
                    </SelectTrigger>
                    <SelectContent>
                      {isApprover ? <SelectItem value={NONE}>General (todos los medios)</SelectItem> : null}
                      {activeMedia.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>

            {calc === "sum" ? (
              <Controller
                control={form.control}
                name="is_spend"
                render={({ field }) => (
                  <label htmlFor={`${idp}-is_spend`} className="flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm">
                    <Switch id={`${idp}-is_spend`} checked={!!field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                    <span>
                      <span className="font-medium">Es la inversión</span>
                      <span className="block text-xs text-soft">Con esta métrica se calcula la inversión ejecutada y el costo por resultado.</span>
                    </span>
                  </label>
                )}
              />
            ) : null}
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton pending={pending}>{metric ? "Guardar" : "Agregar métrica"}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
