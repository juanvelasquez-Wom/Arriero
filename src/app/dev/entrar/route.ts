import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Acceso directo SOLO para desarrollo local: inicia sesión sin contraseña con
// la cuenta de DEV_AUTO_LOGIN_EMAIL. En producción responde 404 siempre.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const email = process.env.DEV_AUTO_LOGIN_EMAIL;
  if (process.env.NODE_ENV === "production" || !email) {
    return new NextResponse("No encontrado", { status: 404 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data) {
    return NextResponse.redirect(new URL("/login?error=enlace", request.url));
  }
  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError) {
    return NextResponse.redirect(new URL("/login?error=enlace", request.url));
  }
  return NextResponse.redirect(new URL("/programas", request.url));
}
