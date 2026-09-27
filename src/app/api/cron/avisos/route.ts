import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Job programado (Vercel Cron, ver vercel.json): genera los avisos diarios
// ("ya se puede leer", ideas quietas, congelamientos que se acercan y, los
// lunes, el recordatorio de la carga semanal). Es idempotente.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("generate_daily_notifications");
  if (error) {
    console.error("[cron] generate_daily_notifications", error);
    return NextResponse.json({ error: "No se pudieron generar los avisos" }, { status: 500 });
  }
  return NextResponse.json({ created: data ?? 0 });
}
