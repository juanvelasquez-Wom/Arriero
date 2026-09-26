"use client";

import { Lock, LockOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Callout } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/domain/format";
import { lockDesign, unlockDesign } from "@/server/actions/experiments";

/** Indicador de bloqueo del diseño (regla 4) con desbloqueo justificado para el owner. */
export function DesignLock({
  programId,
  experimentId,
  lockedAt,
  launched,
  canUnlock,
  canLock,
}: {
  programId: string;
  experimentId: string;
  lockedAt: string | null;
  launched: boolean;
  canUnlock: boolean;
  canLock: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!lockedAt) {
    if (!launched) {
      return (
        <p className="flex items-center gap-2 text-sm text-soft">
          <LockOpen className="size-4" aria-hidden /> El diseño se puede editar. Se bloquea al pasar a En prueba.
        </p>
      );
    }
    return (
      <Callout icon={LockOpen} title="Diseño desbloqueado">
        <p>El owner desbloqueó el diseño con el ejercicio ya lanzado. Vuelva a bloquearlo cuando termine el ajuste.</p>
        {canLock ? (
          <Button
            size="sm"
            className="mt-2"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await lockDesign(programId, experimentId);
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success("Diseño bloqueado", { description: "Hágale pues, a medir." });
                  router.refresh();
                }
              })
            }
          >
            <Lock aria-hidden /> Bloquear de nuevo
          </Button>
        ) : null}
      </Callout>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-wash px-3 py-2 text-sm">
      <Lock className="size-4" aria-hidden />
      <span>
        <strong>Diseño bloqueado</strong> desde {formatDateTime(lockedAt)}: variantes, métricas, duración y regla de decisión son de solo
        lectura.
      </span>
      {canUnlock ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="ml-auto">
              <LockOpen aria-hidden /> Desbloquear
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Desbloquear el diseño</DialogTitle>
              <DialogDescription>
                El diseño se define antes de lanzar y no se reinterpreta después. Si lo desbloquea, queda registrado en la actividad con su justificación.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="unlock-justification">Justificación (obligatoria)</Label>
              <Textarea id="unlock-justification" rows={3} placeholder="¿Qué hay que ajustar y por qué?" value={justification} onChange={(e) => setJustification(e.target.value)} />
            </div>
            {error ? <Callout title="No se pudo desbloquear">{error}</Callout> : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                disabled={justification.trim().length < 10 || pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await unlockDesign(programId, experimentId, justification);
                    if (!r.ok) {
                      setError(r.error);
                      return;
                    }
                    setOpen(false);
                    toast.success("Diseño desbloqueado", { description: "Sin afán, pero no se le olvide volver a bloquearlo." });
                    router.refresh();
                  })
                }
              >
                {pending ? <Spinner /> : null} Desbloquear
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
