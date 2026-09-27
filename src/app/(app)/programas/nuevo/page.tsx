import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { Mule } from "@/components/brand/logo";
import { GrowthPrimer } from "@/components/setup/growth-primer";
import { STEP_HELP } from "@/components/setup/help-content";
import { StepProgram } from "@/components/setup/steps/step-program";
import { WizardShell } from "@/components/setup/wizard-shell";
import { todayIso } from "@/domain/dates";
import { DEFAULT_QUICK_DURATION, quickProgramEnd } from "@/domain/quick-start";
import { requireUser } from "@/server/auth";
import { listMyPrograms } from "@/server/queries/programs";
import { QuickStartForm } from "./quick-start-form";

export const metadata: Metadata = { title: "Cree un programa" };

const QUICK_HREF = "/programas/nuevo";
const FULL_HREF = "/programas/nuevo?paso=programa";

// /programas/nuevo abre directo el arranque rápido (?paso=rapido sigue
// funcionando por enlaces viejos). ?paso=programa es el primer paso del
// asistente completo, antes de que exista el programa.
export default async function NewProgramPage({ searchParams }: PageProps<"/programas/nuevo">) {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/programas");
  const sp = await searchParams;
  const today = todayIso();

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
        subtitle="Póngale nombre y defina el periodo del plan. Le dejamos seis meses desde hoy; ajústelo si quiere."
      >
        <StepProgram
          programId={null}
          prevHref={QUICK_HREF}
          defaults={{ name: "", description: "", start_date: today, end_date: quickProgramEnd(today, DEFAULT_QUICK_DURATION) }}
        />
      </WizardShell>
    );
  } else {
    const programs = await listMyPrograms(user.id);
    const hasPrograms = programs.some((p) => !p.is_demo);
    content = (
      <div className="slide-in mx-auto max-w-5xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-soft">Nuevo programa · 3 minutos</div>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Arme el programa de una</h1>
            <p className="mt-1 max-w-2xl text-soft">
              Elija sus líneas y el periodo; Arriero pone el resto con lo típico de telco, para que llegue rápido a lo que importa: el primer
              problema. Menos carreta, más camino.
            </p>
          </div>
          <Mule className="hidden w-16 shrink-0 sm:block" />
        </div>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <QuickStartForm today={today} fullHref={FULL_HREF} />
          <div className="lg:sticky lg:top-16">
            <GrowthPrimer defaultOpen={!hasPrograms} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <AppHeader user={user} />
      <main className="w-full flex-1 px-4 py-8 lg:px-8">{content}</main>
    </>
  );
}
