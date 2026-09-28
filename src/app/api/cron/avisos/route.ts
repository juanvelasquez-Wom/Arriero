import { NextResponse, type NextRequest } from "next/server";
import { isMonday, todayIso } from "@/domain/dates";
import { isCronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfigured } from "@/server/email/mailer";
import { sendWeeklyDigests, type DigestRunResult } from "@/server/email/weekly-digest";
import { tiaConfigured } from "@/server/tia/client";
import { sendWeeklyGossip, type GossipRunResult } from "@/server/tia/gossip";

// Job programado (Vercel Cron, ver vercel.json): genera los avisos diarios
// ("ya se puede leer", ideas quietas, congelamientos que se acercan y, los
// lunes, el recordatorio de la carga semanal). Es idempotente.
// Los lunes (Bogotá), si La Tía está conectada, suma "La Tía le tiene un
// chismecito", y si hay SMTP, manda el resumen semanal por correo. Si alguno
// de los dos falla, no afecta los demás avisos.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("generate_daily_notifications");
  if (error) console.error("[cron] generate_daily_notifications", error);

  const monday = isMonday(todayIso());
  let gossip: GossipRunResult | null = null;
  if (monday && tiaConfigured()) {
    try {
      gossip = await sendWeeklyGossip(admin);
    } catch (e) {
      console.error("[cron] chismecito de La Tía", e instanceof Error ? e.message : e);
    }
  }

  let digest: DigestRunResult | null = null;
  if (monday && emailConfigured()) {
    try {
      digest = await sendWeeklyDigests(admin);
    } catch (e) {
      console.error("[cron] resumen semanal por correo", e instanceof Error ? e.message : e);
    }
  }

  if (error) {
    return NextResponse.json({ error: "No se pudieron generar los avisos", gossip, digest }, { status: 500 });
  }
  return NextResponse.json({ created: data ?? 0, gossip, digest });
}
