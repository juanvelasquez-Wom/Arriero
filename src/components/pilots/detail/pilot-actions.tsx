"use client";

import { Ban, CheckCheck, FlaskConical, Gavel, Lock, RotateCcw, ScanSearch, Send, Trash2, TriangleAlert, Undo2, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Callout } from "@/components/app/page";
import { DecisionBadge } from "@/components/app/status-badge";
import { CELEBRATIONS, celebrate } from "@/components/brand/celebrate";
import { FormError } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { todayIso } from "@/domain/dates";
import { DECISION_LABEL, VERDICT_LABEL } from "@/domain/labels";
import type { PilotAction } from "@/domain/pilots/flow";
import { DECISIONS, VERDICTS, type Decision, type Verdict } from "@/domain/types";
import type { ActionResult } from "@/lib/action-result";
import {
  approvePilot,
  cancelPilot,
  decidePilot,
  deletePilot,
  moveToReading,
  restorePilot,
  returnPilot,
  startPilot,
  submitPilot,
} from "@/server/actions/pilots";

type DialogKey = PilotAction | "restore";

const BUTTON: Record<DialogKey, { label: string; icon: LucideIcon; primary?: boolean; ghost?: boolean }> = {
  submit: { label: "Enviar a revisión", icon: Send, primary: true },
  approve: { label: "Aprobar y bloquear diseño", icon: CheckCheck, primary: true },
  return: { label: "Devolver a borrador", icon: Undo2 },
  start: { label: "Lanzar piloto", icon: FlaskConical, primary: true },
  to_reading: { label: "Pasar a lectura", icon: ScanSearch, primary: true },
  decide: { label: "Firmar decisión", icon: Gavel, primary: true },
  cancel: { label: "Cancelar piloto", icon: Ban, ghost: true },
  delete: { label: "Borrar", icon: Trash2, ghost: true },
  restore: { label: "Restaurar piloto", icon: RotateCcw, primary: true },
};

export interface PilotActionsProps {
  pilotId: string;
  title: string;
  actions: PilotAction[];
  deleted: boolean;
  canRestore: boolean;
  /** Lo que falta para enviar a revisión (de public.pilot_missing). */
  missing: string[];
  /** Cruces con otros pilotos (texto listo). */
  overlaps: string[];
  checklist: { total: number; pending: number };
  plannedStart: string | null;
  actualStart: string | null;
  suggestion: { decision: Decision | null; reasons: string[] } | null;
  /** Probabilidad de ganar ≥ 95 % con la lectura actual (para celebrar si se declara ganador). */
  reliableWinner: boolean;
}

export function PilotActions(props: PilotActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState<DialogKey | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [comment, setComment] = useState("");
  const [date, setDate] = useState(todayIso());
  const [verdict, setVerdict] = useState<Verdict | "">("");
  const [decision, setDecision] = useState<Decision | "">(props.suggestion?.decision ?? "");
  const [justification, setJustification] = useState("");
  const [learning, setLearning] = useState("");

  const keys: DialogKey[] = props.deleted ? (props.canRestore ? ["restore"] : []) : props.actions;
  if (!keys.length) return null;

  function openDialog(k: DialogKey) {
    setError(undefined);
    setComment("");
    setDate(k === "start" ? (props.plannedStart && props.plannedStart > todayIso() ? props.plannedStart : todayIso()) : todayIso());
    setOpen(k);
  }

  function run(fn: () => Promise<ActionResult>, after?: () => void) {
    startTransition(async () => {
      setError(undefined);
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(r.message ?? "Listo.");
      setOpen(null);
      after?.();
      router.refresh();
    });
  }

  const confirm: Record<DialogKey, () => void> = {
    submit: () => run(() => submitPilot(props.pilotId)),
    approve: () => run(() => approvePilot(props.pilotId, comment)),
    return: () => run(() => returnPilot(props.pilotId, comment)),
    start: () => run(() => startPilot(props.pilotId, date)),
    to_reading: () => run(() => moveToReading(props.pilotId, date)),
    decide: () =>
      run(
        () => decidePilot(props.pilotId, { verdict: verdict as Verdict, decision: decision as Decision, justification, learning }),
        () => {
          if (verdict === "winner" && props.reliableWinner) celebrate(...CELEBRATIONS.winner);
        },
      ),
    cancel: () => run(() => cancelPilot(props.pilotId, comment)),
    delete: () => run(() => deletePilot(props.pilotId), () => router.push("/pilotos")),
    restore: () => run(() => restorePilot(props.pilotId)),
  };

  const disabled: Partial<Record<DialogKey, boolean>> = {
    submit: props.missing.length > 0,
    return: comment.trim().length < 5,
    cancel: comment.trim().length < 5,
    start: props.checklist.total === 0 || props.checklist.pending > 0 || !date,
    to_reading: !date || (!!props.actualStart && date < props.actualStart),
    decide: !verdict || !decision || justification.trim().length < 10 || learning.trim().length < 10,
  };

  const body: Record<DialogKey, { title: string; description: string; content?: ReactNode }> = {
    submit: {
      title: "Enviar a revisión",
      description: "Un aprobador revisa el diseño y lo aprueba o se lo devuelve con comentarios. Mientras está en revisión no se edita.",
      content: props.missing.length ? (
        <Callout icon={TriangleAlert} title="Todavía falta:">
          <ul className="list-disc pl-5">
            {props.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Callout>
      ) : (
        <Callout tone="neutral" icon={CheckCheck} title="El diseño está completo." />
      ),
    },
    approve: {
      title: "Aprobar y bloquear diseño",
      description:
        "Al aprobar, la hipótesis, la variable, el tipo de prueba, las métricas, los guardrails, las reglas, la potencia, los grupos y los medios quedan bloqueados. Lo que cambie en la ejecución se registra como incidente.",
      content: (
        <>
          {props.overlaps.length ? (
            <Callout icon={TriangleAlert} title="Ojo: este piloto se cruza con otros">
              <ul className="list-disc pl-5">
                {props.overlaps.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </Callout>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="approve-comment">Comentario (opcional)</Label>
            <Textarea id="approve-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
          </div>
        </>
      ),
    },
    return: {
      title: "Devolver a borrador",
      description: "Cuéntele al equipo qué hay que ajustar. El comentario queda en la bitácora.",
      content: (
        <div className="space-y-1.5">
          <Label htmlFor="return-comment">¿Qué hay que ajustar?</Label>
          <Textarea id="return-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={4} />
        </div>
      ),
    },
    start: {
      title: "Lanzar piloto",
      description: "Desde hoy el piloto queda En prueba: se cargan los datos por periodo y se registran los incidentes.",
      content: (
        <>
          {props.checklist.total === 0 ? (
            <Callout icon={TriangleAlert} title="Falta la lista de chequeo de medición">
              ¿Qué eventos tienen que disparar? Ármela en el diseño antes de lanzar.
            </Callout>
          ) : props.checklist.pending > 0 ? (
            <Callout icon={TriangleAlert} title={`Faltan ${props.checklist.pending} evento(s) por verificar`}>
              Márquelos como «Dispara bien» en el resumen del piloto. Sin medición, no hay lectura.
            </Callout>
          ) : (
            <Callout tone="neutral" icon={CheckCheck} title={`Medición verificada: ${props.checklist.total} evento(s) disparan bien.`} />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="start-date">Fecha de inicio</Label>
            <Input id="start-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </>
      ),
    },
    to_reading: {
      title: "Pasar a lectura",
      description: "Se cierra la prueba. Los datos se pueden seguir cargando hasta que el aprobador firme la decisión.",
      content: (
        <div className="space-y-1.5">
          <Label htmlFor="end-date">Fecha de cierre</Label>
          <Input id="end-date" type="date" value={date} min={props.actualStart ?? undefined} onChange={(e) => setDate(e.target.value)} />
        </div>
      ),
    },
    decide: {
      title: "Firmar decisión",
      description: "El veredicto, la decisión y el aprendizaje quedan firmados con su nombre. El aprendizaje va a la biblioteca.",
      content: (
        <>
          {props.suggestion?.decision ? (
            <Callout tone="neutral" title={<span className="inline-flex items-center gap-2">Arriero sugiere: <DecisionBadge decision={props.suggestion.decision} /></span>}>
              {props.suggestion.reasons.length ? (
                <ul className="list-disc pl-5">
                  {props.suggestion.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-1 text-xs text-soft">Es una sugerencia según las reglas registradas antes de lanzar. La decisión es suya.</p>
            </Callout>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="verdict">Veredicto</Label>
              <Select value={verdict} onValueChange={(v) => setVerdict(v as Verdict)}>
                <SelectTrigger id="verdict" className="w-full">
                  <SelectValue placeholder="Elija" />
                </SelectTrigger>
                <SelectContent>
                  {VERDICTS.map((v) => (
                    <SelectItem key={v} value={v}>
                      {VERDICT_LABEL[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="decision">Decisión</Label>
              <Select value={decision} onValueChange={(v) => setDecision(v as Decision)}>
                <SelectTrigger id="decision" className="w-full">
                  <SelectValue placeholder="Elija" />
                </SelectTrigger>
                <SelectContent>
                  {DECISIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {DECISION_LABEL[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="justification">¿Por qué esta decisión?</Label>
            <Textarea id="justification" value={justification} onChange={(e) => setJustification(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="learning">¿Qué aprendimos?</Label>
            <Textarea
              id="learning"
              value={learning}
              onChange={(e) => setLearning(e.target.value)}
              rows={3}
              placeholder="Ej.: En CTWA, el video UGC vende más por conversación que la pieza de oferta."
            />
          </div>
        </>
      ),
    },
    cancel: {
      title: "Cancelar piloto",
      description: "El piloto queda cancelado con su motivo en la bitácora. No se puede reabrir.",
      content: (
        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason">¿Por qué se cancela?</Label>
          <Textarea id="cancel-reason" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
        </div>
      ),
    },
    delete: {
      title: `¿Borrar «${props.title}»?`,
      description: "Deja de verse en el portafolio. Un aprobador lo puede restaurar.",
    },
    restore: {
      title: "Restaurar piloto",
      description: "El piloto vuelve al portafolio en el estado en que estaba.",
    },
  };

  const current = open ? body[open] : null;
  const primaryKeys = keys.filter((k) => !BUTTON[k].ghost);
  const ghostKeys = keys.filter((k) => BUTTON[k].ghost);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {primaryKeys.map((k) => {
          const { label, icon: Icon, primary } = BUTTON[k];
          return (
            <Button key={k} variant={primary ? "default" : "outline"} className="min-h-11" onClick={() => openDialog(k)}>
              <Icon aria-hidden /> {label}
            </Button>
          );
        })}
        {ghostKeys.map((k) => {
          const { label, icon: Icon } = BUTTON[k];
          return (
            <Button key={k} variant="ghost" className="min-h-11" onClick={() => openDialog(k)}>
              <Icon aria-hidden /> {label}
            </Button>
          );
        })}
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {current && open ? (
            <>
              <DialogHeader>
                <DialogTitle>{current.title}</DialogTitle>
                <DialogDescription>{current.description}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {open === "approve" ? (
                  <p className="flex items-center gap-1.5 text-xs text-soft">
                    <Lock aria-hidden className="size-3.5" /> Bloqueo del diseño
                  </p>
                ) : null}
                {current.content}
                <FormError message={error} />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(null)} disabled={pending}>
                  Volver
                </Button>
                <Button
                  variant={open === "delete" ? "destructive" : "default"}
                  onClick={confirm[open]}
                  disabled={pending || !!disabled[open]}
                >
                  {pending ? <Spinner /> : null}
                  {open === "delete" ? "Sí, borrar" : BUTTON[open].label}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
