import { Columns3, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Callout, EmptyState } from "@/components/app/page";
import { DashboardFrame, FilteredOutNote } from "@/components/dashboards/dashboard-frame";
import { Kanban, type KanbanCardData } from "@/components/dashboards/kanban";
import { Button } from "@/components/ui/button";
import { daysInStatus } from "@/domain/lifecycle";
import { loadDashboard } from "../_lib/data";

export const metadata: Metadata = { title: "Kanban" };

export default async function KanbanPage({ params, searchParams }: PageProps<"/programas/[programId]/tableros/kanban">) {
  const { programId } = await params;
  const data = await loadDashboard(programId, await searchParams);
  const now = new Date();

  const cards: KanbanCardData[] = [...data.filtered]
    .sort((a, b) => (b.final_score ?? -Infinity) - (a.final_score ?? -Infinity))
    .map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      lineName: e.line_name,
      ownerId: e.owner_id,
      ownerName: e.owner_name,
      finalScore: e.final_score,
      days: daysInStatus(e.status_changed_at, now),
      statusChangedAt: e.status_changed_at,
    }));

  const readOnly = !data.actor.isAdmin && data.actor.role === "viewer";

  return (
    <DashboardFrame
      programId={programId}
      active="kanban"
      title="Kanban"
      description="Una columna por estado. Arrastra una tarjeta para intentar la transición: si falta algo verás el motivo y la tarjeta no se mueve."
      fields={data.globalFields}
      current={data.current}
      query={data.query}
    >
      {data.experiments.length === 0 ? (
        <EmptyState
          icon={Columns3}
          title="Aún no hay ejercicios"
          description="Cada ejercicio aparece como tarjeta en la columna de su estado. Crea el primero desde un problema con evidencia."
          action={
            <Button asChild variant="outline">
              <Link href={`/programas/${programId}/ejercicios`}>Ir al backlog</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {readOnly ? (
            <Callout icon={Info} tone="neutral">
              Tu rol es de solo lectura: puedes ver el tablero, pero no mover tarjetas.
            </Callout>
          ) : (
            <p className="text-xs text-soft">
              Arrastra con el mouse o, con teclado, enfoca el asa de la tarjeta y pulsa espacio. Pasar a Decidido exige veredicto,
              decisión y aprendizaje: regístralos desde el detalle del ejercicio.
            </p>
          )}
          {cards.length === 0 ? (
            <EmptyState
              icon={Columns3}
              title="Ningún ejercicio coincide"
              description={
                <>
                  No hay tarjetas para mostrar.
                  <FilteredOutNote active={data.filtersActive} />
                </>
              }
            />
          ) : (
            <Kanban programId={programId} cards={cards} actor={data.actor} />
          )}
        </div>
      )}
    </DashboardFrame>
  );
}
