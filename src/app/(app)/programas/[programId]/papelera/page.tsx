import { Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/app/page";
import { TrashTable, type TrashRow } from "@/components/app/trash-table";
import { can } from "@/domain/permissions";
import { getProgramContext } from "@/server/auth";
import { listTrash } from "@/server/queries/programs";

export const metadata: Metadata = { title: "Papelera" };

export default async function TrashPage({ params }: PageProps<"/programas/[programId]/papelera">) {
  const { programId } = await params;
  const ctx = await getProgramContext(programId);
  if (!can.viewTrash(ctx.actor)) redirect(`/programas/${programId}`);
  const rows: TrashRow[] = await listTrash(programId);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Papelera"
        description="Lo borrado desaparece de todas las vistas y tableros y queda aquí 30 días. Después se elimina de forma definitiva, con sus archivos."
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title="No cargue por cargar: la papelera está vacía"
          description="Cuando alguien borre un elemento del programa, lo podrá restaurar desde aquí durante 30 días."
        />
      ) : (
        <TrashTable programId={programId} rows={rows} canPurge={can.emptyTrash(ctx.actor)} />
      )}
    </div>
  );
}
