"use client";

import { ArrowRight, Gavel, Snowflake, TriangleAlert, Undo2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Callout } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_LABEL } from "@/domain/labels";
import { isForward } from "@/domain/lifecycle";
import type { ExperimentStatus } from "@/domain/types";
import { transitionExperiment } from "@/server/actions/experiments";
import { DecideDialog, type DecideDialogProps } from "./decide-dialog";

export interface TransitionOption {
  to: ExperimentStatus;
  ok: boolean;
  reasons: string[];
  canForce: boolean;
  freezeName: string | null;
}

const ACTION_LABEL: Partial<Record<ExperimentStatus, string>> = {
  prioritized: "Priorizar",
  in_design: "Pasar a diseño",
  in_test: "Lanzar prueba",
  in_reading: "Cerrar y leer resultados",
  decided: "Decidir",
  scaled: "Escalar a BAU",
  discarded: "Descartar",
};

export function TransitionBar({
  programId,
  experimentId,
  status,
  options,
  durationWarning,
  decide,
}: {
  programId: string;
  experimentId: string;
  status: ExperimentStatus;
  options: TransitionOption[];
  durationWarning: string | null;
  decide: Omit<DecideDialogProps, "open" | "onOpenChange"> | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [forceFor, setForceFor] = useState<TransitionOption | null>(null);
  const [justification, setJustification] = useState("");
  const [decideOpen, setDecideOpen] = useState(false);
  const [error, setError] = useState<string>();

  function go(to: ExperimentStatus, force?: { justification: string }) {
    setError(undefined);
    startTransition(async () => {
      const r = await transitionExperiment({
        experimentId,
        programId,
        to,
        force: !!force,
        justification: force?.justification,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setForceFor(null);
      setJustification("");
      toast.success(`Ahora está en ${STATUS_LABEL[to]}`);
      router.refresh();
    });
  }

  if (!options.length) {
    return (
      <p className="text-sm text-soft">
        {status === "scaled" ? "Escalado a la operación normal. Fin del ciclo." : "Estado terminal: no tiene más transiciones."}
      </p>
    );
  }

  const blocked = options.filter((o) => !o.ok && !o.canForce && o.reasons.length);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const forward = isForward(status, o.to);
          const Icon = o.to === "discarded" ? XCircle : o.to === "decided" ? Gavel : forward ? ArrowRight : Undo2;
          const label = forward || o.to === "discarded" ? ACTION_LABEL[o.to] : `Volver a ${STATUS_LABEL[o.to]}`;
          if (o.to === "decided" && decide) {
            return (
              <Button key={o.to} onClick={() => setDecideOpen(true)} disabled={pending || !decide.canDecide}>
                <Icon aria-hidden /> {label}
              </Button>
            );
          }
          if (!o.ok && o.canForce) {
            return (
              <Button key={o.to} variant="outline" onClick={() => setForceFor(o)} disabled={pending}>
                <Snowflake aria-hidden /> Forzar inicio en congelamiento
              </Button>
            );
          }
          return (
            <Button
              key={o.to}
              variant={forward && o.to !== "discarded" ? "default" : "outline"}
              disabled={!o.ok || pending}
              onClick={() => go(o.to)}
              aria-describedby={!o.ok ? `why-${o.to}` : undefined}
            >
              {pending ? <Spinner /> : <Icon aria-hidden />} {label}
            </Button>
          );
        })}
      </div>

      {durationWarning && (status === "in_test" || status === "in_reading") ? (
        <Callout icon={TriangleAlert} title="Antes de cerrar">
          {durationWarning}
        </Callout>
      ) : null}

      {blocked.length ? (
        <div className="rounded-lg border bg-wash px-3 py-2 text-sm">
          <div className="font-medium">Qué falta</div>
          <ul className="mt-1 space-y-1">
            {blocked.map((o) => (
              <li key={o.to} id={`why-${o.to}`}>
                {o.reasons.join(" ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <Callout title="No se pudo cambiar el estado">{error}</Callout> : null}

      <Dialog open={!!forceFor} onOpenChange={(o) => !o && setForceFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forzar el inicio dentro de un congelamiento</DialogTitle>
            <DialogDescription>
              La fecha de inicio cae dentro de “{forceFor?.freezeName}”. En los picos la prioridad es vender: forzarlo queda registrado en la
              actividad con tu justificación.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="force-justification">Justificación</Label>
            <Textarea
              id="force-justification"
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </div>
          {error ? <Callout title="No se pudo">{error}</Callout> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceFor(null)}>
              Cancelar
            </Button>
            <Button
              disabled={justification.trim().length < 10 || pending}
              onClick={() => forceFor && go(forceFor.to, { justification: justification.trim() })}
            >
              {pending ? <Spinner /> : null} Forzar y lanzar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {decide ? <DecideDialog {...decide} open={decideOpen} onOpenChange={setDecideOpen} /> : null}
    </div>
  );
}
