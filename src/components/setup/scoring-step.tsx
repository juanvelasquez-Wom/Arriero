"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyFieldErrors, FormError, FormField, SubmitButton } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { computeFinalScore, computeIce } from "@/domain/scoring";
import { formatScore } from "@/domain/format";
import type { ScoringConfig } from "@/domain/types";
import { scoringSchema, type ScoringInput } from "@/lib/validation/programs";
import { updateScoring } from "@/server/actions/programs";

export function ScoringStep({
  programId,
  config,
  canEdit,
  completed,
}: {
  programId: string;
  config: ScoringConfig;
  canEdit: boolean;
  completed: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const form = useForm<ScoringInput>({ resolver: zodResolver(scoringSchema), defaultValues: config });
  const { errors } = form.formState;
  const values = useWatch({ control: form.control });
  const live: ScoringConfig = {
    calendar_bonus: Number(values.calendar_bonus) || 0,
    shared_penalty: Number(values.shared_penalty) || 0,
    external_penalty: Number(values.external_penalty) || 0,
  };
  const ice = computeIce(8, 6, 7)!;

  const onSubmit = form.handleSubmit((v) => {
    setError(undefined);
    startTransition(async () => {
      const r = await updateScoring(programId, v, true);
      if (!r.ok) {
        setError(r.error);
        applyFieldErrors(r.fieldErrors, form.setError);
        return;
      }
      toast.success(completed ? "Puntaje guardado" : "Configuración completa");
      router.push(`/programas/${programId}`);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <p className="text-sm text-soft">
        Puntaje final = ICE (promedio de impacto, confianza y facilidad) + bono si se puede leer antes de los picos − penalidad si depende
        de terceros.
      </p>
      <FormError message={error} />
      <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-3">
        <FormField id="calendar_bonus" label="Bono de calendario" description="Se suma si el ejercicio encaja en el calendario." error={errors.calendar_bonus?.message}>
          <Input id="calendar_bonus" type="number" step="0.5" inputMode="decimal" {...form.register("calendar_bonus")} />
        </FormField>
        <FormField id="shared_penalty" label="Penalidad control compartido" description="Se resta. Por defecto 1." error={errors.shared_penalty?.message}>
          <Input id="shared_penalty" type="number" step="0.5" inputMode="decimal" {...form.register("shared_penalty")} />
        </FormField>
        <FormField id="external_penalty" label="Penalidad control externo" description="Se resta. Por defecto 3." error={errors.external_penalty?.message}>
          <Input id="external_penalty" type="number" step="0.5" inputMode="decimal" {...form.register("external_penalty")} />
        </FormField>
      </fieldset>

      <div className="rounded-xl border bg-wash/60 p-4 text-sm">
        <div className="font-medium">Ejemplo con ICE {formatScore(ice)} (impacto 8, confianza 6, facilidad 7)</div>
        <ul className="mt-2 grid gap-1 tabular-nums sm:grid-cols-3">
          <li>Nuestro + calendario: <strong>{formatScore(computeFinalScore(ice, true, "ours", live))}</strong></li>
          <li>Compartido, sin calendario: <strong>{formatScore(computeFinalScore(ice, false, "shared", live))}</strong></li>
          <li>Externo, sin calendario: <strong>{formatScore(computeFinalScore(ice, false, "external", live))}</strong></li>
        </ul>
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={() => router.push(`/programas/${programId}/configuracion?paso=4`)}>
          Anterior
        </Button>
        {canEdit ? (
          <SubmitButton pending={pending}>{completed ? "Guardar" : "Terminar configuración"}</SubmitButton>
        ) : (
          <Button type="button" onClick={() => router.push(`/programas/${programId}`)}>
            Ir al programa
          </Button>
        )}
      </div>
    </form>
  );
}
