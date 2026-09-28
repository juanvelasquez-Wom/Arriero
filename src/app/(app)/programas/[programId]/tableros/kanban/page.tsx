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
      description="Cinco columnas, de lo que espera turno a lo cerrado. El número de arriba es cuánto hay contra el límite de trabajo en curso: si se pasa, cierre antes de abrir otro. Si a una tarjeta le falta algo para moverse, le decimos qué y se queda quieta, como mula terca."
      fields={data.globalFields}
      current={data.current}
      query={data.query}
    >
      {data.experiments.length === 0 ? (
        <EmptyState art="mula-cargada"
          icon={Columns3}
          title="Los ejercicios son los atajos. Todavía no hay ninguno."
          description="Cada ejercicio aparece como tarjeta en la columna de su estado. Cree el primero desde una oportunidad de mejora con evidencia."
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
              Su rol es de solo lectura: puede ver el tablero, pero no mover tarjetas.
            </Callout>
          ) : (
            <p data-explain className="text-xs text-soft">
              Arrastre la tarjeta o use «Mover a…». En el celular, sosténgala un momento antes de moverla; con teclado, enfoque el asa y
              pulse espacio. Pasar a Decidido pide veredicto, decisión y aprendizaje en el detalle del ejercicio.
            </p>
          )}
          {cards.length === 0 ? (
            <EmptyState art="celular-ruta"
              icon={Columns3}
              title="Ningún ejercicio coincide"
              description={
                <>
                  No hay tarjetas para mostrar. Ese camino no era.
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
