"use client";

import { Info, Lightbulb, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { StepHelp } from "./help-content";

/** Burbuja ⓘ: se abre al tocar o con teclado (funciona también en celular). */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Qué significa: ${label}`}
          className="inline-flex size-5 items-center justify-center rounded-full text-soft hover:bg-wash hover:text-ink"
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" side="top">
        <div className="mb-1 font-medium">{label}</div>
        <div className="text-soft">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/** Etiqueta de campo con burbuja de ayuda. */
export function HelpLabel({ htmlFor, children, help, required }: { htmlFor?: string; children: ReactNode; help?: ReactNode; required?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor}>
        {children}
        {required ? <span aria-hidden className="text-soft"> *</span> : null}
      </Label>
      {help ? <InfoTip label={typeof children === "string" ? children : "Ayuda"}>{help}</InfoTip> : null}
    </div>
  );
}

/** Panel "¿Qué es esto?" de cada paso. */
export function HelpPanel({ help, className }: { help: StepHelp; className?: string }) {
  return (
    <aside className={cn("rounded-xl border bg-paper p-4 text-sm", className)} aria-label="Ayuda de este paso">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-soft">
        <Lightbulb className="size-3.5" aria-hidden /> ¿Qué es esto?
      </div>
      <h2 className="text-base font-semibold">{help.title}</h2>
      <p className="mt-2">{help.what}</p>
      <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-soft">Por qué importa</h3>
      <p className="mt-1">{help.why}</p>
      <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-soft">Ejemplo</h3>
      <p className="mt-1 rounded-md border-l-4 border-l-highlight bg-wash px-3 py-2">{help.example}</p>
      {help.tip ? <p className="mt-3 text-xs text-soft">{help.tip}</p> : null}
    </aside>
  );
}

export function UseExampleButton({ onClick, label = "Usar ejemplo" }: { onClick: () => void; label?: string }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Sparkles aria-hidden /> {label}
    </Button>
  );
}
