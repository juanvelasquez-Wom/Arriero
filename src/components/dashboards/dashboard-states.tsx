"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export interface DashboardErrorProps {
  error: Error & { digest?: string };
  /** Next 16: vuelve a pedir los datos y renderiza de nuevo. */
  retry?: () => void;
  /** Compatibilidad: limpia el error sin volver a pedir datos. */
  reset?: () => void;
}

/** Contenido de los error.tsx de los tableros, con reintento. */
export function DashboardError({ error, retry, reset, name }: DashboardErrorProps & { name: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const again = retry ?? reset;
  return (
    <div role="alert" className="mx-auto max-w-xl rounded-2xl border bg-paper p-6 shadow-card">
      <h2 className="text-lg font-bold">¡Juepucha! Se nos enredó el tablero {name}</h2>
      <p className="mt-1 text-sm text-soft">
        No pudimos cargarlo. Puede ser la conexión o los permisos. Intente de nuevo y, si sigue igual, avísele a un admin
        {error.digest ? ` (código ${error.digest})` : ""}.
      </p>
      {again ? (
        <Button className="mt-4" variant="outline" onClick={() => again()}>
          <RotateCcw aria-hidden /> Reintentar
        </Button>
      ) : null}
    </div>
  );
}

/** Esqueleto común: encabezado, pestañas y filtros; `children` es el cuerpo. */
export function DashboardSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1400px]" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando tablero…</span>
      <Skeleton className="mb-2 h-3 w-20" />
      <Skeleton className="mb-2 h-8 w-64" />
      <Skeleton className="mb-4 h-4 w-full max-w-xl" />
      <div className="mb-4 flex gap-2 border-b pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-28" />
        ))}
      </div>
      <div className="mb-6 flex flex-wrap gap-3 rounded-2xl border bg-paper p-3 shadow-card">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-44" />
        ))}
      </div>
      {children}
    </div>
  );
}
