"use client";

import { Check, Plus, Star } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LineTemplate } from "@/domain/growth-templates";
import { METRIC_BRANCH_LABEL } from "@/domain/labels";
import { toInputValue } from "@/domain/metric-tree";
import { quickTreeMetrics } from "@/domain/quick-start";
import { METRIC_BRANCHES, type MetricBranch, type MetricDirection } from "@/domain/types";
import { cn } from "@/lib/utils";
import type { MetricRow } from "@/server/queries/structure";
import { FIELD_HELP } from "../help-content";
import { InfoTip } from "../help";
import { badNumber } from "./step-line-north";

const BRANCH_HINT: Record<MetricBranch, string> = {
  demand_volume: "¿Cuánta gente llega? Visitas, conversaciones, solicitudes.",
  conversion: "¿Cuántos de los que llegan compran? Tasas de paso entre etapas.",
  efficiency: "¿Cuánto cuesta cada resultado? Costos por lead o por venta.",
  recovery_recurrence: "¿Recuperamos a quien abandona y vuelve quien ya compró?",
};

export interface TreeItem {
  key: string;
  id?: string;
  branch: MetricBranch;
  name: string;
  unit: string;
  direction: MetricDirection;
  definition: string;
  baseline: string;
  selected: boolean;
  suggested: boolean;
}

let n = 0;
const k = () => `m${++n}`;
const norm = (s: string) => s.trim().toLowerCase();

/**
 * Métricas del árbol: las que ya existen (marcadas) más las sugeridas por la
 * plantilla. En una línea nueva quedan marcadas las mismas del arranque rápido:
 * la primera de cada rama y las que miden las etapas del embudo.
 */
export function initialTreeItems(existing: MetricRow[], template: LineTemplate): TreeItem[] {
  const items: TreeItem[] = existing
    .filter((m) => m.type === "input" && m.branch)
    .map((m) => ({
      key: k(),
      id: m.id,
      branch: m.branch!,
      name: m.name,
      unit: m.unit ?? "",
      direction: m.direction,
      definition: m.definition ?? "",
      baseline: toInputValue(m.baseline),
      selected: true,
      suggested: false,
    }));
  const fresh = items.length === 0;
  const defaults = new Set(quickTreeMetrics(template).map((m) => norm(m.name)));
  for (const branch of METRIC_BRANCHES) {
    for (const s of template.tree[branch]) {
      if (items.some((x) => norm(x.name) === norm(s.name))) continue;
      items.push({ key: k(), branch, ...s, baseline: "", selected: fresh && defaults.has(norm(s.name)), suggested: true });
    }
  }
  return items;
}

/** Sección "Árbol de métricas" de la pantalla de una línea (controlada). */
export function TreeEditor({
  items,
  onChange,
  northStarName,
  readOnly,
}: {
  items: TreeItem[];
  onChange: (items: TreeItem[]) => void;
  northStarName: string;
  readOnly?: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<MetricBranch, string>>({ demand_volume: "", conversion: "", efficiency: "", recovery_recurrence: "" });
  const selected = items.filter((i) => i.selected);
  const update = (key: string, patch: Partial<TreeItem>) => onChange(items.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  function addCustom(branch: MetricBranch) {
    const name = drafts[branch].trim();
    if (name.length < 2) return;
    if (items.some((x) => norm(x.name) === norm(name))) {
      onChange(items.map((x) => (norm(x.name) === norm(name) ? { ...x, selected: true } : x)));
    } else {
      onChange([
        ...items,
        { key: k(), branch, name, unit: "", direction: branch === "efficiency" ? "down" : "up", definition: "", baseline: "", selected: true, suggested: false },
      ]);
    }
    setDrafts({ ...drafts, [branch]: "" });
  }

  return (
    <div className="space-y-4">
      {/* Dibujo del árbol en vivo */}
      <div className="rounded-xl border p-4" aria-label="Vista del árbol">
        <div className="mx-auto w-fit max-w-full rounded-lg border-2 border-highlight px-4 py-2 text-center text-sm font-semibold">
          <Star className="mr-1 inline size-4" aria-hidden />
          {northStarName.trim() || "Métrica norte"}
        </div>
        <div className="mx-auto h-4 w-px bg-line" aria-hidden />
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
          {METRIC_BRANCHES.map((b) => {
            const chosen = selected.filter((i) => i.branch === b);
            return (
              <div key={b} className="rounded-lg bg-wash p-2">
                <div className="text-xs font-semibold">{METRIC_BRANCH_LABEL[b]}</div>
                <ul className="mt-1 space-y-1 text-xs">
                  {chosen.length ? (
                    chosen.map((i) => (
                      <li key={i.key} className="pop-in rounded border bg-paper px-2 py-1">
                        {i.name}
                      </li>
                    ))
                  ) : (
                    <li className="text-soft">Sin métricas</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4">
        {METRIC_BRANCHES.map((b) => (
          <section key={b} className="rounded-xl border p-4" aria-labelledby={`branch-${b}`}>
            <h3 id={`branch-${b}`} className="flex items-center gap-1 font-heading text-base font-bold">
              {METRIC_BRANCH_LABEL[b]} <InfoTip label="Ramas del árbol">{FIELD_HELP.branch}</InfoTip>
            </h3>
            <p className="text-sm text-soft">{BRANCH_HINT[b]}</p>
            <ul className="mt-3 space-y-2">
              {items
                .filter((i) => i.branch === b)
                .map((i) => (
                  <li key={i.key} className={cn("rounded-lg border p-3 transition-colors", i.selected && "border-ink/40 bg-wash/60")}>
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={i.selected}
                        aria-label={`Usar ${i.name}`}
                        disabled={readOnly}
                        onClick={() => update(i.key, { selected: !i.selected })}
                        className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border", i.selected && "border-ink bg-ink text-paper")}
                      >
                        {i.selected ? <Check className="pop-in size-3.5" aria-hidden /> : null}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">
                          {i.name} {i.suggested ? <span className="text-xs font-normal text-soft">· sugerida</span> : null}
                        </div>
                        {i.definition ? <div className="text-xs text-soft">{i.definition}</div> : null}
                        {i.selected ? (
                          <div className="mt-2 grid gap-2 sm:grid-cols-3">
                            <Input aria-label={`Unidad de ${i.name}`} placeholder="Unidad" value={i.unit} disabled={readOnly} onChange={(e) => update(i.key, { unit: e.target.value })} />
                            <select
                              aria-label={`Dirección de ${i.name}`}
                              className="h-8 rounded-lg border bg-transparent px-2 text-sm"
                              value={i.direction}
                              disabled={readOnly}
                              onChange={(e) => update(i.key, { direction: e.target.value as MetricDirection })}
                            >
                              <option value="up">Que suba</option>
                              <option value="down">Que baje</option>
                            </select>
                            <Input
                              aria-label={`Línea base de ${i.name}`}
                              placeholder="Hoy (opcional)"
                              inputMode="decimal"
                              value={i.baseline}
                              disabled={readOnly}
                              aria-invalid={badNumber(i.baseline)}
                              onChange={(e) => update(i.key, { baseline: e.target.value })}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
            </ul>
            {!readOnly ? (
              <div className="mt-3 flex gap-2">
                <Input
                  aria-label={`Nueva métrica de ${METRIC_BRANCH_LABEL[b]}`}
                  placeholder="Agregue una métrica propia"
                  value={drafts[b]}
                  onChange={(e) => setDrafts({ ...drafts, [b]: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustom(b);
                    }
                  }}
                />
                <Button type="button" variant="outline" disabled={drafts[b].trim().length < 2} onClick={() => addCustom(b)}>
                  <Plus aria-hidden /> Agregar
                </Button>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
