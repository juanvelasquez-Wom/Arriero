import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/app/page";
import { FunnelTab } from "@/components/lines/funnel-tab";
import { LineTabs, parseLineTab } from "@/components/lines/line-tabs";
import { metricOptionLabel } from "@/components/lines/metric-badges";
import { NorthStarTab } from "@/components/lines/north-star-tab";
import { parseTreeView, TreeTab } from "@/components/lines/tree-tab";
import { ROLE_LABEL } from "@/domain/labels";
import { isWithin, todayIso } from "@/domain/dates";
import { can } from "@/domain/permissions";
import { getProgramContext } from "@/server/auth";
import { listExperiments } from "@/server/queries/experiments";
import { listHorizons, listLines, listMembers } from "@/server/queries/programs";
import { listMetrics, listMetricValues, listProblems, listStages } from "@/server/queries/structure";

export async function generateMetadata({ params }: PageProps<"/programas/[programId]/lineas/[lineId]">): Promise<Metadata> {
  const { programId, lineId } = await params;
  const lines = await listLines(programId).catch(() => []);
  const line = lines.find((l) => l.id === lineId);
  return { title: line ? `Línea · ${line.name}` : "Línea" };
}

export default async function LinePage({ params, searchParams }: PageProps<"/programas/[programId]/lineas/[lineId]">) {
  const { programId, lineId } = await params;
  const sp = await searchParams;
  const tab = parseLineTab(sp.tab);
  const ctx = await getProgramContext(programId);
  const lines = await listLines(programId);
  const line = lines.find((l) => l.id === lineId);
  if (!line) notFound();

  const canEdit = can.editStructure(ctx.actor);
  const canDelete = can.deleteStructure(ctx.actor);
  const baseHref = `/programas/${programId}/lineas/${lineId}`;

  const [metrics, horizons, members] = await Promise.all([
    listMetrics({ lineId }),
    listHorizons(programId),
    tab === "embudo" ? Promise.resolve([]) : listMembers(programId),
  ]);
  const today = todayIso();
  const currentHorizonId = horizons.find((h) => isWithin(today, h.start_date, h.end_date))?.id ?? null;
  const memberOptions = members.map((m) => ({ id: m.user_id, label: `${m.name} · ${ROLE_LABEL[m.role]}` }));

  let content: ReactNode;
  if (tab === "norte") {
    const headline = metrics.filter((m) => m.type === "north_star" || m.type === "efficiency");
    const values = headline.length ? await listMetricValues({ metricIds: headline.map((m) => m.id) }) : [];
    content = (
      <NorthStarTab
        programId={programId}
        lineId={lineId}
        metrics={headline}
        values={values}
        horizons={horizons}
        currentHorizonId={currentHorizonId}
        members={memberOptions}
        canEdit={canEdit}
      />
    );
  } else if (tab === "arbol") {
    content = (
      <TreeTab
        programId={programId}
        lineId={lineId}
        baseHref={baseHref}
        view={parseTreeView(sp.vista)}
        metrics={metrics}
        members={memberOptions}
        horizons={horizons}
        currentHorizonId={currentHorizonId}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    );
  } else {
    const [stages, problems, experiments] = await Promise.all([
      listStages({ lineId }),
      listProblems(programId),
      listExperiments(programId),
    ]);
    content = (
      <FunnelTab
        programId={programId}
        lineId={lineId}
        stages={stages}
        problems={problems.filter((p) => p.line_id === lineId)}
        experiments={experiments.filter((e) => e.line_id === lineId)}
        metricOptions={metrics.map((m) => ({ id: m.id, label: metricOptionLabel(m) }))}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Línea de negocio"
        title={line.name}
        description={
          canEdit
            ? "Métrica norte, árbol de métricas y embudo de la línea. Los cambios se ven de inmediato en problemas, ejercicios y tableros."
            : "Métrica norte, árbol de métricas y embudo de la línea. Con su rol puede consultarlos, no editarlos."
        }
      />
      <LineTabs baseHref={baseHref} active={tab} />
      {content}
    </div>
  );
}
