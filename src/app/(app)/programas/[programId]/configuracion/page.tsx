import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { STEP_HELP } from "@/components/setup/help-content";
import { StepCalendar } from "@/components/setup/steps/step-calendar";
import { StepHorizons } from "@/components/setup/steps/step-horizons";
import { StepLineFunnel } from "@/components/setup/steps/step-line-funnel";
import { StepLineNorth } from "@/components/setup/steps/step-line-north";
import { StepLineTree } from "@/components/setup/steps/step-line-tree";
import { StepLines } from "@/components/setup/steps/step-lines";
import { StepProgram } from "@/components/setup/steps/step-program";
import { StepScoring } from "@/components/setup/steps/step-scoring";
import { StepSummary, type SummaryItem } from "@/components/setup/steps/step-summary";
import { StepTeam } from "@/components/setup/steps/step-team";
import { WizardShell } from "@/components/setup/wizard-shell";
import { formatDate, formatDateRange } from "@/domain/format";
import { templateForLine } from "@/domain/growth-templates";
import { can } from "@/domain/permissions";
import {
  isReachable,
  MAIN_STEPS,
  nextStep,
  parseStep,
  previousStep,
  resumeStep,
  stepHref,
  SUBSTEP_LABEL,
  type LineSubstep,
  type StepRef,
} from "@/domain/setup-flow";
import { getProgramContext } from "@/server/auth";
import { loadSetup } from "@/server/queries/setup";

export const metadata: Metadata = { title: "Configuración del programa" };

export default async function SetupPage({ params, searchParams }: PageProps<"/programas/[programId]/configuracion">) {
  const { programId } = await params;
  const sp = await searchParams;
  const ctx = await getProgramContext(programId);
  if (!can.editStructure(ctx.actor) && !can.manageMembers(ctx.actor)) redirect(`/programas/${programId}`);

  const data = await loadSetup(ctx);
  const lineRefs = data.lines.map((l) => ({ id: l.id, name: l.name }));
  const requested = parseStep(sp.paso, sp.linea);

  // "avanzar": el paso anterior guardó y la página calcula el siguiente con datos frescos.
  if (requested && sp.avanzar === "1") {
    const next = nextStep(requested, lineRefs);
    redirect(stepHref(programId, next ?? { key: "resumen" }));
  }

  const validLine = !requested?.lineId || lineRefs.some((l) => l.id === requested.lineId);
  // Sin paso, con una línea inexistente o con un paso aún bloqueado: al paso que toca.
  if (!requested || !validLine || !isReachable(requested, data.state)) {
    redirect(stepHref(programId, resumeStep(data.state)));
  }
  const current: StepRef = requested;

  const prev = previousStep(current, lineRefs);
  const next = nextStep(current, lineRefs);
  const prevHref = prev ? stepHref(programId, prev) : null;
  const nextHref = stepHref(programId, next ?? { key: "resumen" });
  const program = { start_date: ctx.program.start_date ?? "", end_date: ctx.program.end_date ?? "" };
  const decision = data.calendar.find((e) => e.type === "decision")?.start_date ?? null;
  const editStructure = can.editStructure(ctx.actor);
  const manage = can.editProgramSettings(ctx.actor);

  const line = current.lineId ? data.lines.find((l) => l.id === current.lineId)! : null;
  const lineIndex = line ? data.lines.findIndex((l) => l.id === line.id) : -1;
  const template = line ? templateForLine(line.name) : null;

  const mainLabel = MAIN_STEPS.find((s) => s.key === current.key)?.label;
  const title = line ? `${SUBSTEP_LABEL[current.key as LineSubstep]} · ${line.name}` : (mainLabel ?? "Configuración");

  const subtitles: Partial<Record<StepRef["key"], string>> = {
    programa: "Póngale nombre y defina el periodo del plan.",
    calendario: "Marque los picos de venta, sus congelamientos y el punto de decisión.",
    horizontes: "Parta el programa en tramos, cada uno con su propia meta.",
    lineas: "Elija los negocios que va a medir por aparte.",
    "linea-norte": "El número que esta línea quiere crecer y cuánto cuesta crecerlo.",
    "linea-arbol": "Las métricas de entrada que explican la métrica norte y que el equipo sí puede mover.",
    "linea-embudo": "El recorrido del cliente en esta línea, para ubicar los problemas.",
    equipo: "Invite a las personas y asígneles su rol.",
    puntaje: "Cómo se ordenan los ejercicios en el backlog: primero lo que más mueve.",
    resumen: "Revise lo que dejó listo y dé el primer paso. Paso a paso se sube la montaña.",
  };

  let body: React.ReactNode = null;
  switch (current.key) {
    case "programa":
      body = (
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
      );
      break;
    case "calendario":
      body = <StepCalendar programId={programId} program={program} events={data.calendar} prevHref={prevHref!} nextHref={nextHref} readOnly={!can.editCalendar(ctx.actor)} />;
      break;
    case "horizontes":
      body = (
        <StepHorizons
          programId={programId}
          program={program}
          decisionDate={decision}
          existing={data.horizons.map((h) => ({ id: h.id, name: h.name, start_date: h.start_date, end_date: h.end_date }))}
          prevHref={prevHref!}
          nextHref={nextHref}
          readOnly={!manage}
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
    case "linea-norte":
      body = (
        <StepLineNorth
          key={line!.id}
          programId={programId}
          line={line!}
          lineIndex={lineIndex}
          lineCount={data.lines.length}
          northSuggestion={template!.northStar}
          efficiencySuggestion={template!.efficiency}
          existingNorth={line!.metrics.find((m) => m.type === "north_star")}
          existingEfficiency={line!.metrics.find((m) => m.type === "efficiency")}
          horizons={data.horizons}
          prevHref={prevHref!}
          nextHref={nextHref}
          readOnly={!editStructure}
        />
      );
      break;
    case "linea-arbol":
      body = (
        <StepLineTree
          key={line!.id}
          programId={programId}
          line={line!}
          lineIndex={lineIndex}
          lineCount={data.lines.length}
          northStarName={line!.metrics.find((m) => m.type === "north_star")?.name ?? null}
          existing={line!.metrics}
          template={template!}
          prevHref={prevHref!}
          nextHref={nextHref}
          readOnly={!editStructure}
        />
      );
      break;
    case "linea-embudo":
      body = (
        <StepLineFunnel
          key={line!.id}
          programId={programId}
          line={line!}
          lineIndex={lineIndex}
          lineCount={data.lines.length}
          stages={line!.stages}
          metrics={line!.metrics.filter((m) => m.type === "input")}
          template={template!}
          prevHref={prevHref!}
          nextHref={nextHref}
          isLastLine={lineIndex === data.lines.length - 1}
          readOnly={!editStructure}
        />
      );
      break;
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
      body = <StepScoring programId={programId} config={ctx.program.scoring_config} canEdit={manage} prevHref={prevHref!} nextHref={nextHref} />;
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
          label: "Calendario comercial",
          detail: `${peaks} pico(s), ${freezes} congelamiento(s)${decision ? ` · decisión el ${formatDate(decision)}` : " · sin punto de decisión"}`,
          ok: !!decision,
          href: stepHref(programId, { key: "calendario" }),
        },
        {
          label: "Horizontes",
          detail: data.horizons.map((h) => `${h.name}: ${formatDateRange(h.start_date, h.end_date)}`).join(" · ") || "Sin horizontes",
          ok: data.horizons.length > 0,
          href: stepHref(programId, { key: "horizontes" }),
        },
        ...data.lines.map((l) => {
          const ns = l.metrics.find((m) => m.type === "north_star");
          const inputs = l.metrics.filter((m) => m.type === "input").length;
          const missingGoals = !!ns && (ns.baseline == null || data.horizons.some((h) => !ns.targets.some((t) => t.horizon_id === h.id)));
          return {
            label: `Línea · ${l.name}`,
            detail: ns
              ? `Norte: ${ns.name} · ${inputs} métrica(s) de entrada · ${l.stages.length} etapas${missingGoals ? " · faltan línea base o metas" : ""}`
              : "Falta la métrica norte",
            ok: !!ns && inputs > 0 && !missingGoals,
            href: stepHref(programId, { key: ns ? (inputs ? "linea-embudo" : "linea-arbol") : "linea-norte", lineId: l.id }),
          };
        }),
        {
          label: "Equipo",
          detail: `${data.members.length} persona(s)`,
          ok: data.members.length > 1,
          href: stepHref(programId, { key: "equipo" }),
        },
        {
          label: "Reglas de priorización",
          detail: `Bono calendario +${ctx.program.scoring_config.calendar_bonus} · compartido −${ctx.program.scoring_config.shared_penalty} · externo −${ctx.program.scoring_config.external_penalty}`,
          ok: true,
          href: stepHref(programId, { key: "puntaje" }),
        },
      ];
      body = <StepSummary programId={programId} items={items} prevHref={prevHref!} completed={data.state.completed} canFinish={manage} />;
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
