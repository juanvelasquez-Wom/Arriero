"use client";

import { CircleCheck, ClipboardPaste, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatNumber } from "@/domain/format";
import { countByStatus, parsePastedRows, PASTE_STATUS_LABEL, type PasteMetric } from "@/domain/paste-import";
import { toInputValue } from "@/domain/metric-tree";
import { cn } from "@/lib/utils";

/**
 * "Pegar desde Excel": el usuario pega filas Métrica · Valor (semana opcional),
 * ve qué se reconoció y llena el formulario. Guardar sigue siendo "Guardar todo".
 */
export function PasteImportDialog({
  metrics,
  week,
  onApply,
}: {
  metrics: PasteMetric[];
  week: string;
  onApply: (values: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const rows = useMemo(() => (text.trim() ? parsePastedRows(text, metrics, week) : []), [text, metrics, week]);
  const counts = countByStatus(rows);
  const problems = rows.length - counts.matched;

  function apply() {
    const values = Object.fromEntries(
      rows.filter((r) => r.status === "matched" && r.metricId && r.value != null).map((r) => [r.metricId!, toInputValue(r.value)]),
    );
    onApply(values);
    setOpen(false);
    setText("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ClipboardPaste aria-hidden /> Pegar desde Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pegar desde Excel</DialogTitle>
          <DialogDescription>
            Copie dos columnas de su hoja (nombre de la métrica y valor) y péguelas aquí. Si trae una columna con la fecha, se
            usan solo las filas de la semana del {formatDate(week)}. Nada se guarda hasta que haga clic en “Guardar todo”.
          </DialogDescription>
        </DialogHeader>

        <label htmlFor="paste-area" className="sr-only">
          Filas copiadas de la hoja de cálculo
        </label>
        <Textarea
          id="paste-area"
          rows={6}
          autoFocus
          className="font-mono text-xs"
          placeholder={"Altas digitales\t1.234\nTasa de conversión\t2,5"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        {rows.length ? (
          <div>
            <p role="status" className="mb-2 text-sm">
              <span className="font-medium tabular-nums">
                {counts.matched} de {rows.length} {rows.length === 1 ? "fila lista" : "filas listas"}
              </span>
              {problems ? <span className="text-soft"> · {problems} no se van a usar</span> : null}
            </p>
            <div className="max-h-64 overflow-y-auto rounded-xl border">
              <table className="w-full text-sm tabular-nums">
                <caption className="sr-only">Vista previa de lo pegado</caption>
                <thead className="sticky top-0 bg-wash text-left text-xs text-soft">
                  <tr>
                    <th scope="col" className="px-3 py-1.5 font-medium">
                      Fila
                    </th>
                    <th scope="col" className="px-3 py-1.5 font-medium">
                      Métrica
                    </th>
                    <th scope="col" className="px-3 py-1.5 text-right font-medium">
                      Valor
                    </th>
                    <th scope="col" className="px-3 py-1.5 font-medium">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => {
                    const okRow = r.status === "matched";
                    return (
                      <tr key={r.line} className={cn(!okRow && "text-soft")}>
                        <td className="px-3 py-1.5 text-xs">{r.line}</td>
                        <td className="px-3 py-1.5">{r.metricName ?? (r.name || "—")}</td>
                        <td className="px-3 py-1.5 text-right">{r.value != null ? formatNumber(r.value) : r.valueRaw || "—"}</td>
                        <td className="px-3 py-1.5 text-xs">
                          <span className={cn("inline-flex items-center gap-1", okRow ? "font-medium text-ink" : "")}>
                            {okRow ? (
                              <CircleCheck aria-hidden className="size-3.5" />
                            ) : (
                              <TriangleAlert aria-hidden className="size-3.5" />
                            )}
                            {PASTE_STATUS_LABEL[r.status]}
                            {r.status === "other_week" && r.week ? ` (${formatDate(r.week)})` : ""}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {counts.not_found ? (
              <p className="mt-2 text-xs text-soft">
                Los nombres deben coincidir con los de la carga (sin importar tildes ni mayúsculas).
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={apply} disabled={!counts.matched}>
            Llenar {counts.matched ? `${counts.matched} ${counts.matched === 1 ? "valor" : "valores"}` : "el formulario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
