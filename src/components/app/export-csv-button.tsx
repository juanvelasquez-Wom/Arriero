"use client";

import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { csvFileName } from "@/domain/csv";

/**
 * Descarga un CSV ya armado en el servidor (con `toCsv`). Recibe el texto para
 * que el cliente no necesite conocer las columnas.
 */
export function ExportCsvButton({ csv, name, label = "Exportar a Excel" }: { csv: string; name: string[]; label?: string }) {
  function download() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFileName(...name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("¡Listo pues! Archivo descargado", { description: "Se abre con Excel o Google Sheets." });
  }
  return (
    <Button type="button" variant="outline" onClick={download}>
      <Download aria-hidden /> {label}
    </Button>
  );
}
