import type { Metadata } from "next";
import { RecoverForm } from "./recover-form";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecoverPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold">Recuperar la contraseña</h1>
      <p className="mt-1.5 text-sm text-soft">Le mandamos un enlace para que cree una nueva.</p>
      <RecoverForm />
    </>
  );
}
