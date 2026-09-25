"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Contenido de error.tsx reutilizable (los error boundaries son client components). */
export function RouteError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  return (
    <div role="alert" className="mx-auto max-w-xl rounded-xl border bg-paper p-6">
      <h2 className="text-base font-semibold">No pudimos cargar esta vista</h2>
      <p className="mt-1 text-sm text-soft">
        Puede ser un problema de conexión o de permisos. Si persiste, avísale a un admin
        {error.digest ? ` (código ${error.digest})` : ""}.
      </p>
      <Button className="mt-4" variant="outline" onClick={() => (retry ?? reset)?.()}>
        <RotateCcw aria-hidden /> Reintentar
      </Button>
    </div>
  );
}

export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="mx-auto max-w-6xl" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <Skeleton className="mb-2 h-4 w-40" />
      <Skeleton className="mb-6 h-8 w-80" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    </div>
  );
}
