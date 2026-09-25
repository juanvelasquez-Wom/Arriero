"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyFieldErrors, FormError, FormField, SubmitButton } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { programBasicsSchema, type ProgramBasicsInput } from "@/lib/validation/programs";
import { advanceSetup, createProgram, updateProgramBasics } from "@/server/actions/programs";

export function BasicsForm({
  programId,
  defaults,
  readOnly,
}: {
  programId: string | null;
  defaults?: ProgramBasicsInput;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const form = useForm<ProgramBasicsInput>({
    resolver: zodResolver(programBasicsSchema),
    defaultValues: defaults ?? {
      name: "",
      description: "",
      start_date: "",
      end_date: "",
      horizons: [
        { name: "H1", start_date: "", end_date: "" },
        { name: "H2", start_date: "", end_date: "" },
      ],
    },
  });
  const horizons = useFieldArray({ control: form.control, name: "horizons" });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    startTransition(async () => {
      if (!programId) {
        const r = await createProgram(values);
        if (!r.ok) {
          setError(r.error);
          applyFieldErrors(r.fieldErrors, form.setError);
          return;
        }
        toast.success("Programa creado");
        router.push(`/programas/${r.data.id}/configuracion?paso=2`);
        return;
      }
      const r = await updateProgramBasics(programId, values);
      if (!r.ok) {
        setError(r.error);
        applyFieldErrors(r.fieldErrors, form.setError);
        return;
      }
      await advanceSetup(programId, 1);
      toast.success("Datos guardados");
      router.push(`/programas/${programId}/configuracion?paso=2`);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={readOnly} className="space-y-6">
        <FieldGroup>
          <FormError message={error} />
          <FormField id="name" label="Nombre del programa" required error={errors.name?.message}>
            <Input id="name" placeholder="Plan de acción digital oct 2026 – abr 2027" {...form.register("name")} />
          </FormField>
          <FormField id="description" label="Descripción" error={errors.description?.message}>
            <Textarea id="description" rows={3} placeholder="Qué busca este programa y para quién." {...form.register("description")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="start_date" label="Fecha de inicio" required error={errors.start_date?.message}>
              <Input id="start_date" type="date" {...form.register("start_date")} />
            </FormField>
            <FormField id="end_date" label="Fecha de fin" required error={errors.end_date?.message}>
              <Input id="end_date" type="date" {...form.register("end_date")} />
            </FormField>
          </div>
        </FieldGroup>

        <div>
          <h3 className="text-sm font-semibold">Horizontes</h3>
          <p className="mt-0.5 text-xs text-soft">
            Tramos del programa (p. ej. H1 hasta el punto de decisión y H2 después). Las métricas tienen un objetivo por horizonte.
          </p>
          {errors.horizons?.message || errors.horizons?.root?.message ? (
            <p role="alert" className="mt-2 text-sm">
              {errors.horizons?.message ?? errors.horizons?.root?.message}
            </p>
          ) : null}
          <div className="mt-3 space-y-3">
            {horizons.fields.map((field, i) => (
              <div key={field.id} className="grid items-end gap-3 rounded-lg border bg-wash/50 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <FormField id={`h-name-${i}`} label="Nombre" error={errors.horizons?.[i]?.name?.message}>
                  <Input id={`h-name-${i}`} {...form.register(`horizons.${i}.name`)} />
                </FormField>
                <FormField id={`h-start-${i}`} label="Desde" error={errors.horizons?.[i]?.start_date?.message}>
                  <Input id={`h-start-${i}`} type="date" {...form.register(`horizons.${i}.start_date`)} />
                </FormField>
                <FormField id={`h-end-${i}`} label="Hasta" error={errors.horizons?.[i]?.end_date?.message}>
                  <Input id={`h-end-${i}`} type="date" {...form.register(`horizons.${i}.end_date`)} />
                </FormField>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Quitar horizonte ${i + 1}`}
                  onClick={() => horizons.remove(i)}
                  disabled={horizons.fields.length <= 1}
                >
                  <X aria-hidden />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => horizons.append({ name: `H${horizons.fields.length + 1}`, start_date: "", end_date: "" })}
          >
            <Plus aria-hidden /> Agregar horizonte
          </Button>
        </div>
      </fieldset>

      <div className="mt-8 flex justify-end gap-2">
        {readOnly ? (
          programId ? (
            <Button type="button" onClick={() => router.push(`/programas/${programId}/configuracion?paso=2`)}>
              Siguiente
            </Button>
          ) : null
        ) : (
          <SubmitButton pending={pending}>{programId ? "Guardar y seguir" : "Crear programa y seguir"}</SubmitButton>
        )}
      </div>
    </form>
  );
}
