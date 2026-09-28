import { PageSkeleton } from "@/components/app/route-states";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8">
      <PageSkeleton phraseKey="tableros" />
    </main>
  );
}
