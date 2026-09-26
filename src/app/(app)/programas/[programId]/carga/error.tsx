"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function WeeklyLoadError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  const params = useParams<{ programId: string }>();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="rise mx-auto max-w-xl rounded-2xl border bg-paper p-6 shadow-card">
      <h2 className="text-lg font-extrabold">Ese camino no era: no pudimos abrir la carga semanal</h2>
      <p className="mt-1 text-sm text-soft">
        Puede ser la conexión o los permisos. Intente de nuevo; si sigue pasando, avísele a un admin
        {error.digest ? ` (código ${error.digest})` : ""}.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => (retry ?? reset)?.()}>
          <RotateCcw aria-hidden /> Intentar de nuevo
        </Button>
        {params?.programId ? (
          <Button asChild variant="ghost">
            <Link href={`/programas/${params.programId}`}>Volver al resumen</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
