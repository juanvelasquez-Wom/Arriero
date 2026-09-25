// Crea (o promueve) el primer admin global.
//
//   npm run create-admin -- --email ana@empresa.com --name "Ana Pérez"
//
// Lee NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY y NEXT_PUBLIC_SITE_URL de
// .env.local (node --env-file). Si defines ADMIN_PASSWORD en el entorno, la
// cuenta queda con esa contraseña; si no, se imprime un enlace de un solo uso
// para que la persona cree su contraseña (no requiere SMTP).
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values } = parseArgs({
  options: { email: { type: "string" }, name: { type: "string" } },
});

const email = values.email?.trim().toLowerCase();
const name = values.name?.trim() || email?.split("@")[0];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Uso: npm run create-admin -- --email correo@empresa.com --name "Nombre"');
  process.exit(1);
}
if (!url || !secret) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local.");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
let userId = existing?.id as string | undefined;

if (!userId) {
  const password = process.env.ADMIN_PASSWORD;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: password || crypto.randomUUID() + crypto.randomUUID(),
    user_metadata: { name },
  });
  if (error || !data.user) {
    console.error("No se pudo crear el usuario:", error?.message);
    process.exit(1);
  }
  userId = data.user.id;
  console.log(`Usuario creado: ${email}`);
} else {
  console.log(`El usuario ${email} ya existía.`);
}

const { error: promoteError } = await admin.from("profiles").update({ is_admin: true, name }).eq("id", userId);
if (promoteError) {
  console.error("No se pudo marcar como admin:", promoteError.message);
  process.exit(1);
}
console.log("Marcado como admin global.");

if (!process.env.ADMIN_PASSWORD) {
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (linkError || !link) {
    console.error("No se pudo generar el enlace para crear la contraseña:", linkError?.message);
    process.exit(1);
  }
  const confirm = `${siteUrl}/auth/confirm?token_hash=${link.properties.hashed_token}&type=recovery&next=/restablecer`;
  console.log("\nAbre este enlace (un solo uso) con la app corriendo para crear la contraseña:\n");
  console.log(confirm);
}
