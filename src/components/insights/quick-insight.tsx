"use client";

import { Lightbulb } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InsightForm } from "./insight-form";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || !!target.closest("[role=combobox]");
}

/**
 * Botón del bombillo en la barra: abre la captura rápida desde cualquier pantalla.
 * Atajo: tecla «I» (cuando no se está escribiendo).
 */
export function QuickInsightButton() {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "i" || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if (document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      setRound((r) => r + 1);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setRound((r) => r + 1);
          setOpen(true);
        }}
        className="gap-1.5 rounded-full px-2"
        aria-label="Anotar un insight (tecla I)"
        aria-keyshortcuts="I"
        title="Anotar un insight (I)"
      >
        <Lightbulb aria-hidden className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Anote un insight</DialogTitle>
            <DialogDescription>
              Lo que vio, oyó o sospecha. Antes de que se le olvide, que la memoria es más frágil que un huevo en trocha.
            </DialogDescription>
          </DialogHeader>
          <InsightForm key={round} exampleKey={round} onDone={() => setOpen(false)} />
          <p className="text-center text-xs text-soft">
            <Link href="/insights" onClick={() => setOpen(false)} className="underline underline-offset-4">
              Ver el carriel de insights
            </Link>
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
