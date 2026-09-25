import { Skeleton } from "@/components/ui/skeleton";

export default function LineLoading() {
  return (
    <div className="mx-auto max-w-6xl" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando la línea…</span>
      <Skeleton className="mb-2 h-4 w-32" />
      <Skeleton className="mb-2 h-8 w-64" />
      <Skeleton className="mb-6 h-4 w-96 max-w-full" />
      <div className="mb-6 flex gap-2 border-b pb-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-7 w-24" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <Skeleton className="h-28" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
