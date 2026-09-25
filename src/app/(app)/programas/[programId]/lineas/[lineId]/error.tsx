"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function LineError({
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
    <div role="alert" className="mx-auto max-w-xl rounded-xl border bg-paper p-6">
      <h2 className="text-base font-semibold">No pudimos cargar esta línea</h2>
      <p className="mt-1 text-sm text-soft">
        Puede ser un problema de conexión o de permisos. Intenta de nuevo; si persiste, avísale a un admin
        {error.digest ? ` (código ${error.digest})` : ""}.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => (retry ?? reset)?.()}>
          <RotateCcw aria-hidden /> Reintentar
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
