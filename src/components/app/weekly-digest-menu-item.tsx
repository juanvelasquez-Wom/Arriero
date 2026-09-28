import { createClient } from "@/lib/supabase/server";
import { WeeklyDigestToggle } from "./weekly-digest-toggle";

/**
 * Lee la preferencia del resumen semanal de la persona y pinta la opción del
 * menú. Si la columna aún no existe (migración pendiente), no muestra nada.
 */
export async function WeeklyDigestMenuItem({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("weekly_digest").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return <WeeklyDigestToggle initial={data.weekly_digest !== false} />;
}
