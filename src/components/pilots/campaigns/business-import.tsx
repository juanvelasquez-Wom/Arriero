"use client";

import { Download, FileUp, ShieldCheck, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { csvFileName } from "@/domain/csv";
import { formatDate, formatNumber } from "@/domain/format";
import { businessTemplate, MAX_BUSINESS_ROWS, readBusinessImport, type BusinessImportResult } from "@/domain/pilots/reconciliation";
import { formatCop } from "@/domain/value";
import { importBusinessConversions } from "@/server/actions/pilot-integrations";

/** Subir las ventas del negocio (CRM/BSS) en CSV para conciliar con la plataforma. */
export function BusinessImport({ today }: { today: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [file, setFile] = useState<{ name: string; result: BusinessImportResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function downloadTemplate() {
    const blob = new Blob([businessTemplate(today)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFileName("plantilla", "ventas-negocio", today);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("¡Listo pues! Plantilla descargada", { description: "Llénela desde el CRM y súbala como CSV." });
  }

  function onFile(f: File | undefined) {
    setError(null);
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setFile({ name: f.name, result: readBusinessImport(String(reader.result ?? ""), { maxDate: today }) });
    reader.onerror = () => setError("No se pudo leer el archivo. Revise que sea un CSV y vuelva a subirlo.");
    reader.readAsText(f, "utf-8");
  }

  function clear() {
    setFile(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function save() {
    const rows = file?.result.rows ?? [];
    if (!rows.length) return;
    if (rows.length > MAX_BUSINESS_ROWS) return setError(`El archivo trae ${formatNumber(rows.length)} filas y el máximo por carga es 5.000: pártalo en dos.`);
    startTransition(async () => {
      const r = await importBusinessConversions(rows);
      if (!r.ok) return setError(r.error);
      toast.success(r.message ?? "Ventas guardadas.");
      clear();
      router.refresh();
    });
  }

  const rows = file?.result.rows ?? [];
  const issues = file?.result.issues ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={downloadTemplate}>
          <Download aria-hidden /> Descargar plantilla
        </Button>
        <input ref={fileRef} id={inputId} type="file" accept=".csv,text/csv,.txt" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
          <FileUp aria-hidden /> Subir ventas (CSV)
        </Button>
        {file ? <span className="text-xs text-soft">{file.name}</span> : null}
      </div>
      <p className="flex items-start gap-1.5 text-xs text-soft">
        <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Columnas: Fecha, Canal, Campaña, Ventas, Ingresos (opcional) y Clave (opcional). La clave va con hash o es el ctwa_clid: nunca el teléfono en
          claro. Si una clave parece un teléfono, esa fila no entra.
        </span>
      </p>
      <FormError message={error} />

      {file ? (
        <div className="rise space-y-3">
          <p role="status" className="text-sm">
            <span className="font-medium tabular-nums">
              {formatNumber(rows.length)} {rows.length === 1 ? "fila lista" : "filas listas"} para guardar
            </span>
            {issues.length ? (
              <span className="text-soft tabular-nums">
                {" "}
                · {issues.length} {issues.length === 1 ? "línea con problema no entra" : "líneas con problema no entran"}
              </span>
            ) : null}
          </p>
          {issues.length ? (
            <div className="max-h-48 overflow-y-auto rounded-xl border bg-wash px-3 py-2">
              <ul className="space-y-1 text-sm">
                {issues.map((i, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      <span className="font-medium tabular-nums">Línea {i.line}:</span> {i.message}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {file.result.ignoredColumns.length ? <p className="text-xs text-soft">Columnas que se ignoran: {file.result.ignoredColumns.join(", ")}.</p> : null}
          {rows.length ? (
            <div className="max-h-64 overflow-auto rounded-xl border">
              <table className="w-full min-w-max text-sm tabular-nums">
                <caption className="sr-only">Vista previa de las ventas del archivo</caption>
                <thead className="sticky top-0 bg-wash text-left text-xs text-soft">
                  <tr>
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Canal</th>
                    <th className="px-3 py-2 font-medium">Campaña</th>
                    <th className="px-3 py-2 text-right font-medium">Ventas</th>
                    <th className="px-3 py-2 text-right font-medium">Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5">{formatDate(r.day)}</td>
                      <td className="px-3 py-1.5">{r.channel}</td>
                      <td className="px-3 py-1.5">{r.campaign_name || "—"}</td>
                      <td className="px-3 py-1.5 text-right">{formatNumber(r.sales)}</td>
                      <td className="px-3 py-1.5 text-right">{formatCop(r.revenue_cop)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={save} disabled={pending || rows.length === 0}>
              {pending ? <Spinner /> : null}
              Guardar {formatNumber(rows.length)} {rows.length === 1 ? "fila" : "filas"}
            </Button>
            <Button type="button" variant="outline" onClick={clear} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
