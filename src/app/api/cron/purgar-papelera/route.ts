import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, drainStorageDeletionQueue } from "@/lib/supabase/admin";

// Job programado (Vercel Cron, ver vercel.json): elimina de forma definitiva
// lo que lleva más de 30 días en la papelera y borra sus archivos de Storage.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("purge_expired_trash", { p_days: 30 });
  if (error) {
    console.error("[cron] purge_expired_trash", error);
    return NextResponse.json({ error: "No se pudo purgar la papelera" }, { status: 500 });
  }
  let files = 0;
  try {
    files = await drainStorageDeletionQueue(admin);
  } catch (e) {
    console.error("[cron] Storage", e);
    return NextResponse.json({ purged: data, files: 0, storageError: true }, { status: 500 });
  }
  return NextResponse.json({ purged: data, files });
}
