"use client";

import { ArrowDown, ArrowUp, Check, Pencil, Plus, Waypoints } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DeleteButton } from "@/components/app/delete-button";
import { EmptyState } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { advanceSetup, createLine, moveLine, renameLine } from "@/server/actions/programs";

export function LinesStep({
  programId,
  lines,
  canEdit,
  canDelete,
}: {
  programId: string;
  lines: { id: string; name: string }[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) {
    setError(undefined);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.message) toast.success(r.message);
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {lines.length === 0 ? (
        <EmptyState
          icon={Waypoints}
          title="Agrega la primera línea de negocio"
          description="Cada línea (por ejemplo Pospago o Recargas) tiene su métrica norte, su árbol de métricas y su embudo. Al crearla se proponen cuatro etapas editables: Adquisición, Activación, Conversión y Recuperación y recurrencia."
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-paper">
          {lines.map((l, i) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              {editing?.id === l.id ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => renameLine(programId, l.id, { name: editing.name }), () => setEditing(null));
                  }}
                >
                  <Label htmlFor={`rename-${l.id}`} className="sr-only">
                    Nuevo nombre
                  </Label>
                  <Input
                    id={`rename-${l.id}`}
                    value={editing.name}
                    onChange={(e) => setEditing({ id: l.id, name: e.target.value })}
                    autoFocus
                  />
                  <Button size="sm" type="submit" disabled={pending}>
                    <Check aria-hidden /> Guardar
                  </Button>
                  <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex-1 font-medium">{l.name}</span>
                  {canEdit ? (
                    <>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Subir ${l.name}`}
                        disabled={i === 0 || pending}
                        onClick={() => run(() => moveLine(programId, l.id, "up"))}
                      >
                        <ArrowUp aria-hidden />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Bajar ${l.name}`}
                        disabled={i === lines.length - 1 || pending}
                        onClick={() => run(() => moveLine(programId, l.id, "down"))}
                      >
                        <ArrowDown aria-hidden />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ id: l.id, name: l.name })}>
                        <Pencil aria-hidden /> Renombrar
                      </Button>
                    </>
                  ) : null}
                  {canDelete ? <DeleteButton entity="line" id={l.id} programId={programId} name={l.name} variant="ghost" /> : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createLine(programId, { name }), () => setName(""));
          }}
        >
          <div className="min-w-60 flex-1 space-y-1.5">
            <Label htmlFor="new-line">Nueva línea</Label>
            <Input id="new-line" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pospago, Recargas y paquetes…" />
          </div>
          <Button type="submit" variant="outline" disabled={pending || name.trim().length < 2}>
            {pending ? <Spinner /> : <Plus aria-hidden />} Agregar línea
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => router.push(`/programas/${programId}/configuracion?paso=1`)}>
          Anterior
        </Button>
        <Button
          disabled={lines.length === 0 || pending}
          onClick={() =>
            startTransition(async () => {
              await advanceSetup(programId, 2);
              router.push(`/programas/${programId}/configuracion?paso=3`);
            })
          }
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
