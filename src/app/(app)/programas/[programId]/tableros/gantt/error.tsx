"use client";

import { DashboardError, type DashboardErrorProps } from "@/components/dashboards/dashboard-states";

export default function Error(props: DashboardErrorProps) {
  return <DashboardError {...props} name="Gantt" />;
}
