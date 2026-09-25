import type { ReactNode } from "react";
import { PageHeader } from "@/components/app/page";
import { DashboardFilters, type FilterField } from "./dashboard-filters";
import { DashboardNav, type DashboardKey } from "./dashboard-nav";

/** Encabezado común: título, pestañas entre tableros y filtros en la URL. */
export function DashboardFrame({
  programId,
  active,
  title,
  description,
  actions,
  fields,
  current,
  query,
  children,
}: {
  programId: string;
  active: DashboardKey;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  fields: FilterField[];
  current: Record<string, string>;
  query: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader eyebrow="Tableros" title={title} description={description} actions={actions} className="mb-4" />
      <DashboardNav programId={programId} active={active} query={query} />
      <DashboardFilters fields={fields} current={current} className="mt-4 mb-6" />
      {children}
    </div>
  );
}

/** Texto para estados vacíos cuando los filtros dejan el tablero sin datos. */
export function FilteredOutNote({ active }: { active: boolean }) {
  return active ? <> Revisa los filtros activos o usa «Limpiar filtros».</> : null;
}
