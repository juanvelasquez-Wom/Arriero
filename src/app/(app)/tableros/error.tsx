"use client";

import { RouteError } from "@/components/app/route-states";

export default function Error(props: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8">
      <RouteError {...props} />
    </main>
  );
}
