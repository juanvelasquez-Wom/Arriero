"use client";

import { GraduationCap } from "lucide-react";
import { useSyncExternalStore } from "react";
import { DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";

// Preferencia por persona (en este navegador): ocultar las explicaciones básicas
// para quien ya conoce el modelo. Todo sigue funcionando igual; solo se esconde
// el texto marcado con data-explain (ver globals.css).
const KEY = "arriero:explicaciones";
const CLASS = "explain-off";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "off";
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function setHidden(hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(KEY, "off");
    else localStorage.removeItem(KEY);
  } catch {
    // Sin almacenamiento: solo aplica en esta visita.
  }
  document.documentElement.classList.toggle(CLASS, hidden);
  listeners.forEach((l) => l());
}

/** Script que aplica la preferencia antes de pintar (evita el parpadeo). */
export const EXPLANATIONS_SCRIPT = `try{if(localStorage.getItem("${KEY}")==="off")document.documentElement.classList.add("${CLASS}")}catch(e){}`;

/** Opción del menú de usuario. */
export function ExplanationsMenuItem() {
  const hidden = useSyncExternalStore(subscribe, () => document.documentElement.classList.contains(CLASS) || read(), () => false);
  return (
    <DropdownMenuCheckboxItem checked={!hidden} onCheckedChange={(v) => setHidden(!v)} onSelect={(e) => e.preventDefault()}>
      <GraduationCap className="size-4" aria-hidden /> Mostrar explicaciones
    </DropdownMenuCheckboxItem>
  );
}
