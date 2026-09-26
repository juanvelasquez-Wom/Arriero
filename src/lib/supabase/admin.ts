import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Cliente con la SECRET KEY. Ignora RLS. Uso restringido a:
 *  - invitar usuarios,
 *  - cargar y borrar el programa de ejemplo,
 *  - borrar archivos de Storage tras una eliminación definitiva y la purga programada.
 * Nunca se importa desde un client component (lo impide "server-only").
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error("Falta SUPABASE_SECRET_KEY en el servidor. Revise .env.local.");
  }
  return createClient(publicEnv.supabaseUrl, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type AdminSupabase = ReturnType<typeof createAdminClient>;

/** Borra de Storage los archivos pendientes en la cola (tras una eliminación definitiva). */
export async function drainStorageDeletionQueue(admin: AdminSupabase = createAdminClient()) {
  const { data, error } = await admin.from("storage_deletion_queue").select("id, bucket, storage_path").limit(1000);
  if (error) throw error;
  const rows = (data ?? []) as { id: string; bucket: string; storage_path: string }[];
  if (!rows.length) return 0;
  const byBucket = new Map<string, { ids: string[]; paths: string[] }>();
  for (const r of rows) {
    const entry = byBucket.get(r.bucket) ?? { ids: [], paths: [] };
    entry.ids.push(r.id);
    entry.paths.push(r.storage_path);
    byBucket.set(r.bucket, entry);
  }
  let removed = 0;
  for (const [bucket, { ids, paths }] of byBucket) {
    const { error: removeError } = await admin.storage.from(bucket).remove(paths);
    if (removeError) throw removeError;
    const { error: deleteError } = await admin.from("storage_deletion_queue").delete().in("id", ids);
    if (deleteError) throw deleteError;
    removed += paths.length;
  }
  return removed;
}
