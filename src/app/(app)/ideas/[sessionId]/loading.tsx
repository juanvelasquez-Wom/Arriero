import { PageSkeleton } from "@/components/app/route-states";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <PageSkeleton rows={6} phraseKey="aguacero" />
    </main>
  );
}
