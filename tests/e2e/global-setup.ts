import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

export default async function globalSetup() {
  Object.assign(process.env, loadEnv("test", process.cwd(), ""));
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = `e2e-${Date.now().toString(36)}@growth-tests.example`;
  const password = `${crypto.randomUUID()}Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Admin E2E" },
    app_metadata: { test: true },
  });
  if (error || !data.user) throw new Error(`No se pudo crear el usuario E2E: ${error?.message}`);
  const { error: e } = await admin.from("profiles").update({ is_admin: true }).eq("id", data.user.id);
  if (e) throw new Error(e.message);
  // Las variables de entorno del global setup llegan a los tests y al teardown.
  process.env.E2E_EMAIL = email;
  process.env.E2E_PASSWORD = password;
  process.env.E2E_USER_ID = data.user.id;
}
