import { PageSkeleton } from "@/components/app/route-states";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <PageSkeleton rows={3} phraseKey="aprender" />
    </main>
  );
}
