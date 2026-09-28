"use client";

import { ListChecks, Rocket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/app/form";
import { advanceOnEnter, onWizardSubmit, useStepper, WizardDots, WizardFooter, WizardProgress, WizardStage } from "@/components/app/step-wizard";
import { celebrate, CELEBRATIONS } from "@/components/brand/celebrate";
import { formatDate } from "@/domain/format";
import { GENERIC_TEMPLATE, TELCO_TEMPLATES } from "@/domain/growth-templates";
import {
  CUSTOM_LINE_KEY,
  DEFAULT_QUICK_DURATION,
  quickProgramEnd,
  quickTreeMetrics,
  suggestProgramName,
  typicalTelcoCalendar,
  type QuickDuration,
  type QuickLineInput,
} from "@/domain/quick-start";
import { linkIdea } from "@/server/actions/ideas";
import { linkInsight } from "@/server/actions/insights";
import { saveQuickStart } from "@/server/actions/setup";
import { QUICK_STEPS, STEP_TEXT, stepForField, validateQuickStep, type QuickStepKey } from "./flow";
import { CalendarScreen, DatesScreen, LinesScreen, NameScreen, SummaryScreen } from "./screens";

/**
 * Arranque rápido como asistente: una pregunta por pantalla (nombre, líneas,
 * fechas, calendario) y un resumen antes de crear. Usa el mismo plan de
 * dominio y la misma server action que el formulario de una sola pantalla.
 */
export function QuickWizard({
  today,
  fullHref,
  insight,
  idea,
}: {
  today: string;
  fullHref: string;
  /** Si el programa nace de un insight: al crearlo, el insight queda «Sembrado» en él. */
  insight?: { id: string; title: string } | null;
  /** Si nace de una idea de la lluvia de ideas: al crearlo, la idea queda vinculada. */
  idea?: { id: string; title: string } | null;
}) {
  const router = useRouter();
  const step = useStepper(QUICK_STEPS);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([TELCO_TEMPLATES[0].key]);
  const [customOn, setCustomOn] = useState(false);
  const [lineName, setLineName] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [months, setMonths] = useState<QuickDuration>(DEFAULT_QUICK_DURATION);
  const [useTelcoCalendar, setUseTelcoCalendar] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState(false);
  const [pending, startTransition] = useTransition();

  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate);
  const end = validStart ? quickProgramEnd(startDate, months) : null;
  const chosen = TELCO_TEMPLATES.filter((t) => selected.includes(t.key));
  const lines: QuickLineInput[] = [
    ...chosen.map((t) => ({ templateKey: t.key })),
    ...(customOn ? [{ templateKey: CUSTOM_LINE_KEY, lineName }] : []),
  ];
  const lineNames = [...chosen.map((t) => t.name), ...(customOn ? [lineName.trim() || "su línea"] : [])];
  const suggestion = suggestProgramName(lineNames, validStart ? startDate : null, months);
  const telcoEvents = end ? typicalTelcoCalendar(startDate, end) : [];
  const peaks = telcoEvents.filter((e) => e.type === "peak").length;
  const decision = telcoEvents.find((e) => e.type === "decision")?.start_date ?? null;
  const metricsCount = chosen.reduce((n, t) => n + quickTreeMetrics(t).length, 0) + (customOn ? quickTreeMetrics(GENERIC_TEMPLATE).length : 0);

  const toggle = (key: string) => setSelected((s) => (s.includes(key) ? s.filter((x) => x !== key) : [...s, key]));

  function create() {
    startTransition(async () => {
      const r = await saveQuickStart({ name, lines, startDate, months, useTelcoCalendar });
      if (!r.ok) {
        setError(r.error);
        if (r.fieldErrors) {
          const map: Record<string, string> = {};
          let first: QuickStepKey | null = null;
          for (const [k, m] of Object.entries(r.fieldErrors)) {
            const key = k.endsWith("lineName") ? "lineName" : k.startsWith("lines") ? "lines" : k;
            map[key] = m[0];
            first ??= stepForField(key);
          }
          setErrors(map);
          if (first && first !== "resumen") step.goTo(first);
        }
        return;
      }
      setCreated(true);
      if (insight) {
        const linked = await linkInsight(insight.id, { programId: r.data.programId });
        if (!linked.ok) toast.error(`El programa quedó, pero no se pudo marcar el insight: ${linked.error}`);
      }
      if (idea) {
        const linked = await linkIdea(idea.id, { programId: r.data.programId });
        if (!linked.ok) toast.error(`El programa quedó, pero no se pudo vincular la idea: ${linked.error}`);
      }
      if (r.data.partialError) {
        toast.error(r.data.partialError, { duration: 12000 });
      } else {
        celebrate(CELEBRATIONS.setupDone[0], r.message);
      }
      router.push(r.data.href);
    });
  }

  function advance() {
    setError(undefined);
    const found = validateQuickStep(step.key, { lines, customOn, lineName, startDate });
    setErrors(found);
    if (Object.keys(found).length) {
      if (found.lineName) document.getElementById("q-line")?.focus();
      return;
    }
    if (step.isLast) create();
    else step.next();
  }

  const text = STEP_TEXT[step.key];
  const progress = created ? 1 : step.index / (QUICK_STEPS.length - 1);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-paper px-4 pt-3 pb-4 shadow-card sm:px-5">
        <WizardProgress
          value={progress}
          label={`Paso ${step.index + 1} de ${QUICK_STEPS.length} · ${text.label}`}
          detail={created ? "¡Programa armado!" : step.isLast ? "Listo para arrancar" : "Unos 3 minutos en total"}
        />
      </div>

      <form
        noValidate
        onSubmit={onWizardSubmit(advance)}
        onKeyDown={advanceOnEnter}
        className="rounded-2xl border bg-paper p-5 shadow-card sm:p-7"
        aria-busy={pending}
      >
        <div className="mb-4 flex justify-end">
          <WizardDots
            count={QUICK_STEPS.length}
            index={step.index}
            onPick={pending ? undefined : step.goTo}
            labels={QUICK_STEPS.map((k) => STEP_TEXT[k].label)}
          />
        </div>
        <FormError message={error} className="mb-4" />
        <fieldset disabled={pending || created} className="min-w-0">
          <WizardStage stepKey={step.key} direction={step.direction} title={text.title} subtitle={text.subtitle}>
            {step.key === "nombre" ? <NameScreen name={name} onName={setName} suggestion={suggestion} error={errors.name} /> : null}
            {step.key === "lineas" ? (
              <LinesScreen
                selected={selected}
                onToggle={toggle}
                customOn={customOn}
                onCustom={() => setCustomOn((v) => !v)}
                lineName={lineName}
                onLineName={setLineName}
                errors={errors}
              />
            ) : null}
            {step.key === "fechas" ? (
              <DatesScreen startDate={startDate} onStart={setStartDate} months={months} onMonths={setMonths} end={end} error={errors.startDate} />
            ) : null}
            {step.key === "calendario" ? <CalendarScreen useTelco={useTelcoCalendar} onUseTelco={setUseTelcoCalendar} events={telcoEvents} /> : null}
            {step.key === "resumen" ? (
              <SummaryScreen
                onEdit={step.goTo}
                summary={{
                  name: name.trim() || suggestion,
                  period: end ? `${formatDate(startDate)} al ${formatDate(end)} (${months} meses)` : "Sin fechas válidas",
                  lineNames,
                  metricsCount,
                  calendar: useTelcoCalendar
                    ? `Típico de telco: ${peaks} pico(s) con sus congelamientos${decision ? `, decisión el ${formatDate(decision)}` : ""} y horizontes ${decision ? "H1 y H2" : "H1"}`
                    : "Sin calendario comercial: un solo horizonte (H1) para todo el periodo",
                }}
              />
            ) : null}
          </WizardStage>
        </fieldset>

        <WizardFooter
          onBack={step.isFirst ? undefined : step.back}
          pending={pending || created}
          nextLabel={step.isLast ? "Arme el programa" : "Siga"}
          nextIcon={step.isLast ? <Rocket aria-hidden /> : undefined}
        />
      </form>

      <p className="text-center text-sm">
        <Link href={fullHref} className="inline-flex min-h-11 items-center gap-1.5 text-soft underline underline-offset-4 hover:text-ink">
          <ListChecks className="size-4" aria-hidden /> Prefiero configurarlo todo paso a paso
        </Link>
      </p>
    </div>
  );
}
