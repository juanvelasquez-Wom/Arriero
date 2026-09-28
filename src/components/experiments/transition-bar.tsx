"use client";

import { ArrowRight, ChevronDown, Gavel, Snowflake, TriangleAlert, Undo2, XCircle } from "lucide-react";
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
import { CELEBRATIONS, celebrate } from "@/components/brand/celebrate";
import { transitionExperiment } from "@/server/actions/experiments";
import { DecideDialog, type DecideDialogProps } from "./decide-dialog";

export interface TransitionOption {
  to: ExperimentStatus;
  ok: boolean;
  reasons: string[];
  canForce: boolean;
  freezeName: string | null;
}

/** Aviso que se muestra cuando está disponible el paso `to` (no bloquea). */
export interface TransitionWarning {
  to: ExperimentStatus;
  title: string;
  items: string[];
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
  warnings = [],
}: {
  programId: string;
  experimentId: string;
  status: ExperimentStatus;
  options: TransitionOption[];
  durationWarning: string | null;
  decide: Omit<DecideDialogProps, "open" | "onOpenChange"> | null;
  /** Avisos antes de un paso (cruces con otros ejercicios, potencia insuficiente). */
  warnings?: TransitionWarning[];
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
      if (to === "scaled") celebrate(...CELEBRATIONS.scaled);
      else if (to === "in_test") toast.success("¡Hágale pues! Prueba lanzada", { description: "Probemos por ahí." });
      else toast.success(`Listo pues: ahora está en ${STATUS_LABEL[to]}`);
      router.refresh();
    });
  }

  if (!options.length) {
    return (
      <p className="text-sm text-soft">
        {status === "scaled" ? "Ya está en la operación normal. ¡Qué berraquera, llegamos!" : "Este ejercicio ya terminó su camino: no tiene más pasos."}
      </p>
    );
  }

  const blocked = options.filter((o) => !o.ok && !o.canForce && o.reasons.length);
  // Una sola acción principal (avanzar); volver atrás y descartar quedan en "Otras opciones".
  const primary = options.filter((o) => isForward(status, o.to) && o.to !== "discarded");
  const secondary = options.filter((o) => !primary.includes(o));

  const renderOption = (o: TransitionOption) => {
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
        size={forward && o.to !== "discarded" ? "default" : "sm"}
        disabled={!o.ok || pending}
        onClick={() => go(o.to)}
        aria-describedby={!o.ok ? `why-${o.to}` : undefined}
      >
        {pending ? <Spinner /> : <Icon aria-hidden />} {label}
      </Button>
    );
  };

  return (
    <div className="space-y-3">
      {primary.length ? <div className="flex flex-wrap gap-2">{primary.map(renderOption)}</div> : null}
      {secondary.length ? (
        <details className="group text-sm">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 text-soft marker:hidden hover:text-ink [&::-webkit-details-marker]:hidden">
            <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" /> Otras opciones
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">{secondary.map(renderOption)}</div>
        </details>
      ) : null}

      {warnings
        .filter((w) => w.items.length && options.some((o) => o.to === w.to))
        .map((w) => (
          <Callout key={`${w.to}-${w.title}`} icon={TriangleAlert} title={w.title}>
            {w.items.length === 1 ? (
              w.items[0]
            ) : (
              <details className="group">
                <summary className="cursor-pointer list-none underline underline-offset-4 marker:hidden [&::-webkit-details-marker]:hidden">
                  Ver los {w.items.length} avisos
                </summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {w.items.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </details>
            )}
          </Callout>
        ))}

      {durationWarning && (status === "in_test" || status === "in_reading") ? (
        <Callout icon={TriangleAlert} title="Antes de cerrar">
          {durationWarning}
        </Callout>
      ) : null}

      {blocked.length ? (
        <div className="rounded-xl border bg-wash px-3 py-2 text-sm">
          <div className="font-medium">¿Qué falta?</div>
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
              La fecha de inicio cae dentro de “{forceFor?.freezeName}”. En los picos la prioridad es vender. Si lo fuerza, queda registrado en
              la actividad con su justificación.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="force-justification">Justificación (obligatoria)</Label>
            <Textarea
              id="force-justification"
              rows={3}
              placeholder="¿Por qué no puede esperar a que pase el congelamiento?"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </div>
          {error ? <Callout title="No se pudo forzar">{error}</Callout> : null}
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
