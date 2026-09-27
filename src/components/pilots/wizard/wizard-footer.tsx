"use client";

import { ArrowLeft, ArrowRight, Save } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export type SaveThen = "stay" | "next";

/**
 * Pie de cada paso: "Volver" como enlace, "Guardar borrador" (se queda) y la
 * acción principal "Guardar y seguir" (guarda y pasa al siguiente paso).
 */
export function WizardFooter({
  prevHref,
  pending,
  onSave,
  nextLabel = "Guardar y seguir",
  showDraft = true,
  disabled,
  extra,
}: {
  prevHref: string | null;
  pending: boolean;
  onSave: (then: SaveThen) => void;
  nextLabel?: string;
  showDraft?: boolean;
  disabled?: boolean;
  extra?: ReactNode;
}) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      {prevHref ? (
        <Link
          href={prevHref}
          className="inline-flex min-h-11 items-center gap-1 self-start text-sm text-soft underline-offset-4 hover:text-ink hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden /> Volver
        </Link>
      ) : (
        <span />
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        {extra}
        {showDraft ? (
          <Button type="button" variant="outline" size="lg" className="min-h-11 w-full sm:w-auto" disabled={pending || disabled} onClick={() => onSave("stay")}>
            <Save aria-hidden /> Guardar borrador
          </Button>
        ) : null}
        <Button type="button" size="lg" className="group min-h-11 w-full sm:w-auto" disabled={pending || disabled} onClick={() => onSave("next")}>
          {pending ? <Spinner /> : null}
          {nextLabel}
          {pending ? null : <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden />}
        </Button>
      </div>
    </div>
  );
}
