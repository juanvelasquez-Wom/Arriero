import { PageSkeleton } from "@/components/app/route-states";

export default function Loading() {
  return <PageSkeleton rows={4} phraseKey="pilotos-ficha" />;
}
