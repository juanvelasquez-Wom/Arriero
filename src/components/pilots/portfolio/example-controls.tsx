"use client";

import { Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { deleteExamplePilots, loadExamplePilots } from "@/server/actions/pilots";

/** "Cargar ejemplos" si no hay pilotos de ejemplo; "Borrar ejemplos" si los hay. Solo aprobadores. */
export function ExampleControls({ hasExamples }: { hasExamples: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!hasExamples) {
    return (
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await loadExamplePilots();
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            toast.success(r.message ?? "Ejemplos cargados.");
            router.refresh();
          })
        }
      >
        {pending ? <Spinner /> : <Sparkles aria-hidden />}
        Cargar ejemplos
      </Button>
    );
  }

  return (
    <ConfirmAction
      title="¿Borrar los pilotos de ejemplo?"
      description="Se borran de forma definitiva los pilotos marcados como Ejemplo, con sus datos y aprendizajes. Los pilotos reales no se tocan."
      confirmLabel="Sí, borrar ejemplos"
      onConfirm={async () => {
        const r = await deleteExamplePilots();
        if (!r.ok) return r.error;
        toast.success(r.message ?? "Ejemplos borrados.");
        router.refresh();
      }}
    >
      <Button variant="outline">
        <Trash2 aria-hidden /> Borrar ejemplos
      </Button>
    </ConfirmAction>
  );
}
