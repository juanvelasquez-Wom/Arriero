import { redirect } from "next/navigation";
import { buildQuery, firstParam, GLOBAL_FILTER_KEYS } from "@/domain/dashboard-filters";

/** /tableros abre el Gantt conservando los filtros. */
export default async function DashboardsIndex({ params, searchParams }: PageProps<"/programas/[programId]/tableros">) {
  const { programId } = await params;
  const sp = await searchParams;
  const values = Object.fromEntries(GLOBAL_FILTER_KEYS.map((k) => [k, firstParam(sp[k])]));
  redirect(`/programas/${programId}/tableros/gantt${buildQuery(values, GLOBAL_FILTER_KEYS)}`);
}
