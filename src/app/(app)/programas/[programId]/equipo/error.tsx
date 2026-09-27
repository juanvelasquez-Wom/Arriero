"use client";

import { RouteError } from "@/components/app/route-states";

export default function Error(props: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  return <RouteError {...props} />;
}
