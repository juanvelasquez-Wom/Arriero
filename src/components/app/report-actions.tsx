"use client";

import { Copy, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Copia texto al portapapeles; si la API no está (http o permisos), usa un textarea oculto. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // sigue con el plan B
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const done = document.execCommand("copy");
    ta.remove();
    return done;
  } catch {
    return false;
  }
}

export function CopySummaryButton({ text }: { text: string }) {
  async function onClick() {
    if (await copyText(text)) {
      toast.success("¡Listo pues! Resumen copiado", { description: "Péguelo en el correo o en el chat del comité." });
    } else {
      toast.error("No se pudo copiar. ¡Juepucha!", { description: "Seleccione el texto del informe y cópielo a mano." });
    }
  }
  return (
    <Button type="button" onClick={onClick}>
      <Copy aria-hidden /> Copiar resumen
    </Button>
  );
}

export function PrintButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      <Printer aria-hidden /> Imprimir
    </Button>
  );
}
