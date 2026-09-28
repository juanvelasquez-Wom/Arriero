import { CloudRain, Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import { getIdeaForLink } from "@/server/queries/ideas";
import { getInsight } from "@/server/queries/insights";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { GrowthPrimer } from "@/components/setup/growth-primer";
import { TiaShortcut } from "@/components/tia/tia-copilot";
import { STEP_HELP } from "@/components/setup/help-content";
import { QuickWizard } from "@/components/setup/quick-wizard/quick-wizard";
import { StepProgram } from "@/components/setup/steps/step-program";
import { WizardShell } from "@/components/setup/wizard-shell";
import { todayIso } from "@/domain/dates";
import { DEFAULT_QUICK_DURATION, quickProgramEnd } from "@/domain/quick-start";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Arme su proyecto de growth" };

const QUICK_HREF = "/programas/nuevo";
const FULL_HREF = "/programas/nuevo?paso=programa";

// /programas/nuevo abre directo el arranque rápido, como asistente de una
// pregunta por pantalla (?paso=rapido sigue funcionando por enlaces viejos).
// ?paso=programa es el primer paso del asistente completo, antes de que exista
// el programa.
export default async function NewProgramPage({ searchParams }: PageProps<"/programas/nuevo">) {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/programas");
  const sp = await searchParams;
  const today = todayIso();
  const insightParam = typeof sp.insight === "string" && /^[0-9a-f-]{36}$/i.test(sp.insight) ? sp.insight : null;
  const insight = insightParam ? await getInsight(insightParam, user.id) : null;
  // Desde la lluvia de ideas: una idea decidida «para proyecto».
  const ideaParam = typeof sp.idea === "string" && /^[0-9a-f-]{36}$/i.test(sp.idea) ? sp.idea : null;
  const idea = ideaParam ? await getIdeaForLink(ideaParam, user.id) : null;

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
    content = (
      <div className="mx-auto max-w-3xl">
        <div className="mb-5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-soft">Nuevo programa · 5 pasos cortos</div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Arme su proyecto de growth</h1>
          <p className="mt-1 text-soft">Una pregunta a la vez. Arriero pone el resto con lo típico de telco. Menos carreta, más camino.</p>
        </div>
        {!insight && !idea ? (
          <TiaShortcut mode="project" text="¿Más rápido? Cuéntele a La Tía qué proyecto quiere, en una frase, y ella lo arma y le pregunta solo lo que falte." />
        ) : null}
        {insight ? (
          <p className="mb-4 flex gap-2 rounded-2xl border-l-4 border-highlight bg-paper px-4 py-3 text-sm">
            <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Este proyecto nace del insight «{insight.title}», de {insight.author_name}. Al crearlo, el insight queda sembrado aquí. De ahí sale
              su primera oportunidad de mejora.
            </span>
          </p>
        ) : null}
        {idea ? (
          <p className="mb-4 flex gap-2 rounded-2xl border-l-4 border-highlight bg-paper px-4 py-3 text-sm">
            <CloudRain aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Este proyecto nace de la idea «{idea.title}», del aguacero «{idea.sessionTitle}». Al crearlo, la idea queda vinculada aquí. Llovió y
              cosechamos.
            </span>
          </p>
        ) : null}
        <QuickWizard
          today={today}
          fullHref={FULL_HREF}
          insight={insight ? { id: insight.id, title: insight.title } : null}
          idea={idea ? { id: idea.id, title: idea.title } : null}
        />
        <div className="mt-6">
          <GrowthPrimer defaultOpen={false} />
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
