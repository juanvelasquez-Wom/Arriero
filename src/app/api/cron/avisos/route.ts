import { NextResponse, type NextRequest } from "next/server";
import { isMonday, todayIso } from "@/domain/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { tiaConfigured } from "@/server/tia/client";
import { sendWeeklyGossip, type GossipRunResult } from "@/server/tia/gossip";

// Job programado (Vercel Cron, ver vercel.json): genera los avisos diarios
// ("ya se puede leer", ideas quietas, congelamientos que se acercan y, los
// lunes, el recordatorio de la carga semanal). Es idempotente.
// Los lunes (Bogotá), si La Tía está conectada, suma "La Tía le tiene un
// chismecito": si falla, no afecta los demás avisos.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("generate_daily_notifications");
  if (error) console.error("[cron] generate_daily_notifications", error);

  let gossip: GossipRunResult | null = null;
  if (isMonday(todayIso()) && tiaConfigured()) {
    try {
      gossip = await sendWeeklyGossip(admin);
    } catch (e) {
      console.error("[cron] chismecito de La Tía", e instanceof Error ? e.message : e);
    }
  }

  if (error) {
    return NextResponse.json({ error: "No se pudieron generar los avisos", gossip }, { status: 500 });
  }
  return NextResponse.json({ created: data ?? 0, gossip });
}
