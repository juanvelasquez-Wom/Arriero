"use client";

import { Archive, ArchiveRestore, BadgeCheck, ClipboardList, FolderPlus, Hand, Megaphone, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { deleteInsight, setInsightStatus, toggleInsightVote } from "@/server/actions/insights";

export interface ProgramOption {
  id: string;
  name: string;
  isDemo: boolean;
  lines: { id: string; name: string }[];
}

/** «Yo también lo he visto»: el voto de otras personas es la evidencia de que no es un caso aislado. */
export function VoteButton({ id, votes, voted, mine }: { id: string; votes: number; voted: boolean; mine: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(voted);
  const [count, setCount] = useState(votes);
  const [pending, start] = useTransition();
  if (mine) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-soft tabular-nums" title="Votos de otras personas">
        <Hand aria-hidden className="size-3.5" /> {count} {count === 1 ? "también lo vio" : "también lo vieron"}
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={on}
      onClick={() => {
        const next = !on;
        setOn(next);
        setCount((c) => c + (next ? 1 : -1));
        start(async () => {
          const r = await toggleInsightVote(id, next);
          if (!r.ok) {
            setOn(!next);
            setCount((c) => c + (next ? -1 : 1));
            toast.error(r.error);
            return;
          }
          router.refresh();
        });
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tabular-nums transition-colors",
        on ? "border-transparent bg-highlight text-[#111111]" : "hover:bg-wash",
      )}
    >
      <Hand aria-hidden className={cn("size-3.5", on && "pop-in")} />
      {on ? "Usted también lo vio" : "Yo también lo he visto"} · {count}
    </button>
  );
}

/** Convertir en problema: elegir programa y línea, y seguir al formulario ya prellenado. */
function ToProblemDialog({ id, programs, open, onOpenChange }: { id: string; programs: ProgramOption[]; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const real = programs.filter((p) => !p.isDemo);
  const list = real.length ? real : programs;
  const [programId, setProgramId] = useState(list[0]?.id ?? "");
  const lines = list.find((p) => p.id === programId)?.lines ?? [];
  const [lineId, setLineId] = useState(lines[0]?.id ?? "");
  const lineOk = lines.some((l) => l.id === lineId) ? lineId : (lines[0]?.id ?? "");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convertir en problema</DialogTitle>
          <DialogDescription>Elija dónde vive. El problema arranca con el insight y su fuente; usted completa la etapa y la causa.</DialogDescription>
        </DialogHeader>
        {list.length === 0 ? (
          <p className="rounded-xl bg-wash px-3 py-2 text-sm">
            Usted no puede crear problemas en ningún programa todavía. Pídale al owner que lo sume como colaborador.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-sm font-semibold">Programa</div>
              <Select
                value={programId}
                onValueChange={(v) => {
                  setProgramId(v);
                  setLineId(list.find((p) => p.id === v)?.lines[0]?.id ?? "");
                }}
              >
                <SelectTrigger aria-label="Programa" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {list.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-1 text-sm font-semibold">Línea</div>
              <Select value={lineOk} onValueChange={setLineId}>
                <SelectTrigger aria-label="Línea" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {lines.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!programId || !lineOk}
            onClick={() => router.push(`/programas/${programId}/problemas/nuevo?insight=${id}&linea=${lineOk}`)}
          >
            <ClipboardList aria-hidden className="size-4" /> Seguir al problema
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface InsightPerms {
  toProblem: boolean;
  toProgram: boolean;
  toPilot: boolean;
  validate: boolean;
  archive: boolean;
  reopen: boolean;
  edit: boolean;
  remove: boolean;
}

/** Botones de sembrar (grandes) y el menú de lo demás. */
export function InsightActions({ id, perms, programs, compact = false }: { id: string; perms: InsightPerms; programs: ProgramOption[]; compact?: boolean }) {
  const router = useRouter();
  const [problemOpen, setProblemOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.message) toast.success(r.message);
      after?.();
      router.refresh();
    });

  const hasMenu = perms.validate || perms.archive || perms.reopen || perms.edit || perms.remove;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {perms.toProblem ? (
        <Button size={compact ? "sm" : "default"} onClick={() => setProblemOpen(true)}>
          <ClipboardList aria-hidden className="size-4" /> Convertir en problema
        </Button>
      ) : null}
      {perms.toProgram ? (
        <Button size={compact ? "sm" : "default"} variant="outline" asChild>
          <Link href={`/programas/nuevo?insight=${id}`}>
            <FolderPlus aria-hidden className="size-4" /> Armar proyecto
          </Link>
        </Button>
      ) : null}
      {perms.toPilot ? (
        <Button size={compact ? "sm" : "default"} variant="outline" asChild>
          <Link href={`/pilotos/nuevo?insight=${id}`}>
            <Megaphone aria-hidden className="size-4" /> Crear piloto
          </Link>
        </Button>
      ) : null}
      {hasMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size={compact ? "sm" : "default"} aria-label="Más acciones" disabled={pending}>
              <MoreHorizontal aria-hidden className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {perms.edit ? (
              <DropdownMenuItem asChild>
                <Link href={`/insights/${id}?editar=1`}>
                  <Pencil className="size-4" aria-hidden /> Editar
                </Link>
              </DropdownMenuItem>
            ) : null}
            {perms.validate ? (
              <DropdownMenuItem onSelect={() => run(() => setInsightStatus(id, "validated"))}>
                <BadgeCheck className="size-4" aria-hidden /> Marcar como validado
              </DropdownMenuItem>
            ) : null}
            {perms.archive ? (
              <DropdownMenuItem onSelect={() => run(() => setInsightStatus(id, "archived"))}>
                <Archive className="size-4" aria-hidden /> Archivar
              </DropdownMenuItem>
            ) : null}
            {perms.reopen ? (
              <DropdownMenuItem onSelect={() => run(() => setInsightStatus(id, "new"))}>
                <ArchiveRestore className="size-4" aria-hidden /> Reabrir
              </DropdownMenuItem>
            ) : null}
            {perms.remove ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" aria-hidden /> Borrar
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {perms.toProblem ? <ToProblemDialog id={id} programs={programs} open={problemOpen} onOpenChange={setProblemOpen} /> : null}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Borrar este insight?</DialogTitle>
            <DialogDescription>Se va del carriel para todos. Si solo ya no aplica, mejor archívelo.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Mejor no
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => deleteInsight(id), () => { setConfirmDelete(false); router.push("/insights"); })}
            >
              Sí, borrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
