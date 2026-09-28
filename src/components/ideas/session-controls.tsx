"use client";

import { ArrowRight, MoreHorizontal, Pencil, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { celebrate } from "@/components/brand/celebrate";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PHASE_LABEL, type PhaseMove } from "@/domain/ideas";
import { deleteIdeaSession, setIdeaSessionPhase } from "@/server/actions/ideas";
import { SessionForm, type SessionFormValues } from "./session-form";

/** Botones de quien armó el aguacero: mover la fase, corregir el reto y borrarlo. */
export function SessionControls({ sessionId, moves, initial }: { sessionId: string; moves: PhaseMove[]; initial: SessionFormValues }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {moves.map((m) => (
        <ConfirmAction
          key={m.to}
          title={`¿Pasar a «${PHASE_LABEL[m.to]}»?`}
          description={m.confirm}
          confirmLabel={m.label}
          onConfirm={async () => {
            const r = await setIdeaSessionPhase(sessionId, m.to);
            if (!r.ok) return r.error;
            if (m.to === "closed") celebrate(r.message ?? "¡Eso!", "Ahora a decidir qué se vuelve trabajo.");
            else toast.success(r.message);
            router.refresh();
          }}
        >
          <Button variant={m.primary ? "default" : "outline"} size={m.primary ? "default" : "sm"}>
            {m.primary ? <ArrowRight aria-hidden className="size-4" /> : <Undo2 aria-hidden className="size-4" />}
            {m.label}
          </Button>
        </ConfirmAction>
      ))}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Otras opciones del aguacero">
            <MoreHorizontal aria-hidden className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil aria-hidden className="size-4" /> Corregir el reto
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden className="size-4" /> Borrar el aguacero
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Corregir el aguacero</DialogTitle>
            <DialogDescription>El reto, el contexto, la línea y la fecha. La fase se cambia con los botones.</DialogDescription>
          </DialogHeader>
          <SessionForm sessionId={sessionId} initial={initial} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Borrar el aguacero?</DialogTitle>
            <DialogDescription>Se van el reto, las ideas y los puntajes para todos. Lo que ya se volvió proyecto, piloto o insight se queda.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Mejor no
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const r = await deleteIdeaSession(sessionId);
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success(r.message);
                setConfirmDelete(false);
                router.push("/ideas");
              }}
            >
              Sí, borrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
