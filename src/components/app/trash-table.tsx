"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { daysLeftInTrash, ENTITY_LABEL, type DeletableEntity } from "@/domain/deletion";
import { formatDateTime } from "@/domain/format";
import { emptyTrash, purgeTrashItem, restoreTrashItem } from "@/server/actions/trash";

export interface TrashRow {
  id: string;
  entity_type: string;
  label: string;
  deleted_at: string;
  deleted_by: string | null;
}

export function TrashTable({ programId, rows, canPurge }: { programId: string; rows: TrashRow[]; canPurge: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [, startTransition] = useTransition();

  function restore(row: TrashRow) {
    setBusy(row.id);
    startTransition(async () => {
      const r = await restoreTrashItem(row.id, programId);
      setBusy(undefined);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(`“${row.label}” volvió al camino`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {canPurge ? (
        <div className="flex justify-end">
          <ConfirmAction
            title="Vaciar la papelera"
            description={`Se eliminan de forma definitiva ${rows.length} elemento(s), con todo lo que cuelga de ellos y sus archivos. No se puede deshacer.`}
            confirmLabel="Vaciar papelera"
            onConfirm={async () => {
              const r = await emptyTrash(programId);
              if (!r.ok) return r.error;
              toast.success("Papelera vaciada. No cargue por cargar.");
              router.refresh();
            }}
          >
            <Button variant="outline">
              <Trash2 aria-hidden /> Vaciar papelera
            </Button>
          </ConfirmAction>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border bg-paper shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Elemento</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Borrado</TableHead>
              <TableHead className="text-right">Días restantes</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium whitespace-normal">{row.label}</TableCell>
                <TableCell className="text-sm">{ENTITY_LABEL[row.entity_type as DeletableEntity] ?? row.entity_type}</TableCell>
                <TableCell className="text-sm">
                  {formatDateTime(row.deleted_at)}
                  <div className="text-xs text-soft">{row.deleted_by ?? "—"}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{daysLeftInTrash(row.deleted_at)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => restore(row)}>
                      {busy === row.id ? <Spinner /> : <RotateCcw aria-hidden />} Restaurar
                    </Button>
                    {canPurge ? (
                      <ConfirmAction
                        title={`Eliminar definitivamente “${row.label}”`}
                        description="Se borra con todo lo que dependía de este elemento, incluidos los archivos adjuntos. No se puede deshacer."
                        confirmLabel="Eliminar definitivamente"
                        onConfirm={async () => {
                          const r = await purgeTrashItem(row.id, programId);
                          if (!r.ok) return r.error;
                          toast.success("Eliminado definitivamente. Ese camino no era.");
                          router.refresh();
                        }}
                      >
                        <Button size="sm" variant="ghost">
                          <Trash2 aria-hidden /> Eliminar
                        </Button>
                      </ConfirmAction>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
