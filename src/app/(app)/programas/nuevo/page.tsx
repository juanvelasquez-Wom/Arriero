import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { PageHeader, Section } from "@/components/app/page";
import { BasicsForm } from "@/components/setup/basics-form";
import { SetupStepper } from "@/components/setup/setup-stepper";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Crear programa" };

export default async function NewProgramPage() {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/programas");
  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <PageHeader
          eyebrow="Asistente de configuración"
          title="Crear programa"
          description="Primero los datos y los horizontes. Después: líneas, calendario, miembros y puntaje. Puedes retomarlo cuando quieras."
        />
        <SetupStepper current={1} reached={0} baseHref={null} />
        <Section>
          <BasicsForm programId={null} />
        </Section>
      </main>
    </>
  );
}
