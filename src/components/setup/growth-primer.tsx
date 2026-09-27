"use client";

import { ChevronDown, Lightbulb } from "lucide-react";
import { useSyncExternalStore } from "react";
import { BrandIcon, type BrandIconName } from "@/components/brand/icons";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { WELCOME_IDEAS } from "./help-content";

const IDEA_ART: BrandIconName[] = ["montana-cima", "mula-datos", "embudo", "carriel-experimentos", "camino"];
const STORAGE_KEY = "arriero:primer-growth";
const EVENT = "arriero:primer-growth";

// Preferencia por navegador (abierto/cerrado). Si el almacenamiento no está
// disponible, se usa el valor por defecto y la página funciona igual.
function read(): "open" | "closed" | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "open" || v === "closed" ? v : null;
  } catch {
    return null;
  }
}
function write(v: "open" | "closed") {
  try {
    window.localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // sin almacenamiento: solo dura mientras la página esté abierta
  }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * "¿Nuevo en growth? Así funciona": el modelo en cinco ideas, compacto y
 * plegable. Abierto por defecto solo si todavía no hay programas; recuerda lo
 * que la persona eligió.
 */
export function GrowthPrimer({ defaultOpen }: { defaultOpen: boolean }) {
  const stored = useSyncExternalStore(subscribe, read, () => null);
  const open = stored ? stored === "open" : defaultOpen;

  return (
    <Collapsible open={open} onOpenChange={(v) => write(v ? "open" : "closed")} className="rounded-2xl border bg-paper shadow-card">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left">
        <Lightbulb className="wiggle-on-hover size-4 shrink-0" aria-hidden />
        <span className="flex-1">
          <span className="block text-sm font-bold">¿Nuevo en growth? Así funciona</span>
          <span className="block text-xs text-soft">El modelo en cinco ideas, sin carreta.</span>
        </span>
        <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        <ol className="stagger space-y-3">
          {WELCOME_IDEAS.map((idea, i) => (
            <li key={idea.title} className="flex gap-3">
              <span className="relative shrink-0">
                <BrandIcon name={IDEA_ART[i] ?? "mapa"} className="w-9" />
                <span className="absolute -top-1 -left-1 flex size-4 items-center justify-center rounded-full bg-ink font-heading text-[9px] font-bold text-paper">
                  {i + 1}
                </span>
              </span>
              <div>
                <h3 className="text-sm font-semibold">{idea.title}</h3>
                <p className="text-xs text-soft">{idea.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
