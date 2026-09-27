"use client";

import { CheckCircle2, ChevronDown, Circle, Filter, Network, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/app/form";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { LineTemplate } from "@/domain/growth-templates";
import { parseDecimal } from "@/domain/metric-tree";
import { saveLineStep } from "@/server/actions/setup";
import type { MetricRow, StageRow } from "@/server/queries/structure";
import { LINE_SECTION_HELP } from "../help-content";
import { InfoTip, UseExampleButton } from "../help";
import { StepFooter } from "../step-footer";
import { FunnelEditor, funnelConfigured, initialFunnelRows, type FunnelRow } from "./step-line-funnel";
import { badNumber, metricPayload, NorthEditor, toMetricDraft, type NorthState } from "./step-line-north";
import { initialTreeItems, TreeEditor, type TreeItem } from "./step-line-tree";

type SectionKey = "north" | "tree" | "funnel";
type HorizonRef = { id: string; name: string; start_date: string; end_date: string };

function Section({
  id,
  title,
  icon: Icon,
  help,
  summary,
  done,
  open,
  onOpenChange,
  children,
}: {
  id: SectionKey;
  title: string;
  icon: typeof Star;
  help: string;
  summary: string;
  done: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible data-section={id} open={open} onOpenChange={onOpenChange} className="rounded-2xl border bg-paper shadow-card">
      <div className="flex items-center gap-2 px-4 py-3 sm:px-5">
        <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-3 text-left">
          {done ? (
            <CheckCircle2 className="pop-in size-5 shrink-0" aria-label="Listo" />
          ) : (
            <Circle className="size-5 shrink-0 text-soft" aria-label="Por revisar" />
          )}
          <Icon className="wiggle-on-hover size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-heading text-lg font-bold">{title}</span>
            <span className="block truncate text-xs text-soft">{summary}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
        </CollapsibleTrigger>
        <InfoTip label={title}>{help}</InfoTip>
      </div>
      <CollapsibleContent className="slide-in px-4 pb-5 sm:px-5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * "Configurar {línea}": una sola pantalla con tres secciones desplegables
 * (métrica norte y eficiencia · árbol · embudo), prellenadas desde la plantilla
 * y guardadas juntas con un solo "Guarde y siga".
 */
export function StepLine({
  programId,
  line,
  metrics,
  stages,
  template,
  horizons,
  prevHref,
  nextHref,
  nextLabel,
  readOnly,
}: {
  programId: string;
  line: { id: string; name: string };
  metrics: MetricRow[];
  stages: StageRow[];
  template: LineTemplate;
  horizons: HorizonRef[];
  prevHref: string;
  nextHref: string;
  nextLabel: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const existingNorth = metrics.find((m) => m.type === "north_star");
  const existingEff = metrics.find((m) => m.type === "efficiency");
  const saved = {
    north: !!existingNorth,
    tree: metrics.some((m) => m.type === "input"),
    funnel: funnelConfigured(stages),
  };
  const [north, setNorth] = useState<NorthState>(() => ({
    north: toMetricDraft(existingNorth, template.northStar),
    eff: toMetricDraft(existingEff, template.efficiency),
    withEff: existingEff ? true : !existingNorth,
  }));
  const [tree, setTree] = useState<TreeItem[]>(() => initialTreeItems(metrics, template));
  const [funnel, setFunnel] = useState<FunnelRow[]>(() => initialFunnelRows(stages, metrics, template));
  const firstPending = (["north", "tree", "funnel"] as const).find((s) => !saved[s]);
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ north: firstPending === "north", tree: false, funnel: false });
  const [nameError, setNameError] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const selected = tree.filter((i) => i.selected);
  const metricNames = selected.map((i) => i.name);
  const withMetric = funnel.filter((r) => r.metricName && metricNames.some((n) => n.toLowerCase() === r.metricName!.toLowerCase())).length;
  const toggle = (k: SectionKey) => (v: boolean) => setOpen((o) => ({ ...o, [k]: v }));

  function useSuggestions() {
    setNorth((n) => ({
      north: { ...toMetricDraft(undefined, template.northStar), id: n.north.id, baseline: n.north.baseline, targets: n.north.targets },
      eff: { ...toMetricDraft(undefined, template.efficiency), id: n.eff.id, baseline: n.eff.baseline, targets: n.eff.targets },
      withEff: true,
    }));
    setFunnel((rows) =>
      rows.map((r) => {
        const t = template.funnel[r.name as keyof LineTemplate["funnel"]];
        return t ? { ...r, description: t.description, metricName: t.metric ?? r.metricName } : r;
      }),
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) {
      router.push(nextHref);
      return;
    }
    setError(undefined);
    setNameError(undefined);
    if (north.north.name.trim().length < 2) {
      setNameError("Escriba el nombre de la métrica norte.");
      setOpen((o) => ({ ...o, north: true }));
      return;
    }
    if (north.withEff && north.eff.name.trim().length < 2) {
      setError("Escriba el nombre de la métrica de eficiencia o apague el interruptor.");
      setOpen((o) => ({ ...o, north: true }));
      return;
    }
    const n = metricPayload(north.north, horizons);
    const ef = metricPayload(north.eff, horizons);
    if (n.invalid || (north.withEff && ef.invalid)) {
      setError("Revise los números de la métrica norte: escriba solo cifras, por ejemplo 420 o 185.000.");
      setOpen((o) => ({ ...o, north: true }));
      return;
    }
    if (!selected.length) {
      setError("Marque al menos una métrica de entrada en el árbol: son las que los ejercicios van a mover.");
      setOpen((o) => ({ ...o, tree: true }));
      return;
    }
    if (selected.some((i) => badNumber(i.baseline))) {
      setError("Revise las líneas base del árbol: escriba solo cifras, por ejemplo 420.");
      setOpen((o) => ({ ...o, tree: true }));
      return;
    }
    if (funnel.some((r) => r.name.trim().length < 2)) {
      setError("Cada etapa del embudo necesita un nombre.");
      setOpen((o) => ({ ...o, funnel: true }));
      return;
    }
    startTransition(async () => {
      const r = await saveLineStep(programId, line.id, {
        north: {
          northStar: n.metric,
          efficiency: north.withEff ? ef.metric : null,
          northTargets: n.targets,
          efficiencyTargets: north.withEff ? ef.targets : {},
        },
        tree: {
          metrics: selected.map((i) => {
            const b = parseDecimal(i.baseline);
            return {
              id: i.id,
              branch: i.branch,
              name: i.name,
              unit: i.unit,
              direction: i.direction,
              definition: i.definition,
              baseline: b != null && !Number.isNaN(b) ? b : null,
            };
          }),
          removedIds: tree.filter((i) => i.id && !i.selected).map((i) => i.id!),
        },
        funnel: {
          stages: funnel.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            metricName: s.metricName && metricNames.some((m) => m.toLowerCase() === s.metricName!.toLowerCase()) ? s.metricName : null,
          })),
        },
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(nextHref);
    });
  }

  const goals = north.north.baseline.trim() && horizons.every((h) => (north.north.targets[h.id] ?? "").trim());

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {!readOnly ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-wash px-4 py-2 text-sm">
          <span>Viene todo sugerido desde la plantilla. Revise lo que quiera y siga.</span>
          <UseExampleButton label="Volver a las sugerencias" onClick={useSuggestions} />
        </div>
      ) : null}

      <div className="stagger space-y-4">
        <Section
          id="north"
          title="Métrica norte y eficiencia"
          icon={Star}
          help={LINE_SECTION_HELP.north}
          summary={`${north.north.name || "Sin nombre"}${north.withEff ? ` · eficiencia: ${north.eff.name || "sin nombre"}` : ""}${goals ? "" : " · línea base y metas pendientes"}`}
          done={saved.north}
          open={open.north}
          onOpenChange={toggle("north")}
        >
          <NorthEditor value={north} onChange={setNorth} horizons={horizons} readOnly={readOnly} nameError={nameError} autoFocus={open.north && !saved.north} />
        </Section>

        <Section
          id="tree"
          title="Árbol de métricas"
          icon={Network}
          help={LINE_SECTION_HELP.tree}
          summary={`${selected.length} métrica(s) de entrada${selected.length ? `: ${metricNames.slice(0, 3).join(", ")}${selected.length > 3 ? "…" : ""}` : ""}`}
          done={saved.tree}
          open={open.tree}
          onOpenChange={toggle("tree")}
        >
          <TreeEditor items={tree} onChange={setTree} northStarName={north.north.name} readOnly={readOnly} />
        </Section>

        <Section
          id="funnel"
          title="Embudo"
          icon={Filter}
          help={LINE_SECTION_HELP.funnel}
          summary={`${funnel.length} etapas · ${withMetric} con métrica`}
          done={saved.funnel}
          open={open.funnel}
          onOpenChange={toggle("funnel")}
        >
          <FunnelEditor rows={funnel} onChange={setFunnel} metricNames={metricNames} lineName={line.name} readOnly={readOnly} />
        </Section>
      </div>

      <FormError message={error} />
      <div>
        <StepFooter prevHref={prevHref} pending={pending} nextLabel={nextLabel} />
      </div>
    </form>
  );
}
