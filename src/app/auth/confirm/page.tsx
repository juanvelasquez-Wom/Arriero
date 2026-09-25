import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmClient } from "./confirm-client";

export const metadata: Metadata = { title: "Confirmando" };

export default function ConfirmPage() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-wash px-4">
      <div className="flex items-center gap-2 text-sm text-soft">
        <Suspense fallback={<Spinner />}>
          <ConfirmClient />
        </Suspense>
      </div>
    </main>
  );
}
