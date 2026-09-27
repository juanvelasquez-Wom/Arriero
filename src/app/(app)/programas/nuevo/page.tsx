import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { HelpPanel } from "@/components/setup/help";
import { QUICK_START_HELP, STEP_HELP } from "@/components/setup/help-content";
import { StepProgram } from "@/components/setup/steps/step-program";
import { StepWelcome } from "@/components/setup/steps/step-welcome";
import { WizardShell } from "@/components/setup/wizard-shell";
import { todayIso } from "@/domain/dates";
import { requireUser } from "@/server/auth";
import { QuickStartForm } from "./quick-start-form";

export const metadata: Metadata = { title: "Cree un programa" };

const WELCOME_HREF = "/programas/nuevo";
const QUICK_HREF = "/programas/nuevo?paso=rapido";
const FULL_HREF = "/programas/nuevo?paso=programa";

export default async function NewProgramPage({ searchParams }: PageProps<"/programas/nuevo">) {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/programas");
  const sp = await searchParams;

  let content: React.ReactNode;
  if (sp.paso === "programa") {
    content = (
      <WizardShell
        programId={null}
        current={{ key: "programa" }}
        state={{ setupStep: 0, completed: false, hasDates: false, lines: [] }}
        lines={[]}
        help={STEP_HELP.programa}
        title="El programa"
        subtitle="Póngale nombre y defina el periodo del plan."
      >
        <StepProgram programId={null} defaults={{ name: "", description: "", start_date: "", end_date: "" }} />
      </WizardShell>
    );
  } else if (sp.paso === "rapido") {
    content = (
      <div className="mx-auto max-w-5xl">
        <div className="mb-5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-soft">Arranque rápido · 3 minutos</div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Arme el programa de una</h1>
          <p className="mt-1 max-w-2xl text-soft">
            Cuatro datos y Arriero pone el resto con lo típico de telco, para que llegue rápido a lo que importa: el primer problema.
            Después puede completar líneas base, metas y más líneas en Configuración.
          </p>
        </div>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <QuickStartForm today={todayIso()} fullHref={FULL_HREF} backHref={WELCOME_HREF} />
          <HelpPanel help={QUICK_START_HELP} />
        </div>
      </div>
    );
  } else {
    content = <StepWelcome quickHref={QUICK_HREF} startHref={FULL_HREF} />;
  }

  return (
    <>
      <AppHeader user={user} />
      <main className="w-full flex-1 px-4 py-8 lg:px-8">{content}</main>
    </>
  );
}
