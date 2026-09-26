import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { STEP_HELP } from "@/components/setup/help-content";
import { StepProgram } from "@/components/setup/steps/step-program";
import { StepWelcome } from "@/components/setup/steps/step-welcome";
import { WizardShell } from "@/components/setup/wizard-shell";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Crear programa" };

export default async function NewProgramPage({ searchParams }: PageProps<"/programas/nuevo">) {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/programas");
  const sp = await searchParams;
  const started = sp.paso === "programa";

  return (
    <>
      <AppHeader user={user} />
      <main className="w-full flex-1 px-4 py-8 lg:px-8">
        {started ? (
          <WizardShell
            programId={null}
            current={{ key: "programa" }}
            state={{ setupStep: 0, completed: false, hasDates: false, lines: [] }}
            lines={[]}
            help={STEP_HELP.programa}
            title="El programa"
            subtitle="Ponle nombre y define el periodo del plan."
          >
            <StepProgram programId={null} defaults={{ name: "", description: "", start_date: "", end_date: "" }} />
          </WizardShell>
        ) : (
          <StepWelcome startHref="/programas/nuevo?paso=programa" />
        )}
      </main>
    </>
  );
}
