"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/app/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { daysBetween } from "@/domain/dates";
import { stepHref } from "@/domain/setup-flow";
import { saveProgramStep } from "@/server/actions/setup";
import { FIELD_HELP } from "../help-content";
import { HelpLabel, UseExampleButton } from "../help";
import { StepFooter } from "../step-footer";

export function StepProgram({
  programId,
  defaults,
  readOnly,
}: {
  programId: string | null;
  defaults: { name: string; description: string; start_date: string; end_date: string };
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(defaults);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const days = v.start_date && v.end_date && v.end_date > v.start_date ? daysBetween(v.start_date, v.end_date) : null;

  function next() {
    setError(undefined);
    setErrors({});
    if (readOnly && programId) {
      router.push(stepHref(programId, { key: "calendario" }));
      return;
    }
    startTransition(async () => {
      const r = await saveProgramStep(programId, v);
      if (!r.ok) {
        setError(r.error);
        if (r.fieldErrors) setErrors(Object.fromEntries(Object.entries(r.fieldErrors).map(([k, m]) => [k, m[0]])));
        return;
      }
      router.push(stepHref(r.data.id, { key: "calendario" }));
    });
  }

  return (
    <div className="rounded-xl border bg-paper p-5">
      <div className="mb-4 flex justify-end">
        {!readOnly ? (
          <UseExampleButton
            onClick={() =>
              setV({
                name: "Plan de acción digital oct 2026 – abr 2027",
                description: "Crecer las ventas digitales eficientes de pospago, portabilidad, recargas y equipos con ejercicios medidos.",
                start_date: "2026-10-01",
                end_date: "2027-04-30",
              })
            }
          />
        ) : null}
      </div>
      <FormError message={error} className="mb-4" />
      <fieldset disabled={readOnly} className="space-y-5">
        <div className="space-y-1.5">
          <HelpLabel htmlFor="p-name" help={FIELD_HELP.programName} required>
            Nombre del programa
          </HelpLabel>
          <Input id="p-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Plan de acción digital oct 2026 – abr 2027" aria-invalid={!!errors.name} />
          {errors.name ? <p className="text-sm">{errors.name}</p> : null}
        </div>
        <div className="space-y-1.5">
          <HelpLabel htmlFor="p-desc" help="Para qué existe este programa, en una o dos frases. Sirve para que el equipo y la dirección entiendan el objetivo.">
            Objetivo (opcional)
          </HelpLabel>
          <Textarea id="p-desc" rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="Qué se quiere lograr y en qué negocios." />
        </div>
        <div>
          <HelpLabel help={FIELD_HELP.programDates} required>
            Periodo del programa
          </HelpLabel>
          <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="p-start" className="text-xs text-soft">
                Empieza
              </label>
              <Input id="p-start" type="date" value={v.start_date} onChange={(e) => setV({ ...v, start_date: e.target.value })} aria-invalid={!!errors.start_date} />
            </div>
            <div className="space-y-1">
              <label htmlFor="p-end" className="text-xs text-soft">
                Termina
              </label>
              <Input id="p-end" type="date" value={v.end_date} onChange={(e) => setV({ ...v, end_date: e.target.value })} aria-invalid={!!errors.end_date} />
            </div>
          </div>
          {errors.end_date || errors.start_date ? <p className="mt-1 text-sm">{errors.end_date ?? errors.start_date}</p> : null}
          {days ? (
            <p className="mt-2 text-xs text-soft">
              {Math.round(days / 7)} semanas. Un programa de 6 a 9 meses deja espacio para probar antes de los picos y escalar después.
            </p>
          ) : null}
        </div>
      </fieldset>
      <StepFooter prevHref={null} pending={pending} onNext={next} nextLabel={programId ? "Guardar y seguir" : "Crear programa y seguir"} />
    </div>
  );
}
