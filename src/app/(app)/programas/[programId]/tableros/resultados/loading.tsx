import { DashboardSkeleton } from "@/components/dashboards/dashboard-states";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <DashboardSkeleton>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    </DashboardSkeleton>
  );
}
