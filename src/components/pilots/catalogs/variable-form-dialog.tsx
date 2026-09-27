"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyFieldErrors, FormError, FormField, SubmitButton } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PILOT_TEST_TYPE_HELP, PILOT_TEST_TYPE_LABEL, VARIABLE_CATEGORY_LABEL } from "@/domain/pilots/labels";
import { PILOT_TEST_TYPES, VARIABLE_CATEGORIES, type PilotTestType, type VariableCategory } from "@/domain/pilots/types";
import { variableSchema, type VariableInput } from "@/lib/validation/pilots";
import { saveVariable } from "@/server/actions/pilots";
import type { PilotVariable } from "@/server/queries/pilots";
import { NONE } from "./catalog-bits";

/** Crear o editar una variable de la matriz de recomendación (solo aprobadores). */
export function VariableFormDialog({
  variable,
  defaultCategory,
  trigger,
}: {
  variable?: PilotVariable;
  defaultCategory?: VariableCategory;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const idp = `variable-${variable?.id ?? "new"}`;
  const defaults = (): VariableInput => ({
    category: (variable?.category as VariableCategory | undefined) ?? defaultCategory ?? "creative",
    name: variable?.name ?? "",
    description: variable?.description ?? "",
    recommended_test_type: variable?.recommended_test_type ?? "ab_platform",
    alternative_test_type: variable?.alternative_test_type ?? null,
  });
  const form = useForm<VariableInput, unknown, z.output<typeof variableSchema>>({ resolver: zodResolver(variableSchema), defaultValues: defaults() });
  const { errors } = form.formState;
  const recommended = useWatch({ control: form.control, name: "recommended_test_type" });

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
      const r = await saveVariable(variable?.id ?? null, values);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{variable ? `Editar «${variable.name}»` : "Agregar variable"}</DialogTitle>
          <DialogDescription>Qué se puede probar en medios y con qué tipo de prueba se lee mejor.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup className="gap-4">
            <FormError message={error} />
            <FormField id={`${idp}-category`} label="Categoría" required error={errors.category?.message}>
              <Controller
                control={form.control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id={`${idp}-category`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VARIABLE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {VARIABLE_CATEGORY_LABEL[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField id={`${idp}-name`} label="Variable" required error={errors.name?.message}>
              <Input id={`${idp}-name`} placeholder="Ej. Gancho de los primeros 3 segundos" aria-invalid={!!errors.name} {...form.register("name")} />
            </FormField>
            <FormField id={`${idp}-description`} label="Descripción" error={errors.description?.message}>
              <Textarea id={`${idp}-description`} rows={2} {...form.register("description")} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                id={`${idp}-recommended`}
                label="Tipo de prueba recomendado"
                required
                description={recommended ? PILOT_TEST_TYPE_HELP[recommended as PilotTestType] : undefined}
                error={errors.recommended_test_type?.message}
              >
                <Controller
                  control={form.control}
                  name="recommended_test_type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id={`${idp}-recommended`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PILOT_TEST_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {PILOT_TEST_TYPE_LABEL[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField id={`${idp}-alternative`} label="Alternativa" error={errors.alternative_test_type?.message}>
                <Controller
                  control={form.control}
                  name="alternative_test_type"
                  render={({ field }) => (
                    <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? null : v)}>
                      <SelectTrigger id={`${idp}-alternative`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Sin alternativa</SelectItem>
                        {PILOT_TEST_TYPES.filter((t) => t !== recommended).map((t) => (
                          <SelectItem key={t} value={t}>
                            {PILOT_TEST_TYPE_LABEL[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </div>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton pending={pending}>{variable ? "Guardar" : "Agregar variable"}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
