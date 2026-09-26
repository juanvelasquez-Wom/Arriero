"use client";

import { CheckCircle2, CircleAlert, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { finishSetup } from "@/server/actions/setup";

export interface SummaryItem {
  label: string;
  detail: string;
  ok: boolean;
  href: string;
}

export function StepSummary({
  programId,
  items,
  prevHref,
  completed,
  canFinish,
}: {
  programId: string;
  items: SummaryItem[];
  prevHref: string;
  completed: boolean;
  canFinish: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const pendingCount = items.filter((i) => !i.ok).length;

  function finish(to: string) {
    setError(undefined);
    startTransition(async () => {
      if (!completed && canFinish) {
        const r = await finishSetup(programId);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        toast.success("¡Programa listo!");
      }
      router.push(to);
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-paper p-5">
        <h2 className="font-semibold">Lo que configuraste</h2>
        <ul className="mt-3 divide-y">
          {items.map((i) => (
            <li key={i.label} className="flex items-start gap-3 py-2.5 text-sm">
              {i.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-label="Completo" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-label="Pendiente" />}
              <div className="min-w-0 flex-1">
                <div className="font-medium">{i.label}</div>
                <div className="text-soft">{i.detail}</div>
              </div>
              <Link href={i.href} className="shrink-0 text-xs underline underline-offset-4">
                {i.ok ? "Revisar" : "Completar"}
              </Link>
            </li>
          ))}
        </ul>
        {pendingCount ? (
          <p className="mt-3 text-sm text-soft">
            Hay {pendingCount} pendiente(s). Puedes terminar igual y completarlos después desde la vista de cada línea.
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-l-4 border-l-highlight bg-paper p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <ClipboardList className="size-4" aria-hidden /> Siguiente paso: tu primer problema
        </h2>
        <p className="mt-1 text-sm">
          En este modelo no hay ideas sueltas: todo ejercicio nace de un <strong>problema con evidencia</strong>, ubicado en una línea y una
          etapa del embudo. Registra dónde se está perdiendo valor hoy y con qué datos lo sabes.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => finish(`/programas/${programId}/problemas/nuevo`)} disabled={pending}>
            {pending ? <Spinner /> : null} Terminar y registrar el primer problema
          </Button>
          <Button variant="outline" onClick={() => finish(`/programas/${programId}`)} disabled={pending}>
            Terminar e ir al programa
          </Button>
        </div>
      </div>

      <FormError message={error} />
      <div className="flex">
        <Button variant="outline" asChild>
          <Link href={prevHref}>Anterior</Link>
        </Button>
      </div>
    </div>
  );
}
