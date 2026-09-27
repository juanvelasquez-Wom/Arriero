import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeleteButton } from "@/components/app/delete-button";
import { STEP_HELP } from "@/components/setup/help-content";
import { StepCalendar } from "@/components/setup/steps/step-calendar";
import { StepLine } from "@/components/setup/steps/step-line";
import { StepLines } from "@/components/setup/steps/step-lines";
import { StepProgram } from "@/components/setup/steps/step-program";
import { StepScoring } from "@/components/setup/steps/step-scoring";
import {
  StepSummary,
  type OptionalItem,
  type SummaryItem,
} from "@/components/setup/steps/step-summary";
import { StepTeam } from "@/components/setup/steps/step-team";
import { WizardShell } from "@/components/setup/wizard-shell";
import { formatDate, formatDateRange } from "@/domain/format";
import { templateForLine } from "@/domain/growth-templates";
import { can } from "@/domain/permissions";
import {
  isReachable,
  MAIN_STEPS,
  nextStep,
  OPTIONAL_STEPS,
  parseStep,
  previousStep,
  resumeStep,
  stepHref,
  type StepRef,
} from "@/domain/setup-flow";
import { getProgramContext } from "@/server/auth";
import { loadSetup } from "@/server/queries/setup";

export const metadata: Metadata = { title: "Configuración del programa" };

export default async function SetupPage({
  params,
  searchParams,
}: PageProps<"/programas/[programId]/configuracion">) {
  const { programId } = await params;
  const sp = await searchParams;
  const ctx = await getProgramContext(programId);
  if (!can.editStructure(ctx.actor) && !can.manageMembers(ctx.actor))
    redirect(`/programas/${programId}`);

  const data = await loadSetup(ctx);
  const lineRefs = data.lines.map((l) => ({ id: l.id, name: l.name }));
  const requested = parseStep(sp.paso, sp.linea);

  // "avanzar": el paso anterior guardó y la página calcula el siguiente con datos frescos.
  if (requested && sp.avanzar === "1") {
    const next = nextStep(requested, lineRefs);
    redirect(stepHref(programId, next ?? { key: "resumen" }));
  }

  const validLine =
    !requested?.lineId || lineRefs.some((l) => l.id === requested.lineId);
  // Sin paso, con una línea inexistente o con un paso aún bloqueado: al paso que toca.
  if (!requested || !validLine || !isReachable(requested, data.state)) {
    redirect(stepHref(programId, resumeStep(data.state)));
  }
  // Enlaces viejos (?paso=horizontes, ?paso=linea-arbol…): a la clave nueva.
  if (typeof sp.paso === "string" && sp.paso !== requested.key)
    redirect(stepHref(programId, requested));
  const current: StepRef = requested;

  const prev = previousStep(current, lineRefs);
  const next = nextStep(current, lineRefs);
  const prevHref = prev ? stepHref(programId, prev) : null;
  const nextHref = stepHref(programId, next ?? { key: "resumen" });
  const program = {
    start_date: ctx.program.start_date ?? "",
    end_date: ctx.program.end_date ?? "",
  };
  const decision =
    data.calendar.find((e) => e.type === "decision")?.start_date ?? null;
  const editStructure = can.editStructure(ctx.actor);
  const manage = can.editProgramSettings(ctx.actor);

  const line = current.lineId
    ? data.lines.find((l) => l.id === current.lineId)!
    : null;
  const lineIndex = line ? data.lines.findIndex((l) => l.id === line.id) : -1;

  const label = [...MAIN_STEPS, ...OPTIONAL_STEPS].find(
    (s) => s.key === current.key,
  )?.label;
  const title = line ? `Configurar ${line.name}` : (label ?? "Configuración");

  const subtitles: Partial<Record<StepRef["key"], string>> = {
    programa: "Póngale nombre y defina el periodo del plan.",
    calendario:
      "Los picos de venta, sus congelamientos y el punto de decisión. Los horizontes se acomodan solos.",
    lineas: "Elija los negocios que va a medir por aparte.",
    linea:
      "Métrica norte, árbol y embudo, todo en una pantalla y ya sugerido. Revise y siga.",
    equipo: "Opcional: invite a las personas y asígneles su rol.",
    puntaje:
      "Opcional: cómo se ordenan los ejercicios en el backlog. Los valores por defecto sirven.",
    resumen:
      "Revise lo que dejó listo y dé el primer paso. Paso a paso se sube la montaña.",
  };

  let body: React.ReactNode = null;
  switch (current.key) {
    case "programa":
      body = (
        <>
          <StepProgram
            programId={programId}
            readOnly={!manage}
            defaults={{
              name: ctx.program.name,
              description: ctx.program.description ?? "",
              start_date: program.start_date,
              end_date: program.end_date,
            }}
          />
          {can.deleteProgram(ctx.actor) && !ctx.program.is_demo ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed px-4 py-3 text-sm">
              <span className="text-soft">
                ¿Se equivocó de camino? El programa va a la papelera y se puede
                restaurar durante 30 días.
              </span>
              <DeleteButton
                entity="program"
                id={programId}
                programId={programId}
                name={ctx.program.name}
                label="Borrar programa"
                variant="ghost"
                redirectTo="/programas"
              />
            </div>
          ) : null}
        </>
      );
      break;
    case "calendario":
      body = (
        <StepCalendar
          programId={programId}
          program={program}
          events={data.calendar}
          horizons={data.horizons.map((h) => ({
            id: h.id,
            name: h.name,
            start_date: h.start_date,
            end_date: h.end_date,
          }))}
          suggestTypical={
            data.state.setupStep < 3 &&
            data.calendar.length === 0 &&
            !!program.start_date
          }
          prevHref={prevHref!}
          nextHref={nextHref}
          readOnly={!can.editCalendar(ctx.actor)}
          canEditHorizons={manage}
        />
      );
      break;
    case "lineas":
      body = (
        <StepLines
          programId={programId}
          existing={lineRefs}
          prevHref={prevHref!}
          advanceHref={`${stepHref(programId, { key: "lineas" })}&avanzar=1`}
          canDelete={can.deleteStructure(ctx.actor)}
          readOnly={!editStructure}
        />
      );
      break;
    case "linea": {
      const isLast = lineIndex === data.lines.length - 1;
      body = (
        <StepLine
          key={line!.id}
          programId={programId}
          line={line!}
          metrics={line!.metrics}
          stages={line!.stages}
          template={templateForLine(line!.name)}
          horizons={data.horizons}
          prevHref={prevHref!}
          nextHref={nextHref}
          nextLabel={
            isLast
              ? "Guarde y vaya al resumen"
              : `Guarde y siga con ${data.lines[lineIndex + 1].name}`
          }
          readOnly={!editStructure}
        />
      );
      break;
    }
    case "equipo":
      body = (
        <StepTeam
          programId={programId}
          members={data.members}
          currentUserId={ctx.user.id}
          canManage={can.manageMembers(ctx.actor)}
          prevHref={prevHref!}
          nextHref={nextHref}
        />
      );
      break;
    case "puntaje":
      body = (
        <StepScoring
          programId={programId}
          config={ctx.program.scoring_config}
          canEdit={manage}
          prevHref={prevHref!}
          nextHref={nextHref}
        />
      );
      break;
    case "resumen": {
      const peaks = data.calendar.filter((e) => e.type === "peak").length;
      const freezes = data.calendar.filter((e) => e.type === "freeze").length;
      const items: SummaryItem[] = [
        {
          label: "Programa",
          detail: `${ctx.program.name} · ${formatDateRange(ctx.program.start_date, ctx.program.end_date)}`,
          ok: !!program.start_date,
          href: stepHref(programId, { key: "programa" }),
        },
        {
          label: "Calendario y horizontes",
          detail: `${peaks} pico(s), ${freezes} congelamiento(s)${decision ? ` · decisión el ${formatDate(decision)}` : " · sin punto de decisión"} · ${
            data.horizons
              .map(
                (h) =>
                  `${h.name}: ${formatDateRange(h.start_date, h.end_date)}`,
              )
              .join(" · ") || "sin horizontes"
          }`,
          ok: !!decision && data.horizons.length > 0,
          href: stepHref(programId, { key: "calendario" }),
        },
        ...data.lines.map((l) => {
          const ns = l.metrics.find((m) => m.type === "north_star");
          const inputs = l.metrics.filter((m) => m.type === "input").length;
          const missingGoals =
            !!ns &&
            (ns.baseline == null ||
              data.horizons.some(
                (h) => !ns.targets.some((t) => t.horizon_id === h.id),
              ));
          return {
            label: `Línea · ${l.name}`,
            detail: ns
              ? `Norte: ${ns.name} · ${inputs} métrica(s) de entrada · ${l.stages.length} etapas${missingGoals ? " · faltan línea base o metas" : ""}`
              : "Falta configurarla: métrica norte, árbol y embudo",
            ok: !!ns && inputs > 0 && !missingGoals,
            href: stepHref(programId, { key: "linea", lineId: l.id }),
          };
        }),
      ];
      const cfg = ctx.program.scoring_config;
      const optional: OptionalItem[] = [
        {
          kind: "team",
          label:
            data.members.length > 1
              ? `Equipo · ${data.members.length} personas`
              : "Invite al equipo",
          detail:
            data.members.length > 1
              ? "Revise quién está y con qué rol."
              : "Por ahora va solo. Invite a quien va a trabajar con usted.",
          href: stepHref(programId, { key: "equipo" }),
        },
        {
          kind: "scoring",
          label: "Ajuste el puntaje",
          detail: `Bono calendario +${cfg.calendar_bonus} · compartido −${cfg.shared_penalty} · externo −${cfg.external_penalty}`,
          href: stepHref(programId, { key: "puntaje" }),
        },
      ];
      body = (
        <StepSummary
          programId={programId}
          items={items}
          optional={optional}
          prevHref={prevHref ?? stepHref(programId, { key: "lineas" })}
          completed={data.state.completed}
          canFinish={manage}
        />
      );
      break;
    }
  }

  return (
    <WizardShell
      programId={programId}
      current={current}
      state={data.state}
      lines={lineRefs}
      help={STEP_HELP[current.key]}
      title={title}
      subtitle={subtitles[current.key]}
    >
      {body}
    </WizardShell>
  );
}
