"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** Pie de cada paso: volver y "Guarde y siga". */
export function StepFooter({
  prevHref,
  pending,
  onNext,
  nextLabel = "Guarde y siga",
  extra,
  disabled,
}: {
  prevHref: string | null;
  pending: boolean;
  onNext: () => void;
  nextLabel?: string;
  extra?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
      {prevHref ? (
        <Button variant="outline" asChild>
          <Link href={prevHref}>
            <ArrowLeft aria-hidden /> Anterior
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        <Button onClick={onNext} disabled={pending || disabled}>
          {pending ? <Spinner /> : null}
          {nextLabel} {pending ? null : <ArrowRight aria-hidden />}
        </Button>
      </div>
    </div>
  );
}
