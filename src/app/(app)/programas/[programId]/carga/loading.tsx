import { Skeleton } from "@/components/ui/skeleton";

export default function WeeklyLoadLoading() {
  return (
    <div className="mx-auto max-w-5xl" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando la carga semanal…</span>
      <Skeleton className="mb-2 h-4 w-32" />
      <Skeleton className="mb-6 h-8 w-64" />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-8 w-8" />
        <Skeleton className="ml-auto h-8 w-40" />
      </div>
      {Array.from({ length: 2 }).map((_, g) => (
        <div key={g} className="mb-6 space-y-2">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ))}
    </div>
  );
}
