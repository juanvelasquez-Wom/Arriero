import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader, Section } from "@/components/app/page";
import { BasicsForm } from "@/components/setup/basics-form";
import { CalendarStep } from "@/components/setup/calendar-step";
import { LinesStep } from "@/components/setup/lines-step";
import { MembersStep } from "@/components/setup/members-step";
import { ScoringStep } from "@/components/setup/scoring-step";
import { SETUP_STEPS, SetupStepper } from "@/components/setup/setup-stepper";
import { can } from "@/domain/permissions";
import { getProgramContext } from "@/server/auth";
import { listCalendar, listHorizons, listLines, listMembers } from "@/server/queries/programs";

export const metadata: Metadata = { title: "Configuración del programa" };

export default async function SetupPage({ params, searchParams }: PageProps<"/programas/[programId]/configuracion">) {
  const { programId } = await params;
  const sp = await searchParams;
  const ctx = await getProgramContext(programId);
  if (!can.editStructure(ctx.actor) && !can.manageMembers(ctx.actor)) redirect(`/programas/${programId}`);

  const reached = ctx.program.setup_step;
  const completed = !!ctx.program.setup_completed_at;
  const requested = Number(sp.paso);
  // Sin paso explícito se retoma donde quedó.
  const step = Number.isInteger(requested) && requested >= 1 && requested <= 5 ? requested : completed ? 1 : Math.min(reached + 1, 5);
  const base = `/programas/${programId}/configuracion`;

  const [horizons, lines, calendar, members] = await Promise.all([
    listHorizons(programId),
    listLines(programId),
    listCalendar(programId),
    listMembers(programId),
  ]);

  const title = SETUP_STEPS.find((s) => s.n === step)!.label;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow={completed ? "Configuración" : "Asistente de configuración"}
        title={title}
        description={
          completed
            ? "Puedes volver a cualquier paso para ajustar el programa."
            : "Puedes dejarlo a medias: se retoma en el último paso guardado."
        }
      />
      <SetupStepper current={step} reached={reached} baseHref={base} />
      <Section>
        {step === 1 ? (
          <BasicsForm
            programId={programId}
            readOnly={!can.editProgramSettings(ctx.actor)}
            defaults={{
              name: ctx.program.name,
              description: ctx.program.description ?? "",
              start_date: ctx.program.start_date ?? "",
              end_date: ctx.program.end_date ?? "",
              horizons: horizons.length
                ? horizons.map((h) => ({ id: h.id, name: h.name, start_date: h.start_date, end_date: h.end_date }))
                : [{ name: "H1", start_date: "", end_date: "" }],
            }}
          />
        ) : null}
        {step === 2 ? (
          <LinesStep
            programId={programId}
            lines={lines}
            canEdit={can.editStructure(ctx.actor)}
            canDelete={can.deleteStructure(ctx.actor)}
          />
        ) : null}
        {step === 3 ? <CalendarStep programId={programId} events={calendar} canEdit={can.editCalendar(ctx.actor)} /> : null}
        {step === 4 ? (
          <MembersStep
            programId={programId}
            members={members}
            currentUserId={ctx.user.id}
            canManage={can.manageMembers(ctx.actor)}
          />
        ) : null}
        {step === 5 ? (
          <ScoringStep
            programId={programId}
            config={ctx.program.scoring_config}
            canEdit={can.editProgramSettings(ctx.actor)}
            completed={completed}
          />
        ) : null}
      </Section>
    </div>
  );
}
