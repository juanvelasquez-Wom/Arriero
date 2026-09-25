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
    </>
  );
}
