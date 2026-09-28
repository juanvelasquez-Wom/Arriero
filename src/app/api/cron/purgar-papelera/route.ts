import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { createAdminClient, drainStorageDeletionQueue } from "@/lib/supabase/admin";

// Job programado (Vercel Cron, ver vercel.json): elimina de forma definitiva
// lo que lleva más de 30 días en la papelera y borra sus archivos de Storage.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("purge_expired_trash", { p_days: 30 });
  // Los pilotos borrados también se eliminan de verdad a los 30 días (igual que la papelera).
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { error: pilotsError } = await admin.from("pilots").delete().lt("deleted_at", cutoff);
  if (pilotsError && pilotsError.code !== "PGRST205") console.error("[cron] purga de pilotos", pilotsError.message);
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
