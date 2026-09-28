"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyFieldErrors, FormError, FormField, SubmitButton } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Term } from "@/components/app/info-tip";
import { METRIC_BRANCH_LABEL, METRIC_SCOPE_LABEL, METRIC_TYPE_LABEL, PLATFORM_SCOPE_WARNING } from "@/domain/labels";
import { METRIC_SCOPES, type MetricScope } from "@/domain/metric-formula";
import { toInputValue } from "@/domain/metric-tree";
import { METRIC_BRANCHES, type MetricBranch, type MetricDirection, type MetricType } from "@/domain/types";
import { metricSchema, type MetricInput, type MetricValues } from "@/lib/validation/structure";
import { createMetric, updateMetric } from "@/server/actions/metrics";

export interface MetricFormMetric {
  id: string;
  type: MetricType;
  branch: MetricBranch | null;
  parent_id: string | null;
  name: string;
  definition: string | null;
  channel: string | null;
  unit: string | null;
  direction: MetricDirection;
  source: string | null;
  baseline: number | null;
  unit_value?: number | null;
  owner_id: string | null;
  scope?: MetricScope | null;
  numerator_id?: string | null;
  denominator_id?: string | null;
}

export interface Option {
  id: string;
  label: string;
}

const UNIT_SUGGESTIONS = ["%", "COP", "altas", "clientes", "ventas", "unidades", "conversaciones", "sesiones"];

const TYPE_HELP: Record<MetricType, string> = {
  north_star: "Representa el valor que la línea quiere crecer. Es la raíz del árbol y hay una sola por línea.",
  efficiency: "Acompaña a la métrica norte y vigila el costo de crecer (p. ej. costo por alta).",
  input: "Descompone la métrica norte. Los ejercicios atacan estas métricas.",
};

/**
 * Crear o editar una métrica de la línea. El tipo lo fija el contexto (norte,
 * eficiencia o entrada del árbol); la rama y el padre solo aplican a entradas.
 */
export function MetricFormDialog({
  programId,
  lineId,
  metric,
  type,
  defaultParentId = null,
  defaultBranch = null,
  parentOptions,
  members,
  formulaOptions,
  trigger,
  title,
}: {
  programId: string;
  lineId: string;
  metric?: MetricFormMetric;
  type: MetricType;
  defaultParentId?: string | null;
  defaultBranch?: MetricBranch | null;
  parentOptions: Option[];
  members: Option[];
  /**
   * Métricas de la misma línea para "Se calcula como" (numerador ÷ denominador).
   * Si viene, el formulario muestra también el alcance y la fórmula.
   */
  formulaOptions?: Option[];
  trigger: ReactNode;
  title?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const metricType = metric?.type ?? type;
  const isInput = metricType === "input";
  const idp = `metric-${metric?.id ?? `new-${defaultParentId ?? type}`}`;
  const showDefinition = !!formulaOptions;
  const ratioOptions = (formulaOptions ?? []).filter((o) => o.id !== metric?.id);

  const defaults = (): MetricInput => ({
    line_id: lineId,
    type: metricType,
    branch: metric?.branch ?? defaultBranch ?? (isInput ? "" : null),
    parent_id: metric ? (metric.parent_id ?? "none") : (defaultParentId ?? "none"),
    name: metric?.name ?? "",
    definition: metric?.definition ?? "",
    channel: metric?.channel ?? "",
    unit: metric?.unit ?? "",
    direction: metric?.direction ?? "up",
    source: metric?.source ?? "",
    baseline: toInputValue(metric?.baseline),
    unit_value: toInputValue(metric?.unit_value),
    owner_id: metric?.owner_id ?? "none",
    ...(showDefinition
      ? {
          scope: metric?.scope ?? "none",
          numerator_id: metric?.numerator_id ?? "none",
          denominator_id: metric?.denominator_id ?? "none",
        }
      : {}),
  });

  const form = useForm<MetricInput, unknown, MetricValues>({
    resolver: zodResolver(metricSchema),
    defaultValues: defaults(),
  });
  const { errors } = form.formState;
  const scope = useWatch({ control: form.control, name: "scope" });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(undefined);
      form.reset(defaults());
    }
  }

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    startTransition(async () => {
      const input: MetricInput = { ...values, line_id: lineId, type: metricType };
      const result = metric ? await updateMetric(programId, metric.id, input) : await createMetric(programId, input);
      if (!result.ok) {
        setError(result.error);
        applyFieldErrors(result.fieldErrors, form.setError);
        return;
      }
      toast.success(result.message ?? "¡Eso! Guardado");
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {title ?? (metric ? `Editar “${metric.name}”` : `Nueva métrica · ${METRIC_TYPE_LABEL[metricType]}`)}
          </DialogTitle>
          <DialogDescription>{TYPE_HELP[metricType]}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate>
          <FieldGroup className="gap-4">
            <FormError message={error} />
            <FormField id={`${idp}-name`} label="Nombre" required error={errors.name?.message}>
              <Input
                id={`${idp}-name`}
                autoFocus
                placeholder={isInput ? "Ej. Tasa de conversión del checkout" : "Ej. Altas digitales semanales"}
                aria-invalid={!!errors.name}
                {...form.register("name")}
              />
            </FormField>

            {isInput ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id={`${idp}-branch`} label="Rama" required error={errors.branch?.message}>
                  <Controller
                    control={form.control}
                    name="branch"
                    render={({ field }) => (
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <SelectTrigger id={`${idp}-branch`} className="w-full" aria-invalid={!!errors.branch}>
                          <SelectValue placeholder="Elija la rama" />
                        </SelectTrigger>
                        <SelectContent>
                          {METRIC_BRANCHES.map((b) => (
                            <SelectItem key={b} value={b}>
                              {METRIC_BRANCH_LABEL[b]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
                <FormField
                  id={`${idp}-parent`}
                  label="Métrica padre"
                  description="De qué métrica cuelga en el árbol."
                  error={errors.parent_id?.message}
                >
                  <Controller
                    control={form.control}
                    name="parent_id"
                    render={({ field }) => (
                      <Select value={field.value || "none"} onValueChange={field.onChange}>
                        <SelectTrigger id={`${idp}-parent`} className="w-full" aria-invalid={!!errors.parent_id}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin padre (fuera del árbol)</SelectItem>
                          {parentOptions.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
              </div>
            ) : null}

            <FormField
              id={`${idp}-definition`}
              label="Definición"
              description="Cómo se calcula y qué cuenta. Sin ambigüedades, para que todos carguen lo mismo."
              error={errors.definition?.message}
            >
              <Textarea id={`${idp}-definition`} rows={3} {...form.register("definition")} />
            </FormField>

            {showDefinition ? (
              <>
                <FormField
                  id={`${idp}-scope`}
                  label="Alcance"
                  description="¿Mide venta que el negocio no tendría sin nosotros, o qué tan bien anda la plataforma?"
                  error={errors.scope?.message}
                >
                  <Controller
                    control={form.control}
                    name="scope"
                    render={({ field }) => (
                      <Select value={field.value || "none"} onValueChange={field.onChange}>
                        <SelectTrigger id={`${idp}-scope`} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin definir</SelectItem>
                          {METRIC_SCOPES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {METRIC_SCOPE_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {scope === "platform" ? (
                    <p role="note" className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-highlight bg-highlight/15 px-2.5 py-1.5 text-xs">
                      <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                      {PLATFORM_SCOPE_WARNING}
                    </p>
                  ) : null}
                </FormField>

                <fieldset className="grid gap-2">
                  <legend className="text-sm font-medium">Se calcula como (opcional)</legend>
                  <p className="text-xs text-soft">
                    Si es una tasa, elija de qué métricas sale. Al cargar la semana avisamos si el valor no cuadra con la división.
                  </p>
                  <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                    <FormField id={`${idp}-numerator`} label="Numerador" error={errors.numerator_id?.message}>
                      <Controller
                        control={form.control}
                        name="numerator_id"
                        render={({ field }) => (
                          <Select value={field.value || "none"} onValueChange={field.onChange}>
                            <SelectTrigger id={`${idp}-numerator`} className="w-full" aria-invalid={!!errors.numerator_id}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sin fórmula</SelectItem>
                              {ratioOptions.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </FormField>
                    <span aria-hidden className="hidden pt-8 text-lg font-bold text-soft sm:block">
                      ÷
                    </span>
                    <FormField id={`${idp}-denominator`} label="Denominador" error={errors.denominator_id?.message}>
                      <Controller
                        control={form.control}
                        name="denominator_id"
                        render={({ field }) => (
                          <Select value={field.value || "none"} onValueChange={field.onChange}>
                            <SelectTrigger id={`${idp}-denominator`} className="w-full" aria-invalid={!!errors.denominator_id}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sin fórmula</SelectItem>
                              {ratioOptions.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </FormField>
                  </div>
                </fieldset>
              </>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id={`${idp}-direction`} label="Dirección deseada" required error={errors.direction?.message}>
                <Controller
                  control={form.control}
                  name="direction"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id={`${idp}-direction`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="up">Debe subir</SelectItem>
                        <SelectItem value="down">Debe bajar</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField
                id={`${idp}-unit`}
                label="Unidad"
                description="Ej. %, COP, altas."
                error={errors.unit?.message}
              >
                <Input id={`${idp}-unit`} list={`${idp}-units`} {...form.register("unit")} />
                <datalist id={`${idp}-units`}>
                  {UNIT_SUGGESTIONS.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </FormField>
              <FormField
                id={`${idp}-baseline`}
                label={<Term k="baseline" />}
                description="Valor de partida. Acepta 1234,5."
                error={errors.baseline?.message}
              >
                <Input
                  id={`${idp}-baseline`}
                  inputMode="decimal"
                  className="tabular-nums"
                  aria-invalid={!!errors.baseline}
                  {...form.register("baseline")}
                />
              </FormField>
              <FormField
                id={`${idp}-unit-value`}
                label={<Term k="unitValue">Valor por unidad (COP)</Term>}
                description="Opcional. Ej. una alta ≈ 250.000."
                error={errors.unit_value?.message}
              >
                <Input
                  id={`${idp}-unit-value`}
                  inputMode="decimal"
                  className="tabular-nums"
                  placeholder="Ej. 250.000"
                  aria-invalid={!!errors.unit_value}
                  {...form.register("unit_value")}
                />
              </FormField>
              <FormField id={`${idp}-owner`} label="Responsable" error={errors.owner_id?.message}>
                <Controller
                  control={form.control}
                  name="owner_id"
                  render={({ field }) => (
                    <Select value={field.value || "none"} onValueChange={field.onChange}>
                      <SelectTrigger id={`${idp}-owner`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin responsable</SelectItem>
                        {members.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField id={`${idp}-channel`} label="Canal" description="Ej. Digital, WhatsApp, Tienda." error={errors.channel?.message}>
                <Input id={`${idp}-channel`} {...form.register("channel")} />
              </FormField>
              <FormField id={`${idp}-source`} label="Fuente" description="De dónde sale el dato." error={errors.source?.message}>
                <Input id={`${idp}-source`} placeholder="Ej. CRM, Meta Ads" {...form.register("source")} />
              </FormField>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <SubmitButton pending={pending}>{metric ? "Guardar cambios" : "Crear métrica"}</SubmitButton>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
