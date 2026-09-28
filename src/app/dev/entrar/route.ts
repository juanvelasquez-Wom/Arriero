import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Acceso directo SOLO para desarrollo local: inicia sesión sin contraseña con
// la cuenta de DEV_AUTO_LOGIN_EMAIL. En producción responde 404 siempre.
export const dynamic = "force-dynamic";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Solo desde este mismo equipo: el host pedido y el origen de la conexión deben
 * ser locales. Así, aunque `next dev` escuche en 0.0.0.0, nadie en la red entra.
 */
function isLocalRequest(request: NextRequest): boolean {
  const host = request.nextUrl.hostname;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const remoteIsLocal = !forwarded || forwarded === "127.0.0.1" || forwarded === "::1" || forwarded === "::ffff:127.0.0.1";
  return LOCAL_HOSTS.has(host) && remoteIsLocal;
}

export async function GET(request: NextRequest) {
  const email = process.env.DEV_AUTO_LOGIN_EMAIL;
  if (process.env.NODE_ENV === "production" || !email || !isLocalRequest(request)) {
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
