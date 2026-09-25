import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function ResetPage({ searchParams }: PageProps<"/restablecer">) {
  const user = await getSessionUser();
  if (!user) redirect("/login?error=enlace");
  const params = await searchParams;
  const isInvite = params.invitacion === "1";
  return (
    <>
      <h1 className="text-xl font-semibold">{isInvite ? "Bienvenido" : "Nueva contraseña"}</h1>
      <p className="mt-1 text-sm text-soft">
        {isInvite ? `Crea tu contraseña para entrar como ${user.email}.` : `Cuenta: ${user.email}`}
      </p>
      <ResetForm askName={isInvite} defaultName={user.name === user.email ? "" : user.name} />
    </>
  );
}
