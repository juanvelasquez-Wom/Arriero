"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const TABLES = ["experiments", "experiment_variants", "metric_values", "problems", "calendar_events", "learnings"];

/**
 * Refresca los server components cuando otro usuario cambia datos del
 * programa (Supabase Realtime respeta RLS). Los cambios propios ya refrescan
 * con revalidatePath en las server actions.
 */
export function RealtimeRefresh({ programId }: { programId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`program-${programId}`);
    for (const table of TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `program_id=eq.${programId}` },
        () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => router.refresh(), 600);
        },
      );
    }
    channel.subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [programId, router]);

  return null;
}
