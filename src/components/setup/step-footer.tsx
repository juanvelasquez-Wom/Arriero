"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Pie de cada paso: la acción principal grande ("Guarde y siga") y lo
 * secundario como enlaces. Con `onNext` el botón hace clic; sin él, es el
 * submit del formulario que lo contiene (Enter también guarda).
 */
export function StepFooter({
  prevHref,
  pending,
  onNext,
  nextLabel = "Guarde y siga",
  extra,
  disabled,
  prevLabel = "Anterior",
}: {
  prevHref: string | null;
  pending: boolean;
  onNext?: () => void;
  nextLabel?: string;
  extra?: React.ReactNode;
  disabled?: boolean;
  prevLabel?: string;
}) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      {prevHref ? (
        <Link href={prevHref} className="inline-flex items-center gap-1 self-start text-sm text-soft underline-offset-4 hover:text-ink hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> {prevLabel}
        </Link>
      ) : (
        <span />
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        {extra}
        <Button
          size="lg"
          type={onNext ? "button" : "submit"}
          onClick={onNext}
          disabled={pending || disabled}
          className="group w-full sm:w-auto"
        >
          {pending ? <Spinner /> : null}
          {nextLabel} {pending ? null : <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden />}
        </Button>
      </div>
    </div>
  );
}
