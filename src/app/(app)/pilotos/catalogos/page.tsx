import { Eye, Gauge, Plug, Radio, Shapes } from "lucide-react";
import type { Metadata } from "next";
import { Callout, PageHeader } from "@/components/app/page";
import { MediaTable } from "@/components/pilots/catalogs/media-table";
import { MetricsTable } from "@/components/pilots/catalogs/metrics-table";
import { IntegrationsPanel } from "@/components/pilots/integrations/integrations-panel";
import { VariablesCatalog } from "@/components/pilots/catalogs/variables-catalog";
import { SegmentLinks } from "@/components/pilots/portfolio/segment-links";
import { canWritePilots, isPilotApprover } from "@/domain/pilots/flow";
import { getPilotContext, isPilotsReady } from "@/server/pilot-auth";
import { mcpEnabled } from "@/server/integrations/mcp";
import { listIntegrationConnections, loadPilotCatalogs } from "@/server/queries/pilots";

export const metadata: Metadata = { title: "Catálogos de pilotos" };

const TABS = [
  { key: "medios", label: "Medios", icon: Radio },
  { key: "variables", label: "Variables", icon: Shapes },
  { key: "metricas", label: "Métricas", icon: Gauge },
  { key: "integraciones", label: "Integraciones", icon: Plug },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function PilotCatalogsPage({ searchParams }: PageProps<"/pilotos/catalogos">) {
  const { actor } = await getPilotContext();
  if (!actor.role || !(await isPilotsReady())) return null;
  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : "medios";
  const [catalogs, connections] = await Promise.all([loadPilotCatalogs(), tab === "integraciones" ? listIntegrationConnections() : Promise.resolve([])]);
  const canWrite = canWritePilots(actor);
  const isApprover = isPilotApprover(actor);

  return (
    <div>
      <PageHeader
        eyebrow="Pilotos de medios"
        title="Catálogos"
        description="Los medios, las variables que se pueden probar (con el tipo de prueba que Arriero recomienda), las métricas con que se leen los pilotos y las cuentas conectadas."
        actions={
          <SegmentLinks
            label="Catálogo"
            options={TABS.map((t) => ({ href: `/pilotos/catalogos?tab=${t.key}`, label: t.label, active: t.key === tab, icon: t.icon }))}
          />
        }
      />

      {!canWrite ? (
        <Callout tone="neutral" icon={Eye} className="mb-4">
          Su rol es de lectura: puede consultar los catálogos, pero no cambiarlos.
        </Callout>
      ) : null}

      <div className="rise">
        {tab === "medios" ? (
          <MediaTable media={catalogs.media} canWrite={canWrite} isApprover={isApprover} />
        ) : tab === "integraciones" ? (
          <IntegrationsPanel connections={connections} enabled={mcpEnabled()} isApprover={isApprover} />
        ) : tab === "variables" ? (
          <VariablesCatalog variables={catalogs.variables} isApprover={isApprover} />
        ) : (
          <MetricsTable metrics={catalogs.metrics} media={catalogs.media} canWrite={canWrite} isApprover={isApprover} />
        )}
      </div>
    </div>
  );
}
