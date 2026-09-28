import "server-only";
import { cache } from "react";
import { addDays, todayIso } from "@/domain/dates";
import { rankUsers, type RankedUser, type UserStats } from "@/domain/gamification";
import { createClient } from "@/lib/supabase/server";

export type RecuaPeriod = "siempre" | "mes";

export interface Recua {
  /** false si falta aplicar la migración de gamificación. */
  ready: boolean;
  today: string;
  ranked: RankedUser[];
}

/**
 * Escalafón de La Recua. Lee con la sesión de la persona: la RPC solo devuelve
 * conteos por usuario (sin detalle), así que el RLS del detalle sigue intacto.
 */
export const loadRecua = cache(async (period: RecuaPeriod = "siempre"): Promise<Recua> => {
  const today = todayIso();
  const supabase = await createClient();
  const since = period === "mes" ? `${addDays(today, -30)}T00:00:00-05:00` : null;
  const { data, error } = await supabase.rpc("gamification_stats", { p_since: since });
  if (error || !Array.isArray(data)) return { ready: false, today, ranked: [] };
  const rows = (data as UserStats[]).map((r) => ({ ...r, recent_days: (r.recent_days ?? []).map(String) }));
  return { ready: true, today, ranked: rankUsers(rows, today) };
});
