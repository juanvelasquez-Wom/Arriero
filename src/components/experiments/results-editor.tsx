"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Callout } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, formatPercent, formatSignedPercent } from "@/domain/format";
import { computeVariantResults } from "@/domain/results";
import type { Variant } from "@/domain/types";
import { cn } from "@/lib/utils";
import { saveResults } from "@/server/actions/experiments";

type Row = { id: string; sample: string; conversions: string; metric_value: string; notes: string };

const toNum = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

export function ResultsEditor({
  programId,
  experimentId,
  variants,
  canEdit,
  isWinner,
}: {
  programId: string;
  experimentId: string;
  variants: Variant[];
  canEdit: boolean;
  isWinner?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    variants.map((v) => ({
      id: v.id,
      sample: v.sample?.toString() ?? "",
      conversions: v.conversions?.toString() ?? "",
      metric_value: v.metric_value?.toString() ?? "",
      notes: v.notes ?? "",
    })),
  );
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const live = useMemo(
    () =>
      computeVariantResults(
        variants.map((v, i) => ({
          ...v,
          sample: toNum(rows[i]?.sample ?? ""),
          conversions: toNum(rows[i]?.conversions ?? ""),
          metric_value: toNum(rows[i]?.metric_value ?? ""),
        })),
      ),
    [variants, rows],
  );
  const invalid = rows.some(
    (r) => [r.sample, r.conversions, r.metric_value].some((x) => x.trim() !== "" && !Number.isFinite(toNum(x))),
  );

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function save() {
    setError(undefined);
    startTransition(async () => {
      const r = await saveResults(
        programId,
        experimentId,
        rows.map((x) => ({
          id: x.id,
          sample: toNum(x.sample),
          conversions: toNum(x.conversions),
          metric_value: toNum(x.metric_value),
          notes: x.notes,
        })),
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success("Resultados guardados");
      router.refresh();
    });
  }

  if (!variants.length) {
    return <p className="text-sm text-soft">Define las variantes en el diseño de la prueba para poder cargar resultados.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variante</TableHead>
              <TableHead className="text-right">Muestra</TableHead>
              <TableHead className="text-right">Conversiones</TableHead>
              <TableHead className="text-right">Valor métrica</TableHead>
              <TableHead className="text-right">Tasa</TableHead>
              <TableHead className="text-right">vs. control</TableHead>
              <TableHead className="min-w-52">Notas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((v, i) => {
              const res = live[i];
              const winner = isWinner && !v.is_control;
              return (
                <TableRow key={v.id} className={cn(winner && "bg-highlight/10")}>
                  <TableCell>
                    <div className="font-medium">
                      {v.name} {v.is_control ? <span className="ml-1 rounded border px-1 text-[11px] text-soft">Control</span> : null}
                    </div>
                    {v.description ? <div className="text-xs text-soft">{v.description}</div> : null}
                  </TableCell>
                  {(["sample", "conversions", "metric_value"] as const).map((k) => (
                    <TableCell key={k} className="text-right">
                      {canEdit ? (
                        <Input
                          aria-label={`${k === "sample" ? "Muestra" : k === "conversions" ? "Conversiones" : "Valor de la métrica"} de ${v.name}`}
                          inputMode="decimal"
                          className="ml-auto w-28 text-right tabular-nums"
                          value={rows[i][k]}
                          onChange={(e) => update(i, { [k]: e.target.value })}
                        />
                      ) : (
                        <span className="tabular-nums">{formatNumber(v[k])}</span>
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{formatPercent(res.rate)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {v.is_control ? <span className="text-soft">base</span> : formatSignedPercent(res.diffVsControl)}
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <Input aria-label={`Notas de ${v.name}`} value={rows[i].notes} onChange={(e) => update(i, { notes: e.target.value })} />
                    ) : (
                      <span className="text-sm">{v.notes || "—"}</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-soft">
        Tasa = conversiones / muestra. La diferencia se calcula frente al control (sobre la tasa o, si no hay conversiones, sobre el valor de
        la métrica). No hay cálculo de significancia: el veredicto lo emite una persona frente a la regla de decisión.
      </p>
      {error ? <Callout title="No se pudieron guardar">{error}</Callout> : null}
      {canEdit ? (
        <Button onClick={save} disabled={pending || invalid}>
          {pending ? <Spinner /> : <Save aria-hidden />} Guardar resultados
        </Button>
      ) : null}
    </div>
  );
}
