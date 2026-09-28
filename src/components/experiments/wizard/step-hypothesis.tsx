"use client";

import { Check } from "lucide-react";
import { FormField } from "@/components/app/form";
import { Term } from "@/components/app/info-tip";
import { Callout } from "@/components/app/page";
import { Textarea } from "@/components/ui/textarea";
import { missingHypothesisParts } from "@/domain/lifecycle";
import type { WizardData, WizardValues } from "../wizard-values";
import type { SetField, SetValues } from "./shared";
import { SimilarBox } from "./similar-box";
import { TiaHypothesisHelp } from "./tia-help";

/** Paso 2 · Hipótesis SI / ENTONCES / PORQUE. */
export function StepHypothesis({
  data,
  v,
  set,
  setV,
  draftText,
  experimentId,
}: {
  data: WizardData;
  v: WizardValues;
  set: SetField;
  setV: SetValues;
  draftText: string;
  experimentId?: string;
}) {
  const missingHypothesis = missingHypothesisParts(v);
  return (
    <div className="space-y-4">
      <p className="text-sm text-soft">
        Escriba la <Term k="hypothesis">hipótesis</Term> en tres partes. Ejemplo: <em>SI</em> enviamos un recordatorio por WhatsApp a los
        25 días de la primera recarga, <em>ENTONCES</em> sube la segunda recarga a 30 días, <em>PORQUE</em> el cliente se acuerda a tiempo.
      </p>
      <FormField id="h-if" label="SI… (el cambio que haremos)">
        <Textarea
          id="h-if"
          rows={2}
          value={v.hypothesis_if}
          onChange={(e) => set("hypothesis_if", e.target.value)}
          placeholder="mostramos el precio como cuota mensual en la ficha del equipo"
        />
      </FormField>
      <FormField id="h-then" label="ENTONCES… (qué esperamos que pase en la métrica)">
        <Textarea
          id="h-then"
          rows={2}
          value={v.hypothesis_then}
          onChange={(e) => set("hypothesis_then", e.target.value)}
          placeholder="más visitas terminan en compra"
        />
      </FormField>
      <FormField id="h-because" label="PORQUE… (la razón que creemos que lo explica)">
        <Textarea
          id="h-because"
          rows={2}
          value={v.hypothesis_because}
          onChange={(e) => set("hypothesis_because", e.target.value)}
          placeholder="el precio se percibe accesible"
        />
      </FormField>
      {missingHypothesis.length ? (
        <Callout tone="neutral" title="Para pasar a En diseño se necesitan las tres partes">
          Falta: {missingHypothesis.join(", ")}. Puede guardar el borrador sin ellas y completarlas después, sin afán.
        </Callout>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-soft" aria-live="polite">
          <Check className="size-4" aria-hidden /> ¡Eso! Hipótesis completa: por este lado ya puede pasar a En diseño.
        </p>
      )}
      <SimilarBox data={data} draftText={draftText} excludeExperimentId={experimentId} excludeLearningId={v.derived_from_learning_id} />
      <TiaHypothesisHelp programId={data.programId} v={v} setV={setV} />
    </div>
  );
}
