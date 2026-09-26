"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/app/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { LineTemplate } from "@/domain/growth-templates";
import { saveFunnelStep } from "@/server/actions/setup";
import type { MetricRow, StageRow } from "@/server/queries/structure";
import { FIELD_HELP } from "../help-content";
import { HelpLabel, UseExampleButton } from "../help";
import { StepFooter } from "../step-footer";

/** Descripciones genéricas que crea la base al crear la línea. */
const DB_DEFAULTS = new Set([
  "Cómo llega el cliente: alcance, tráfico y conversaciones iniciadas.",
  "El cliente muestra intención: explora la oferta, responde o agrega al carrito.",
  "El cliente compra, se porta o activa el servicio.",
  "Rescate de abandonos y compras repetidas.",
]);
const NONE = "__none__";

interface Row {
  id: string;
  name: string;
  description: string;
  metric_id: string | null;
}

export function StepLineFunnel({
  programId,
  line,
  lineIndex,
  lineCount,
  stages,
  metrics,
  template,
  prevHref,
  nextHref,
  isLastLine,
  readOnly,
}: {
  programId: string;
  line: { id: string; name: string };
  lineIndex: number;
  lineCount: number;
  stages: StageRow[];
  metrics: MetricRow[];
  template: LineTemplate;
  prevHref: string;
  nextHref: string;
  isLastLine: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const suggestion = (row: StageRow): Pick<Row, "description" | "metric_id"> => {
    const t = template.funnel[row.name as keyof LineTemplate["funnel"]];
    const metric = t?.metric ? metrics.find((m) => m.name.toLowerCase() === t.metric!.toLowerCase()) : undefined;
    return { description: t?.description ?? row.description ?? "", metric_id: metric?.id ?? null };
  };
  const [rows, setRows] = useState<Row[]>(() =>
    [...stages]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => {
        const useSuggested = !s.description || DB_DEFAULTS.has(s.description);
        const sug = suggestion(s);
        return {
          id: s.id,
          name: s.name,
          description: useSuggested ? sug.description : (s.description ?? ""),
          metric_id: s.metric_id ?? (useSuggested ? sug.metric_id : null),
        };
      }),
  );
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const update = (id: string, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  function next() {
    if (readOnly) {
      router.push(nextHref);
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const r = await saveFunnelStep(programId, line.id, { stages: rows });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(nextHref);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-wash px-4 py-2 text-sm">
        <span>
          Línea {lineIndex + 1} de {lineCount}: <strong>{line.name}</strong>
        </span>
        {!readOnly ? (
          <UseExampleButton
            label="Usar las sugerencias"
            onClick={() =>
              setRows((r) =>
                r.map((row) => {
                  const s = stages.find((x) => x.id === row.id)!;
                  return { ...row, ...suggestion(s) };
                }),
              )
            }
          />
        ) : null}
      </div>

      <ol className="space-y-2">
        {rows.map((row, i) => (
          <li key={row.id}>
            <div
              className="mx-auto rounded-xl border bg-paper p-4"
              style={{ width: `${100 - i * 6}%`, minWidth: "min(100%, 320px)" }}
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_260px]">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-paper">{i + 1}</span>
                    <Input aria-label={`Nombre de la etapa ${i + 1}`} className="h-8 font-medium" value={row.name} disabled={readOnly} onChange={(e) => update(row.id, { name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <HelpLabel htmlFor={`st-d-${row.id}`} help="Qué hace el cliente en esta etapa, en esta línea. Así todos ubican los problemas en el mismo lugar.">
                      Qué significa en {line.name}
                    </HelpLabel>
                    <Textarea id={`st-d-${row.id}`} rows={2} value={row.description} disabled={readOnly} onChange={(e) => update(row.id, { description: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <HelpLabel htmlFor={`st-m-${row.id}`} help={FIELD_HELP.stageMetric}>
                    Métrica que la mide
                  </HelpLabel>
                  <Select value={row.metric_id ?? NONE} disabled={readOnly} onValueChange={(v) => update(row.id, { metric_id: v === NONE ? null : v })}>
                    <SelectTrigger id={`st-m-${row.id}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin métrica</SelectItem>
                      {metrics.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            {i < rows.length - 1 ? <ChevronDown className="mx-auto mt-2 size-4 text-soft" aria-hidden /> : null}
          </li>
        ))}
      </ol>
      <p className="text-xs text-soft">Puedes agregar, quitar o reordenar etapas después, en la vista de la línea.</p>

      <FormError message={error} />
      <StepFooter
        prevHref={prevHref}
        pending={pending}
        onNext={next}
        nextLabel={isLastLine ? "Guardar y seguir con el equipo" : "Guardar y pasar a la siguiente línea"}
      />
    </div>
  );
}
