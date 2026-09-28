import { LayoutGrid, List, Plus, Radar } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CountUp } from "@/components/app/count-up";
import { EmptyState, PageHeader, Stat } from "@/components/app/page";
import { UrlFilters } from "@/components/app/url-filters";
import { DateRangeFilter } from "@/components/pilots/portfolio/date-range-filter";
import { DeletedPilots } from "@/components/pilots/portfolio/deleted-pilots";
import { ExampleControls } from "@/components/pilots/portfolio/example-controls";
import { PilotCards, PilotTable, type PortfolioItem } from "@/components/pilots/portfolio/pilot-list";
import { SegmentLinks, hrefWith } from "@/components/pilots/portfolio/segment-links";
import { Button } from "@/components/ui/button";
import { formatPercent } from "@/domain/format";
import { canWritePilots, isPilotApprover } from "@/domain/pilots/flow";
import { PILOT_STATUS_LABEL, PILOT_TEST_TYPE_LABEL, VARIABLE_CATEGORY_LABEL } from "@/domain/pilots/labels";
import {
  RESULT_PILOT_STATUSES,
  activeFilterCount,
  channelOptions,
  filterPilots,
  headlineResult,
  parsePortfolioFilters,
  parsePortfolioView,
  portfolioKpis,
} from "@/domain/pilots/portfolio";
import { PILOT_STATUSES, PILOT_TEST_TYPES, VARIABLE_CATEGORIES } from "@/domain/pilots/types";
import { formatCop } from "@/domain/value";
import { getPilotContext, isPilotsReady } from "@/server/pilot-auth";
import { analyzePilotDetail } from "@/server/pilot-reading";
import {
  listPilots,
  loadPilotCatalogs,
  loadPilotDetailsBatch,
  type PilotCatalogs,
  type PilotDetail,
  type PilotListItem,
} from "@/server/queries/pilots";

export const metadata: Metadata = { title: "Portafolio de pilotos" };

/** Muestras de Monte Carlo en el portafolio: bastan para el titular y cuestan menos que la ficha. */
const PORTFOLIO_DRAWS = 4000;
const PORTFOLIO_ITERATIONS = 2000;

/** Lectura de la mejor variante de un piloto; si algo falla, el portafolio sigue sin ese dato. */
function resultOf(item: PilotListItem, detail: PilotDetail | undefined, catalogs: PilotCatalogs): PortfolioItem {
  const empty: PortfolioItem = { ...item, result: null, resultArmName: null };
  if (!detail || !RESULT_PILOT_STATUSES.includes(item.status)) return empty;
  try {
    const result = headlineResult(analyzePilotDetail(detail, catalogs, { draws: PORTFOLIO_DRAWS, iterations: PORTFOLIO_ITERATIONS }));
    return { ...item, result, resultArmName: result ? (detail.arms.find((a) => a.id === result.armId)?.name ?? null) : null };
  } catch {
    return empty;
  }
}

export default async function PilotsPortfolioPage({ searchParams }: PageProps<"/pilotos">) {
  const { actor } = await getPilotContext();
  if (!actor.role || !(await isPilotsReady())) return null;
  const sp = await searchParams;
  const approver = isPilotApprover(actor);
  const writer = canWritePilots(actor);

  const [all, catalogs] = await Promise.all([listPilots({ includeDeleted: approver }), loadPilotCatalogs()]);
  const pilots = all.filter((p) => !p.deleted_at);
  const deleted = all.filter((p) => p.deleted_at);
  const filters = parsePortfolioFilters(sp);
  const view = parsePortfolioView(sp);
  const filtered = filterPilots(pilots, filters);
  const details = await loadPilotDetailsBatch(filtered.filter((p) => RESULT_PILOT_STATUSES.includes(p.status)).map((p) => p.id));
  const items = filtered.map((p) => resultOf(p, details.get(p.id), catalogs));
  const kpis = portfolioKpis(filtered);
  const hasExamples = pilots.some((p) => p.is_example);
  const owners = [...new Map(pilots.filter((p) => p.owner_id).map((p) => [p.owner_id!, p.owner_name ?? "Sin nombre"])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1], "es-CO"),
  );

  const newPilot = writer ? (
    <Button asChild>
      <Link href="/pilotos/nuevo">
        <Plus aria-hidden /> Nuevo piloto
      </Link>
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader
        eyebrow="Pilotos de medios"
        title="¿Qué estamos probando en medios?"
        description="Un piloto es una prueba controlada de un cambio en medios antes de escalarlo. Mide incrementalidad: lo que el cambio de verdad aporta, no solo las conversiones que se atribuye la plataforma."
        actions={
          pilots.length ? (
            <>
              {approver ? <ExampleControls hasExamples={hasExamples} /> : null}
              {newPilot}
            </>
          ) : null
        }
      />

      {pilots.length === 0 ? (
        <EmptyState
          art="carriel-experimentos"
          icon={Radar}
          title="¿Y por dónde es? Aún no hay pilotos"
          description={
            writer
              ? "Todo piloto arranca con un problema de medios y una hipótesis. El asistente lo lleva paso a paso, del problema a las reglas de decisión."
              : "Cuando el equipo cree el primer piloto, aquí va a ver qué se está probando, cuánto se invierte y qué resultó."
          }
          action={
            <>
              {newPilot}
              {approver ? (
                <div className="flex w-full flex-col items-center gap-1">
                  <ExampleControls hasExamples={false} />
                  <span className="text-xs text-soft">Cargue los 3 pilotos de ejemplo para ver el módulo andando.</span>
                </div>
              ) : null}
            </>
          }
        />
      ) : (
        <>
          <div className="stagger mb-6 grid gap-3 sm:grid-cols-3">
            <Stat label="Pilotos activos" value={<CountUp value={kpis.active} />} hint="Aprobados, en prueba o en lectura" highlight={kpis.active > 0} />
            <Stat
              label="Inversión en pilotos activos"
              value={formatCop(kpis.activePlannedCop)}
              hint={`Planeada. Ejecutada: ${formatCop(kpis.activeSpentCop)}`}
            />
            <Stat
              label="Tasa de pilotos escalados"
              value={kpis.scaledRate == null ? "—" : formatPercent(kpis.scaledRate)}
              hint={kpis.decided ? `${kpis.scaled} de ${kpis.decided} decididos se escalaron` : "Aún no hay pilotos decididos"}
            />
          </div>

          <UrlFilters
            filters={[
              { param: "estado", label: "Estado", options: PILOT_STATUSES.map((s) => ({ value: s, label: PILOT_STATUS_LABEL[s] })) },
              { param: "canal", label: "Canal", options: channelOptions(pilots).map((m) => ({ value: m, label: m })) },
              { param: "variable", label: "Variable", options: VARIABLE_CATEGORIES.map((c) => ({ value: c, label: VARIABLE_CATEGORY_LABEL[c] })) },
              { param: "tipo", label: "Tipo de prueba", options: PILOT_TEST_TYPES.map((t) => ({ value: t, label: PILOT_TEST_TYPE_LABEL[t] })) },
              { param: "responsable", label: "Responsable", options: owners.map(([id, name]) => ({ value: id, label: name })) },
            ]}
          />
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <DateRangeFilter legend="Fechas del piloto" />
            <SegmentLinks
              label="Cómo ver los pilotos"
              options={[
                { href: hrefWith("/pilotos", sp, "vista", null), label: "Lista", active: view === "lista", icon: List },
                { href: hrefWith("/pilotos", sp, "vista", "tarjetas"), label: "Tarjetas", active: view === "tarjetas", icon: LayoutGrid },
              ]}
            />
          </div>

          {items.length === 0 ? (
            <p className="rounded-2xl border border-dashed bg-paper py-10 text-center text-sm text-soft">
              Ningún piloto coincide con {activeFilterCount(filters) === 1 ? "el filtro" : "los filtros"}. Ese camino no era: pruebe con otros.
            </p>
          ) : view === "tarjetas" ? (
            <PilotCards items={items} />
          ) : (
            <PilotTable items={items} />
          )}
          <p className="mt-3 text-xs text-soft">
            {items.length} de {pilots.length} {pilots.length === 1 ? "piloto" : "pilotos"}. El resultado es el de la mejor variante frente al control, con los
            datos cargados hasta hoy.
          </p>
        </>
      )}

      {approver && deleted.length ? (
        <DeletedPilots items={deleted.map((p) => ({ id: p.id, title: p.title, status: p.status, deleted_at: p.deleted_at! }))} />
      ) : null}
    </div>
  );
}
