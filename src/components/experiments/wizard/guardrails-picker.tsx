"use client";

import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { describeGuardrail, MAX_GUARDRAILS } from "@/domain/experiment-guardrails";
import type { WizardData, WizardGuardrail } from "../wizard-values";
import { DecimalInput } from "./shared";

/**
 * Guardrails: hasta 3 métricas de la misma línea que no pueden empeorar más de
 * un límite frente al control. Se fijan en el diseño y se bloquean con él.
 */
export function GuardrailsPicker({
  guardrails,
  onChange,
  metrics,
  targetMetricId,
}: {
  guardrails: WizardGuardrail[];
  onChange: (next: WizardGuardrail[]) => void;
  /** Métricas de la línea del problema. */
  metrics: WizardData["metrics"];
  targetMetricId: string;
}) {
  const options = metrics.filter((m) => m.id !== targetMetricId);
  const used = new Set(guardrails.map((g) => g.metric_id));
  const free = options.filter((m) => !used.has(m.id));
  const update = (i: number, patch: Partial<WizardGuardrail>) => onChange(guardrails.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <ShieldCheck className="size-4" aria-hidden /> Guardrails
          <span className="font-normal text-soft">(opcional, máximo {MAX_GUARDRAILS})</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={guardrails.length >= MAX_GUARDRAILS || !free.length}
          onClick={() => onChange([...guardrails, { metric_id: free[0]?.id ?? "", limit_pct: 10, note: "" }])}
        >
          <Plus aria-hidden /> Agregar guardrail
        </Button>
      </div>
      <p className="text-xs text-soft">
        Métricas de la misma línea que no pueden empeorar mientras la variante gana. Si una se rompe, Arriero le avisa antes de decidir.
      </p>
      {!options.length ? (
        <p className="mt-2 text-xs text-soft">La línea no tiene otras métricas en el árbol para usar como guardrail.</p>
      ) : null}
      {guardrails.length ? (
        <ul className="mt-2 space-y-2">
          {guardrails.map((g, i) => {
            const m = metrics.find((x) => x.id === g.metric_id);
            return (
              <li key={g.id ?? `${g.metric_id}-${i}`} className="grid items-start gap-2 rounded-xl border p-3 sm:grid-cols-[2fr_1fr_2fr_auto]">
                <Select value={g.metric_id || undefined} onValueChange={(mid) => update(i, { metric_id: mid })}>
                  <SelectTrigger className="w-full" aria-label={`Métrica del guardrail ${i + 1}`}>
                    <SelectValue placeholder="Elija la métrica" />
                  </SelectTrigger>
                  <SelectContent>
                    {options
                      .filter((o) => o.id === g.metric_id || !used.has(o.id))
                      .map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="whitespace-nowrap text-soft">No empeora más de</span>
                    <DecimalInput
                      aria-label={`Límite del guardrail ${i + 1} en %`}
                      className="w-20 text-right tabular-nums"
                      value={g.limit_pct}
                      onValueChange={(n) => update(i, { limit_pct: n })}
                    />
                    <span className="text-soft">%</span>
                  </div>
                  {m && g.limit_pct != null && g.limit_pct > 0 ? (
                    <p className="mt-1 text-[11px] text-soft">{describeGuardrail({ limit_pct: g.limit_pct, direction: m.direction })}</p>
                  ) : g.limit_pct != null && g.limit_pct <= 0 ? (
                    <p className="mt-1 text-[11px]">El límite debe ser mayor que 0 %.</p>
                  ) : null}
                </div>
                <Input
                  aria-label={`Nota del guardrail ${i + 1}`}
                  placeholder="Por qué importa (opcional)"
                  value={g.note}
                  onChange={(e) => update(i, { note: e.target.value })}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Quitar el guardrail ${m?.name ?? i + 1}`}
                  onClick={() => onChange(guardrails.filter((_, j) => j !== i))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
