import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const reason = typeof params.error === "string" ? params.error : undefined;
  return (
    <>
      <h1 className="text-xl font-semibold">Iniciar sesión</h1>
      <p className="mt-1 text-sm text-soft">Entra con el correo con el que te invitaron.</p>
      <LoginForm next={next} initialError={reason === "enlace" ? "El enlace no es válido o ya venció." : undefined} />
      {process.env.NODE_ENV !== "production" && process.env.DEV_AUTO_LOGIN_EMAIL ? (
        <a
          href="/dev/entrar"
          className="mt-4 block rounded-md border border-dashed px-3 py-2 text-center text-sm text-soft hover:border-ink/40 hover:text-ink"
        >
          Entrar sin contraseña (solo desarrollo)
        </a>
      ) : null}
    </>
  );
}
