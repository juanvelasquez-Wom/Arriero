import "server-only";
import type { FilterField } from "@/components/dashboards/dashboard-filters";
import {
  UNASSIGNED_OWNER,
  filterExperiments,
  firstParam,
  globalFiltersQuery,
  hasActiveFilters,
  parseDashboardFilters,
  type RawSearchParams,
} from "@/domain/dashboard-filters";
import { todayIso } from "@/domain/dates";
import { formatDateRange } from "@/domain/format";
import { STATUS_LABEL } from "@/domain/labels";
import { STATUS_ORDER } from "@/domain/lifecycle";
import { getProgramContext } from "@/server/auth";
import { listExperiments } from "@/server/queries/experiments";
import { listCalendar, listHorizons, listLines, listMembers } from "@/server/queries/programs";

/**
 * Datos comunes de los cuatro tableros: contexto, catálogos para los filtros
 * y ejercicios ya filtrados. Siempre se lee fresco (las vistas son dinámicas).
 */
export async function loadDashboard(programId: string, searchParams: RawSearchParams) {
  const ctx = await getProgramContext(programId);
  const [lines, horizons, members, calendar, experiments] = await Promise.all([
    listLines(programId),
    listHorizons(programId),
    listMembers(programId),
    listCalendar(programId),
    listExperiments(programId),
  ]);
  const today = todayIso();
  const filters = parseDashboardFilters(searchParams);
  const filtered = filterExperiments(experiments, filters, horizons, today);

  // Responsables: miembros del programa y cualquier responsable que ya no sea miembro.
  const owners = new Map(members.map((m) => [m.user_id, m.name || m.email]));
  for (const e of experiments) if (e.owner_id && !owners.has(e.owner_id)) owners.set(e.owner_id, e.owner_name ?? "Sin nombre");

  const globalFields: FilterField[] = [
    { key: "linea", label: "Línea", options: lines.map((l) => ({ value: l.id, label: l.name })) },
    { key: "estado", label: "Estado", options: STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] })) },
    {
      key: "responsable",
      label: "Responsable",
      options: [
        ...[...owners].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "es")),
        { value: UNASSIGNED_OWNER, label: "Sin responsable" },
      ],
    },
    {
      key: "horizonte",
      label: "Horizonte",
      options: horizons.map((h) => ({ value: h.id, label: `${h.name} · ${formatDateRange(h.start_date, h.end_date)}` })),
    },
  ];

  const current: Record<string, string> = {};
  for (const [k, v] of Object.entries(searchParams)) {
    const value = firstParam(v);
    if (value) current[k] = value;
  }

  return {
    ...ctx,
    programId,
    lines,
    horizons,
    members,
    calendar,
    experiments,
    filtered,
    filters,
    filtersActive: hasActiveFilters(filters),
    globalFields,
    current,
    query: globalFiltersQuery(filters),
    today,
  };
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>;
