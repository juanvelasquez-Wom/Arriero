"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Button } from "@/components/ui/button";
import { daysLeftInTrash } from "@/domain/deletion";
import { formatDateTime } from "@/domain/format";
import { purgeTrashItem, restoreTrashItem } from "@/server/actions/trash";
import type { DeletedProgram } from "@/server/queries/programs";

export function DeletedPrograms({ items }: { items: DeletedProgram[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function restore(item: DeletedProgram) {
    startTransition(async () => {
      const r = await restoreTrashItem(item.trashId);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(`“${item.name}” volvió al camino`);
        router.refresh();
      }
    });
  }

  return (
    <section className="mt-10">
      <h2 className="text-base font-bold">Programas en la papelera</h2>
      <p className="mt-0.5 text-xs text-soft">Se eliminan de forma definitiva a los 30 días.</p>
      <ul className="mt-3 divide-y rounded-2xl border bg-paper shadow-card">
        {items.map((item) => (
          <li key={item.trashId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="font-semibold">{item.name}</div>
              <div className="text-xs text-soft">
                Borrado {formatDateTime(item.deleted_at)}
                {item.deleted_by_name ? ` por ${item.deleted_by_name}` : ""} · quedan {daysLeftInTrash(item.deleted_at)} días
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => restore(item)}>
                <RotateCcw aria-hidden /> Restaurar
              </Button>
              <ConfirmAction
                title={`Eliminar definitivamente “${item.name}”`}
                description="Se borran el programa, todo su contenido y sus archivos. No se puede deshacer."
                confirmLabel="Eliminar definitivamente"
                onConfirm={async () => {
                  const r = await purgeTrashItem(item.trashId);
                  if (!r.ok) return r.error;
                  toast.success("Programa eliminado definitivamente. Listo pues.");
                  router.refresh();
                }}
              >
                <Button size="sm" variant="ghost">
                  <Trash2 aria-hidden /> Eliminar
                </Button>
              </ConfirmAction>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
