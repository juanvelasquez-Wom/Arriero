"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { updateIce } from "@/server/actions/experiments";

type Key = "impact" | "confidence" | "ease";
const LABEL: Record<Key, string> = { impact: "Impacto", confidence: "Confianza", ease: "Facilidad" };

/** Edición rápida de ICE en el backlog: guarda al salir del campo. */
export function QuickIce({
  programId,
  experimentId,
  title,
  values,
}: {
  programId: string;
  experimentId: string;
  title: string;
  values: Record<Key, number | null>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<Key, string>>({
    impact: values.impact?.toString() ?? "",
    confidence: values.confidence?.toString() ?? "",
    ease: values.ease?.toString() ?? "",
  });
  const [pending, startTransition] = useTransition();

  function commit() {
    const parsed = Object.fromEntries(
      (Object.keys(draft) as Key[]).map((k) => [k, draft[k].trim() === "" ? null : Number(draft[k])]),
    ) as Record<Key, number | null>;
    const changed = (Object.keys(parsed) as Key[]).some((k) => parsed[k] !== values[k]);
    if (!changed) return;
    if ((Object.values(parsed) as (number | null)[]).some((n) => n != null && (!Number.isInteger(n) || n < 1 || n > 10))) {
      toast.error("Las calificaciones ICE van de 1 a 10. Ni más, ni menos.");
      return;
    }
    startTransition(async () => {
      const r = await updateIce(programId, experimentId, parsed);
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1">
      {(Object.keys(LABEL) as Key[]).map((k) => (
        <input
          key={k}
          type="number"
          min={1}
          max={10}
          inputMode="numeric"
          aria-label={`${LABEL[k]} de ${title}`}
          title={LABEL[k]}
          value={draft[k]}
          onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-7 w-11 rounded-md border bg-paper px-1 text-center text-sm tabular-nums"
        />
      ))}
      {pending ? <Spinner className="size-3.5" /> : null}
    </div>
  );
}
