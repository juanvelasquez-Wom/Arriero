import { DashboardSkeleton } from "@/components/dashboards/dashboard-states";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <DashboardSkeleton>
      <div className="mb-6 rounded-xl border bg-paper p-4">
        <Skeleton className="mb-4 h-5 w-48" />
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 15 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64" />
        <Skeleton className="h-64 lg:col-span-2" />
      </div>
    </DashboardSkeleton>
  );
}
