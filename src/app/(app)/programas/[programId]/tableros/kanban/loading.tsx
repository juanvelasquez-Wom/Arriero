import { DashboardSkeleton } from "@/components/dashboards/dashboard-states";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <DashboardSkeleton>
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-72 shrink-0 space-y-2 rounded-2xl border bg-paper p-3">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 3 - (i % 2) }).map((_, j) => (
              <Skeleton key={j} className="h-24" />
            ))}
          </div>
        ))}
      </div>
    </DashboardSkeleton>
  );
}
