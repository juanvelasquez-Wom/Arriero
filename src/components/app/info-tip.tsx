"use client";

import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GLOSSARY, type GlossaryKey } from "@/domain/glossary";
import { cn } from "@/lib/utils";

/** Burbuja ⓘ: se abre al tocar o con teclado (funciona también en celular). */
export function InfoTip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Qué significa: ${label}`}
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full align-middle text-soft hover:bg-wash hover:text-ink",
            className,
          )}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm font-normal normal-case tracking-normal" side="top">
        <div className="mb-1 font-medium text-ink">{label}</div>
        <div className="text-soft">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/** Término del glosario con su burbuja. `children` reemplaza el texto visible si hace falta. */
export function Term({ k, children, className }: { k: GlossaryKey; children?: ReactNode; className?: string }) {
  const entry = GLOSSARY[k];
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {children ?? entry.label}
      <InfoTip label={entry.label}>
        {entry.simple}
        {"detail" in entry && entry.detail ? <span className="mt-1.5 block text-xs">{entry.detail}</span> : null}
      </InfoTip>
    </span>
  );
}
