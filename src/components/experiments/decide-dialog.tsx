"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Callout } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { DECISION_LABEL, VERDICT_LABEL } from "@/domain/labels";
import { DECISIONS, VERDICTS, type Decision, type Verdict } from "@/domain/types";
import { cn } from "@/lib/utils";
import { CELEBRATIONS, celebrate } from "@/components/brand/celebrate";
import { decideExperiment } from "@/server/actions/experiments";

export interface DecideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programId: string;
  experimentId: string;
  decisionRule: string | null;
  lines: { id: string; name: string }[];
  ownLineId: string;
  canDecide: boolean;
  missingResults: boolean;
  durationWarning: string | null;
}

/** Veredicto + decisión + aprendizaje obligatorio, en un solo paso (regla 3). */
export function DecideDialog(props: DecideDialogProps) {
  const router = useRouter();
  const [verdict, setVerdict] = useState<Verdict>();
  const [decision, setDecision] = useState<Decision>();
  const [rationale, setRationale] = useState("");
  const [learning, setLearning] = useState("");
  const [suggested, setSuggested] = useState("");
  const [appliesTo, setAppliesTo] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const canSubmit = !!verdict && !!decision && learning.trim().length >= 10 && !props.missingResults;

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const r = await decideExperiment({
        programId: props.programId,
        experimentId: props.experimentId,
        verdict: verdict!,
        decision: decision!,
        rationale,
        learning,
        appliesTo,
        suggestedHypothesis: suggested || undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (verdict === "winner") celebrate(...CELEBRATIONS.winner);
      else if (verdict === "loser") toast.success("Ese camino no era", { description: "Tranquilo el corazón: ya sabemos por dónde no es. El aprendizaje quedó guardado." });
      else toast.success("Listo pues: ejercicio decidido", { description: "El aprendizaje quedó guardado. Del dato al camino." });
      props.onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Decidir el ejercicio</DialogTitle>
          <DialogDescription>
            Lea el resultado frente a la regla de decisión que fijó antes de lanzar. Para decidir, deje un aprendizaje: esa es la ñapa que queda para las otras líneas.
          </DialogDescription>
        </DialogHeader>

        {props.decisionRule ? (
          <div className="rounded-lg border-l-4 border-l-highlight bg-wash px-3 py-2 text-sm">
            <div className="text-xs font-medium text-soft">Regla de decisión</div>
            {props.decisionRule}
          </div>
        ) : null}
        {props.missingResults ? (
          <Callout title="Faltan resultados">Cargue la muestra y las conversiones (o el valor de la métrica) de todas las variantes antes de decidir.</Callout>
        ) : null}
        {props.durationWarning ? <Callout title="Duración">{props.durationWarning}</Callout> : null}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Veredicto</legend>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
            {VERDICTS.map((x) => (
              <button
                key={x}
                type="button"
                role="radio"
                aria-checked={verdict === x}
                onClick={() => setVerdict(x)}
                className={cn("rounded-lg border px-3 py-2 text-sm hover:border-ink/40", verdict === x && "border-ink bg-wash font-medium")}
              >
                {VERDICT_LABEL[x]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Decisión</legend>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
            {DECISIONS.map((x) => (
              <button
                key={x}
                type="button"
                role="radio"
                aria-checked={decision === x}
                onClick={() => setDecision(x)}
                className={cn("rounded-lg border px-3 py-2 text-sm hover:border-ink/40", decision === x && "border-ink bg-wash font-medium")}
              >
                {DECISION_LABEL[x]}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="rationale">¿Por qué esta decisión?</Label>
          <Textarea id="rationale" rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="learning">Aprendizaje (obligatorio)</Label>
          <Textarea
            id="learning"
            rows={3}
            value={learning}
            onChange={(e) => setLearning(e.target.value)}
            placeholder="¿Qué aprendimos, más allá del resultado? Por qué funcionó o por qué no."
          />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">¿A qué otras líneas aplica?</div>
          <div className="flex flex-wrap gap-4">
            {props.lines
              .filter((l) => l.id !== props.ownLineId)
              .map((l) => (
                <label key={l.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={appliesTo.includes(l.id)}
                    onCheckedChange={(c) => setAppliesTo((prev) => (c ? [...prev, l.id] : prev.filter((x) => x !== l.id)))}
                  />
                  {l.name}
                </label>
              ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="suggested">Hipótesis derivada sugerida (opcional)</Label>
          <Input id="suggested" placeholder="Probemos por ahí: SI… ENTONCES… PORQUE…" value={suggested} onChange={(e) => setSuggested(e.target.value)} />
        </div>

        {error ? <Callout title="No se pudo decidir">{error}</Callout> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!canSubmit || pending}>
            {pending ? <Spinner /> : null} Decidir y registrar aprendizaje
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
