import { DashboardSkeleton } from "@/components/dashboards/dashboard-states";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <DashboardSkeleton>
      <div className="rounded-xl border bg-paper p-4">
        <Skeleton className="mb-4 h-5 w-full max-w-2xl" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b py-3 last:border-b-0">
            <Skeleton className="h-8 w-56 shrink-0" />
            <Skeleton className="h-5" style={{ marginLeft: `${(i * 9) % 40}%`, width: `${20 + ((i * 7) % 25)}%` }} />
          </div>
        ))}
      </div>
    </DashboardSkeleton>
  );
}
