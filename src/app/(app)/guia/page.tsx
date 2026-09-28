import type { Metadata } from "next";
import { AppHeader } from "@/components/app/app-header";
import { TourDeck } from "@/components/learn/tour-deck";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Cómo se usa el Arriero" };

export default async function GuidePage() {
  const user = await requireUser();
  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
        <header className="rise mb-5">
          <h1 className="text-2xl font-extrabold sm:text-3xl">Quiero saber cómo utilizar el Arriero</h1>
          <p className="mt-1 text-[15px] text-soft">Un recorrido de doce pasos por la app, de la barra de arriba a los permisos. Sin carreta.</p>
        </header>
        <TourDeck />
      </main>
    </>
  );
}
