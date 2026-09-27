"use client";

import { RotateCcw } from "lucide-react";
import { BrandIcon } from "@/components/brand/icons";
import { LOADING_PHRASES, pickPhrase } from "@/components/brand/phrases";
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
    <div role="alert" className="rise mx-auto flex max-w-xl flex-col items-center rounded-2xl border bg-paper p-8 text-center shadow-card">
      <BrandIcon name="mula-sombrero" className="w-24 opacity-90" />
      <h2 className="mt-3 text-xl font-extrabold">Ese camino no era</h2>
      <p className="mt-1 text-sm text-soft">
        ¡Juepucha! Esta vista no quiso cargar. Puede ser la conexión o los permisos. Si sigue igual, avísele a un admin
        {error.digest ? ` (código ${error.digest})` : ""}.
      </p>
      <Button className="mt-5" variant="outline" onClick={() => (retry ?? reset)?.()}>
        <RotateCcw aria-hidden /> Intentar de nuevo
      </Button>
    </div>
  );
}

export function PageSkeleton({ rows = 6, phraseKey = "" }: { rows?: number; phraseKey?: string }) {
  const phrase = pickPhrase(LOADING_PHRASES, phraseKey);
  return (
    <div className="mx-auto max-w-6xl" aria-busy="true" aria-live="polite">
      <div className="mb-6 flex items-center gap-3 text-sm font-medium text-soft">
        <BrandIcon name="mula-cargada" className="mule-walk w-11" />
        <span>{phrase}</span>
      </div>
      <Skeleton className="mb-6 h-9 w-80 rounded-xl" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-11 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
