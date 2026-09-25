// Borra de Storage los archivos pendientes tras eliminaciones definitivas.
// Normalmente lo hace la app y el job programado; útil si alguno falló.
//
//   npm run storage:drain
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local.");
  process.exit(1);
}
const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await admin.from("storage_deletion_queue").select("id, bucket, storage_path").limit(1000);
if (error) {
  console.error(error.message);
  process.exit(1);
}
let removed = 0;
for (const row of data ?? []) {
  const { error: e } = await admin.storage.from(row.bucket).remove([row.storage_path]);
  if (e) {
    console.error(`No se pudo borrar ${row.storage_path}: ${e.message}`);
    continue;
  }
  await admin.from("storage_deletion_queue").delete().eq("id", row.id);
  removed += 1;
}
console.log(`Archivos borrados: ${removed}`);
