import { PageSkeleton } from "@/components/app/route-states";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <PageSkeleton phraseKey="direccion" />
    </main>
  );
}
