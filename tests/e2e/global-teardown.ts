import { createClient } from "@supabase/supabase-js";

export default async function globalTeardown() {
  const userId = process.env.E2E_USER_ID;
  if (!userId) return;
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: programs } = await admin.from("programs").select("id").eq("created_by", userId);
  for (const p of programs ?? []) {
    await admin.from("activity_log").delete().eq("program_id", p.id);
    await admin.from("programs").delete().eq("id", p.id);
  }
  await admin.auth.admin.deleteUser(userId);
}
