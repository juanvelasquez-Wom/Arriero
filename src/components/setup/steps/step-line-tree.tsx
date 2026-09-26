"use client";

import { Check, Plus, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LineTemplate } from "@/domain/growth-templates";
import { METRIC_BRANCH_LABEL } from "@/domain/labels";
import { parseDecimal, toInputValue } from "@/domain/metric-tree";
import { METRIC_BRANCHES, type MetricBranch, type MetricDirection } from "@/domain/types";
import { cn } from "@/lib/utils";
import { saveTreeStep } from "@/server/actions/setup";
import type { MetricRow } from "@/server/queries/structure";
import { FIELD_HELP } from "../help-content";
import { InfoTip } from "../help";
import { StepFooter } from "../step-footer";

const BRANCH_HINT: Record<MetricBranch, string> = {
  demand_volume: "¿Cuánta gente llega? Visitas, conversaciones, solicitudes.",
  conversion: "¿Cuántos de los que llegan compran? Tasas de paso entre etapas.",
  efficiency: "¿Cuánto cuesta cada resultado? Costos por lead o por venta.",
  recovery_recurrence: "¿Recuperamos a quien abandona y vuelve quien ya compró?",
};

interface Item {
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

function initialItems(existing: MetricRow[], template: LineTemplate): Item[] {
  const items: Item[] = existing
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
  for (const branch of METRIC_BRANCHES) {
    template.tree[branch].forEach((s, i) => {
      if (items.some((x) => norm(x.name) === norm(s.name))) return;
      items.push({ key: k(), branch, ...s, baseline: "", selected: fresh && i === 0, suggested: true });
    });
  }
  return items;
}

export function StepLineTree({
  programId,
  line,
  lineIndex,
  lineCount,
  northStarName,
  existing,
  template,
  prevHref,
  nextHref,
  readOnly,
}: {
  programId: string;
  line: { id: string; name: string };
  lineIndex: number;
  lineCount: number;
  northStarName: string | null;
  existing: MetricRow[];
  template: LineTemplate;
  prevHref: string;
  nextHref: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(() => initialItems(existing, template));
  const [drafts, setDrafts] = useState<Record<MetricBranch, string>>({ demand_volume: "", conversion: "", efficiency: "", recovery_recurrence: "" });
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const selected = items.filter((i) => i.selected);

  const update = (key: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  function addCustom(branch: MetricBranch) {
    const name = drafts[branch].trim();
    if (name.length < 2) return;
    setItems((xs) => [...xs, { key: k(), branch, name, unit: "", direction: branch === "efficiency" ? "down" : "up", definition: "", baseline: "", selected: true, suggested: false }]);
    setDrafts({ ...drafts, [branch]: "" });
  }

  function next() {
    if (readOnly) {
      router.push(nextHref);
      return;
    }
    if (!northStarName) {
      setError("Primero defina la métrica norte de esta línea (paso anterior).");
      return;
    }
    if (!selected.length) {
      setError("Elija al menos una métrica de entrada: son las que los ejercicios van a mover.");
      return;
    }
    if (selected.some((i) => i.baseline.trim() && Number.isNaN(parseDecimal(i.baseline)))) {
      setError("Revise las líneas base: escriba solo cifras, por ejemplo 420.");
      return;
    }
    setError(undefined);
    const removedIds = items.filter((i) => i.id && !i.selected).map((i) => i.id!);
    startTransition(async () => {
      const r = await saveTreeStep(programId, line.id, {
        metrics: selected.map((i) => {
          const b = parseDecimal(i.baseline);
          return { id: i.id, branch: i.branch, name: i.name, unit: i.unit, direction: i.direction, definition: i.definition, baseline: b != null && !Number.isNaN(b) ? b : null };
        }),
        removedIds,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(nextHref);
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-wash px-4 py-2 text-sm">
        Línea {lineIndex + 1} de {lineCount}: <strong>{line.name}</strong>
      </div>

      {/* Dibujo del árbol en vivo */}
      <div className="rounded-2xl border bg-paper shadow-card p-5" aria-label="Vista del árbol">
        <div className="mx-auto w-fit rounded-lg border-2 border-highlight px-4 py-2 text-center text-sm font-semibold">
          <Star className="mr-1 inline size-4" aria-hidden />
          {northStarName ?? "Métrica norte (pendiente)"}
        </div>
        <div className="mx-auto h-4 w-px bg-line" aria-hidden />
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
          {METRIC_BRANCHES.map((b) => {
            const chosen = selected.filter((i) => i.branch === b);
            return (
              <div key={b} className="rounded-lg bg-wash p-2">
                <div className="text-xs font-semibold">{METRIC_BRANCH_LABEL[b]}</div>
                <ul className="mt-1 space-y-1 text-xs">
                  {chosen.length ? chosen.map((i) => <li key={i.key} className="rounded border bg-paper px-2 py-1">{i.name}</li>) : <li className="text-soft">Sin métricas</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {METRIC_BRANCHES.map((b) => (
        <section key={b} className="rounded-2xl border bg-paper shadow-card p-5">
          <h2 className="flex items-center gap-1 text-lg font-bold">
            {METRIC_BRANCH_LABEL[b]} <InfoTip label="Ramas del árbol">{FIELD_HELP.branch}</InfoTip>
          </h2>
          <p className="text-sm text-soft">{BRANCH_HINT[b]}</p>
          <ul className="mt-3 space-y-2">
            {items
              .filter((i) => i.branch === b)
              .map((i) => (
                <li key={i.key} className={cn("rounded-lg border p-3", i.selected && "border-ink/40 bg-wash/60")}>
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
                      {i.selected ? <Check className="size-3.5" aria-hidden /> : null}
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
                            <option value="up">Lo bueno es que suba</option>
                            <option value="down">Lo bueno es que baje</option>
                          </select>
                          <Input
                            aria-label={`Línea base de ${i.name}`}
                            placeholder="Hoy (opcional)"
                            inputMode="decimal"
                            value={i.baseline}
                            disabled={readOnly}
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
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addCustom(b);
              }}
            >
              <Input aria-label={`Nueva métrica de ${METRIC_BRANCH_LABEL[b]}`} placeholder="Agregue una métrica propia" value={drafts[b]} onChange={(e) => setDrafts({ ...drafts, [b]: e.target.value })} />
              <Button type="submit" variant="outline" disabled={drafts[b].trim().length < 2}>
                <Plus aria-hidden /> Agregar
              </Button>
            </form>
          ) : null}
        </section>
      ))}

      <FormError message={error} />
      <StepFooter prevHref={prevHref} pending={pending} onNext={next} nextLabel={`Guarde ${selected.length} métrica(s) y siga`} />
    </div>
  );
}
