import { FileText, Pencil, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Callout, PageHeader } from "@/components/app/page";
import { ViewTabs } from "@/components/app/view-tabs";
import { DemoBadge } from "@/components/app/status-badge";
import { PilotActions } from "@/components/pilots/detail/pilot-actions";
import { PilotDataTab } from "@/components/pilots/detail/pilot-data-tab";
import { PilotLogTab } from "@/components/pilots/detail/pilot-log-tab";
import { PilotReadingTab } from "@/components/pilots/detail/pilot-reading-tab";
import { PilotDesignTab, PilotOperationTab, PilotSummaryTab } from "@/components/pilots/detail/pilot-summary-tab";
import { PilotStatusBadge, PilotTestTypeBadge } from "@/components/pilots/pilot-badges";
import { PilotTiaDraft } from "@/components/pilots/pilot-tia-drafts";
import { Button } from "@/components/ui/button";
import { availableActions, canEditDesign, canLoadData, canWritePilots, isPilotApprover, nextStepHint, PILOT_PATH, pathIndex } from "@/domain/pilots/flow";
import { PILOT_STATUS_LABEL } from "@/domain/pilots/labels";
import { describeOverlap, overlapsFor } from "@/domain/pilots/overlap";
import { PILOT_WINNER_PROBABILITY } from "@/domain/pilots/reading";
import { cn } from "@/lib/utils";
import { getPilotContext, isPilotsReady } from "@/server/pilot-auth";
import { analyzePilotDetail } from "@/server/pilot-reading";
import { listPilotMembers, listPilots, loadLinkOptions, loadPilotCatalogs, loadPilotDetail, loadPilotDrafts } from "@/server/queries/pilots";

export const metadata: Metadata = { title: "Piloto" };

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "diseno", label: "Diseño" },
  { key: "chequeo", label: "Chequeo e incidentes" },
  { key: "datos", label: "Datos" },
  { key: "lectura", label: "Lectura" },
  { key: "bitacora", label: "Bitácora" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function PilotPage({ params, searchParams }: PageProps<"/pilotos/[pilotId]">) {
  const { actor } = await getPilotContext();
  if (!actor.role || !(await isPilotsReady())) return null;
  const { pilotId } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === rawTab) ? (rawTab as TabKey) : "resumen";

  const [detail, catalogs, all] = await Promise.all([loadPilotDetail(pilotId), loadPilotCatalogs(), listPilots()]);
  if (!detail) notFound();
  const { pilot: p } = detail;

  const self = all.find((x) => x.id === pilotId)?.summary;
  const overlaps = self
    ? overlapsFor(
        self,
        all.map((x) => x.summary),
      ).map((o) => ({ otherId: o.otherId, otherTitle: o.otherTitle, text: describeOverlap(o) }))
    : [];
  const analysis = analyzePilotDetail(detail, catalogs);
  const best = analysis?.primary?.comparisons.find((c) => c.armId === analysis.primary?.bestArmId);
  const idx = pathIndex(p.status);
  const checklistPending = detail.checklist.filter((c) => c.status !== "ok").length;

  const tabContent = async () => {
    switch (tab) {
      case "diseno":
        return <PilotDesignTab detail={detail} catalogs={catalogs} />;
      case "chequeo":
        return <PilotOperationTab detail={detail} actor={actor} />;
      case "datos":
        return <PilotDataTab detail={detail} catalogs={catalogs} canLoad={canLoadData(actor, p.status) && !p.deleted_at} />;
      case "lectura": {
        const drafts = await loadPilotDrafts(pilotId);
        return (
          <div className="space-y-6">
            <PilotReadingTab detail={detail} catalogs={catalogs} actor={actor} />
            <PilotTiaDraft pilotId={pilotId} kind="conclusion" draft={drafts.find((d) => d.kind === "conclusion") ?? null} canWrite={canWritePilots(actor)} />
          </div>
        );
      }
      case "bitacora":
        return <PilotLogTab detail={detail} catalogs={catalogs} />;
      default: {
        const [linkOptions, members] = await Promise.all([loadLinkOptions(), listPilotMembers()]);
        return <PilotSummaryTab detail={detail} catalogs={catalogs} actor={actor} overlaps={overlaps} linkOptions={linkOptions} members={members} />;
      }
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={
          <Link href="/pilotos" className="hover:underline">
            Pilotos de medios
          </Link>
        }
        title={p.title}
        description={nextStepHint(actor, p.status)}
        actions={
          <>
            {canEditDesign(actor, p.status) && !p.deleted_at ? (
              <Button variant="outline" asChild className="min-h-11">
                <Link href={`/pilotos/${pilotId}/editar`}>
                  <Pencil aria-hidden /> Editar diseño
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" asChild className="min-h-11">
              <Link href={`/pilotos/${pilotId}/ficha`}>
                <FileText aria-hidden /> Ficha para gerencia
              </Link>
            </Button>
          </>
        }
      />

      {p.deleted_at ? (
        <Callout icon={Trash2} title="Este piloto está borrado" className="mb-6">
          No aparece en el portafolio. {isPilotApprover(actor) ? "Puede restaurarlo con el botón de abajo." : "Un aprobador lo puede restaurar."}
        </Callout>
      ) : null}

      <section className="mb-6 rounded-2xl border bg-paper p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <PilotStatusBadge status={p.status} className="h-7 text-sm" />
          <PilotTestTypeBadge testType={p.test_type} />
          {p.is_example ? <DemoBadge /> : null}
        </div>
        {idx >= 0 ? (
          <ol className="mt-4 grid grid-cols-6 gap-1" aria-label="Avance del piloto">
            {PILOT_PATH.map((s, i) => (
              <li key={s} className="min-w-0">
                <div className={cn("fill-in h-1.5 rounded-full", i <= idx ? (s === "in_test" && i === idx ? "bg-highlight" : "bg-ink") : "bg-gray-1")} />
                <div className={cn("mt-1 truncate text-[11px]", i === idx ? "font-semibold text-ink" : "text-soft")}>{PILOT_STATUS_LABEL[s]}</div>
              </li>
            ))}
          </ol>
        ) : null}
        <div className="mt-4">
          <PilotActions
            pilotId={pilotId}
            title={p.title}
            actions={p.deleted_at ? [] : availableActions(actor, p)}
            deleted={!!p.deleted_at}
            canRestore={isPilotApprover(actor)}
            missing={detail.missing}
            overlaps={overlaps.map((o) => `${o.otherTitle}: ${o.text}`)}
            checklist={{ total: detail.checklist.length, pending: checklistPending }}
            plannedStart={p.planned_start}
            actualStart={p.actual_start}
            suggestion={analysis?.suggestion ?? null}
            reliableWinner={best?.probabilityBetter != null && best.probabilityBetter >= PILOT_WINNER_PROBABILITY}
          />
        </div>
      </section>

      <ViewTabs
        label="Secciones del piloto"
        active={tab}
        tabs={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          href: `/pilotos/${pilotId}?tab=${t.key}`,
          attention:
            (t.key === "chequeo" && checklistPending > 0 && (p.status === "approved" || p.status === "draft" || p.status === "in_review")) ||
            (t.key === "resumen" && overlaps.length > 0),
        }))}
      />

      <div key={tab} className="slide-in">
        {await tabContent()}
      </div>
    </div>
  );
}
