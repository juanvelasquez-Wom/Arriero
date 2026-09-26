"use client";

import { Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { deleteDemoProgram, loadDemoProgram } from "@/server/actions/demo";

export function DemoControls({ demo }: { demo: { id: string; name: string } | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (demo) {
    return (
      <ConfirmAction
        title="Borrar programa de ejemplo"
        description="Se elimina de forma definitiva, con todo su contenido, archivos y usuarios ficticios. No pasa por la papelera."
        confirmLabel="Borrar definitivamente"
        onConfirm={async () => {
          const r = await deleteDemoProgram();
          if (!r.ok) return r.error;
          toast.success("Programa de ejemplo borrado. Listo pues.");
          router.refresh();
        }}
      >
        <Button variant="outline">
          <Trash2 aria-hidden /> Borrar programa de ejemplo
        </Button>
      </ConfirmAction>
    );
  }

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await loadDemoProgram();
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success("Programa de ejemplo cargado. Probemos por ahí.", { description: "Todos los datos son inventados." });
          router.push(`/programas/${r.data.programId}`);
        })
      }
    >
      {pending ? <Spinner /> : <Sparkles aria-hidden />}
      {pending ? "Cargando ejemplo…" : "Cargar programa de ejemplo"}
    </Button>
  );
}
