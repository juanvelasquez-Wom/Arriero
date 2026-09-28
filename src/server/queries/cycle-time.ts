import "server-only";
import type { CycleEvent, CycleExperiment } from "@/domain/cycle-time";
import type { ExperimentStatus } from "@/domain/types";
import { createClient } from "@/lib/supabase/server";

// Datos del tiempo de ciclo de un programa: ejercicios y sus cambios de estado
// en la bitácora. Cliente SSR: RLS decide (miembros del programa).

const PAGE = 1000;
/** Tope de filas de bitácora que se leen (suficiente para un programa). */
const MAX_EVENTS = 20_000;

export interface CycleTimeData {
  experiments: CycleExperiment[];
  events: CycleEvent[];
}

export async function loadCycleTimeData(programId: string): Promise<CycleTimeData> {
  const supabase = await createClient();
  const { data: exps, error } = await supabase
    .from("experiments")
    .select("id, owner_id, created_at, status, decided_at")
    .eq("program_id", programId)
    .limit(5000);
  if (error) throw new Error(error.message);

  const events: CycleEvent[] = [];
  for (let from = 0; from < MAX_EVENTS; from += PAGE) {
    const { data, error: logError } = await supabase
      .from("activity_log")
      .select("entity_id, created_at, action, payload")
      .eq("program_id", programId)
      .eq("entity_type", "experiment")
      .in("action", ["status_changed", "verdict"])
      .order("created_at")
      .range(from, from + PAGE - 1);
    // Si la bitácora no se puede leer, se sigue sin tiempos (la vista lo explica).
    if (logError) break;
    const rows = (data ?? []) as CycleEvent[];
    events.push(...rows);
    if (rows.length < PAGE) break;
  }

  return {
    experiments: (exps ?? []).map((e) => ({
      id: e.id as string,
      owner_id: (e.owner_id as string | null) ?? null,
      created_at: e.created_at as string,
      status: e.status as ExperimentStatus,
      decided_at: (e.decided_at as string | null) ?? null,
    })),
    events,
  };
}
