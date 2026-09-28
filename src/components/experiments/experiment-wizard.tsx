"use client";

// Asistente de ejercicios en 5 pasos. Este archivo tiene el estado, el guardado
// y la navegación; cada paso vive en `./wizard/`.
import { Check, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { freezeWarning, plannedRange } from "@/domain/calendar";
import { inferCalendarFit, inferOwnerType, resolveFitsCalendar } from "@/domain/experiment-inference";
import { applyTemplate, type ExperimentTemplate } from "@/domain/experiment-templates";
import { computeFinalScore, computeIce } from "@/domain/scoring";
import { cn } from "@/lib/utils";
import { createExperiment, updateExperiment } from "@/server/actions/experiments";
import { StepDesign } from "./wizard/step-design";
import { StepHypothesis } from "./wizard/step-hypothesis";
import { StepOrigin } from "./wizard/step-origin";
import { StepPriority } from "./wizard/step-priority";
import { StepSchedule } from "./wizard/step-schedule";
import type { WizardData, WizardValues } from "./wizard-values";

const STEPS = [
  { n: 1, label: "Oportunidad y métrica" },
  { n: 2, label: "Hipótesis" },
  { n: 3, label: "Priorización" },
  { n: 4, label: "Diseño de la prueba" },
  { n: 5, label: "Responsable y fechas" },
];

const FIELD_LABEL: Record<string, string> = {
  title: "título",
  hypothesis_if: "SI",
  hypothesis_then: "ENTONCES",
  hypothesis_because: "PORQUE",
  test_type: "tipo de prueba",
  min_duration_days: "duración mínima",
  decision_rule: "regla de decisión",
  variants: "variantes",
};

export function ExperimentWizard({
  data,
  initial,
  experimentId,
  initialStep = 1,
  designLocked = false,
  initialUpdatedAt = null,
}: {
  data: WizardData;
  initial: WizardValues;
  experimentId?: string;
  initialStep?: number;
  designLocked?: boolean;
  initialUpdatedAt?: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [v, setV] = useState<WizardValues>(initial);
  const [id, setId] = useState(experimentId);
  const [version, setVersion] = useState<string | null>(initialUpdatedAt);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  // Lo que se deduce solo, mientras la persona no lo cambie a mano.
  const [controlTouched, setControlTouched] = useState(!!experimentId);
  const roleOf = (uid: string | null) => data.members.find((m) => m.user_id === uid)?.role ?? null;
  const [ownerTypeOpen, setOwnerTypeOpen] = useState(
    () => initial.owner_type != null && initial.owner_type !== inferOwnerType(roleOf(initial.owner_id)),
  );
  const set = <K extends keyof WizardValues>(k: K, value: WizardValues[K]) => setV((prev) => ({ ...prev, [k]: value }));
  const rigorReady = !!data.rigorReady;

  const problem = data.problems.find((p) => p.id === v.problem_id);
  const lineMetrics = data.metrics.filter((m) => m.line_id === problem?.line_id);
  const metric = lineMetrics.find((m) => m.id === v.metric_id);
  const ice = computeIce(v.impact, v.confidence, v.ease);
  const fit = inferCalendarFit(
    { planned_start: v.planned_start || null, planned_end: v.planned_end || null, min_duration_days: v.min_duration_days },
    data.calendar,
  );
  const fitsCalendar = resolveFitsCalendar({ manual: v.fits_calendar, override: v.fits_calendar_override, inferred: fit.fits });
  const final = computeFinalScore(ice, fitsCalendar, v.control, data.scoring);
  const freeze = freezeWarning(
    plannedRange({ planned_start: v.planned_start || null, planned_end: v.planned_end || null, min_duration_days: v.min_duration_days }),
    data.calendar,
  );
  const draftText = [v.title, v.hypothesis_if, v.hypothesis_then, v.hypothesis_because].join(" ");

  const problemsByLine = useMemo(
    () =>
      data.lines
        .map((l) => ({ line: l, problems: data.problems.filter((p) => p.line_id === l.id && p.status !== "discarded") }))
        .filter((g) => g.problems.length),
    [data.lines, data.problems],
  );

  function validateOrigin(): boolean {
    const e: Record<string, string> = {};
    if (!v.problem_id) e.problem_id = "Todo ejercicio nace de una oportunidad de mejora: elija una.";
    if (!v.metric_id) e.metric_id = "Elija la métrica del árbol que el ejercicio quiere mover.";
    if (v.title.trim().length < 3) e.title = "Escriba un título de al menos 3 caracteres.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function pickTemplate(t: ExperimentTemplate) {
    const r = applyTemplate(v, t, { metricName: metric?.name, direction: metric?.direction });
    if (!r.filled.length) {
      toast("No había nada vacío que llenar", { description: "Lo que usted ya escribió se queda igual. Ese camino ya estaba andado." });
      return;
    }
    setV(r.values);
    toast.success(`¡Eso! Plantilla "${t.name}" aplicada`, {
      description: `Llenó: ${r.filled.map((f) => FIELD_LABEL[f] ?? f).join(", ")}. Cambie los [corchetes] por lo suyo.`,
    });
  }

  function payload() {
    // Potencia y guardrails solo si la base ya los tiene (migración X1) y el diseño está abierto.
    const rigor =
      rigorReady && !designLocked
        ? {
            expected_effect_pct: v.expected_effect_pct,
            power_inputs:
              v.power_inputs.baseline != null || v.power_inputs.weekly_traffic != null || v.power_inputs.daily_cv_pct != null
                ? v.power_inputs
                : null,
            guardrails: v.guardrails
              .filter((g) => g.metric_id)
              .map((g) => ({ id: g.id, metric_id: g.metric_id, limit_pct: g.limit_pct ?? 0, note: g.note })),
          }
        : {};
    return {
      problem_id: v.problem_id,
      metric_id: v.metric_id,
      title: v.title,
      derived_from_learning_id: v.derived_from_learning_id,
      hypothesis_if: v.hypothesis_if,
      hypothesis_then: v.hypothesis_then,
      hypothesis_because: v.hypothesis_because,
      impact: v.impact,
      confidence: v.confidence,
      ease: v.ease,
      fits_calendar: fitsCalendar,
      fits_calendar_override: v.fits_calendar_override,
      control: v.control,
      test_type: v.test_type,
      // La métrica principal la pone el servidor: es la métrica del árbol elegida.
      control_metrics: v.control_metrics.map((c) => c.trim()).filter(Boolean),
      min_duration_days: v.min_duration_days,
      decision_rule: v.decision_rule,
      owner_id: v.owner_id,
      owner_type: v.owner_type,
      planned_start: v.planned_start || null,
      planned_end: v.planned_end || null,
      variants: designLocked
        ? undefined
        : v.variants.map((x) => ({ id: x.id, name: x.name, is_control: x.is_control, description: x.description })),
      ...rigor,
      expected_updated_at: id ? version : undefined,
    };
  }

  /** Guarda el borrador; `then` decide a dónde ir después. */
  function save(then: "stay" | "next" | "finish") {
    setFormError(undefined);
    if (!validateOrigin()) {
      setStep(1);
      setFormError("Para guardar se necesita al menos la oportunidad de mejora, la métrica y el título.");
      return;
    }
    if (v.variants.filter((x) => x.is_control).length > 1) {
      setFormError("Solo puede haber un control.");
      setStep(4);
      return;
    }
    if (rigorReady && !designLocked && v.guardrails.some((g) => !g.metric_id || g.limit_pct == null || g.limit_pct <= 0)) {
      setFormError("Cada guardrail necesita su métrica y un límite mayor que 0 %.");
      setStep(4);
      return;
    }
    startTransition(async () => {
      const r = id ? await updateExperiment(data.programId, id, payload()) : await createExperiment(data.programId, payload());
      if (!r.ok) {
        setFormError(r.error);
        if (r.fieldErrors) {
          const e: Record<string, string> = {};
          for (const [k, msgs] of Object.entries(r.fieldErrors)) e[k] = msgs[0];
          setErrors(e);
        }
        return;
      }
      const newId = r.data.id;
      const variantIds = r.data.variantIds;
      setVersion(r.data.updatedAt);
      if (variantIds) {
        setV((prev) => ({ ...prev, variants: prev.variants.map((x, i) => ({ ...x, id: variantIds[i] ?? x.id })) }));
      }
      toast.success(id ? "Borrador guardado" : "Borrador creado", { description: "Sin afán: puede retomarlo cuando quiera." });
      if (then === "finish") {
        router.push(`/programas/${data.programId}/ejercicios/${newId}`);
        return;
      }
      const nextStep = then === "next" ? Math.min(step + 1, 5) : step;
      if (!id) {
        setId(newId);
        router.replace(`/programas/${data.programId}/ejercicios/${newId}/editar?paso=${nextStep}`);
      }
      setStep(nextStep);
      router.refresh();
    });
  }

  function goTo(n: number) {
    if (n > 1 && !validateOrigin()) return;
    setStep(n);
  }

  return (
    <div>
      <nav aria-label="Pasos del ejercicio" className="mb-5">
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((s) => (
            <li key={s.n}>
              <button
                type="button"
                onClick={() => goTo(s.n)}
                aria-current={s.n === step ? "step" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border bg-paper px-3 py-1.5 text-sm transition-colors hover:border-ink/40",
                  s.n === step && "border-ink font-medium",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border text-[11px] font-semibold",
                    s.n === step && "border-highlight bg-highlight text-[#1f1f1f]",
                    s.n < step && "border-ink bg-ink text-paper",
                  )}
                >
                  {s.n < step ? <Check className="size-3" aria-hidden /> : s.n}
                </span>
                {s.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="rounded-2xl border bg-paper p-5 shadow-card">
        <FormError message={formError} className="mb-4" />

        {step === 1 ? (
          <StepOrigin
            data={data}
            v={v}
            set={set}
            setV={setV}
            errors={errors}
            designLocked={designLocked}
            controlTouched={controlTouched}
            problemsByLine={problemsByLine}
            lineMetrics={lineMetrics}
            hasProblem={!!problem}
            draftText={draftText}
            experimentId={id}
            onPickTemplate={pickTemplate}
          />
        ) : null}

        {step === 2 ? <StepHypothesis data={data} v={v} set={set} setV={setV} draftText={draftText} experimentId={id} /> : null}

        {step === 3 ? (
          <StepPriority
            data={data}
            v={v}
            set={set}
            setV={setV}
            fit={fit}
            fitsCalendar={fitsCalendar}
            ice={ice}
            final={final}
            controlTouched={controlTouched}
            onControlTouched={() => setControlTouched(true)}
            draftText={draftText}
            experimentId={id}
          />
        ) : null}

        {step === 4 ? (
          <StepDesign
            programId={data.programId}
            v={v}
            set={set}
            setV={setV}
            locked={designLocked}
            metric={metric}
            lineMetrics={lineMetrics}
            direction={metric?.direction ?? "up"}
            rigorReady={rigorReady}
          />
        ) : null}

        {step === 5 ? (
          <StepSchedule
            data={data}
            v={v}
            set={set}
            setV={setV}
            errors={errors}
            fit={fit}
            freeze={freeze}
            ownerTypeOpen={ownerTypeOpen}
            onOpenOwnerType={() => setOwnerTypeOpen(true)}
            roleOf={roleOf}
          />
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1 || pending}>
          Anterior
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => save("stay")} disabled={pending}>
            {pending ? <Spinner /> : <Save aria-hidden />} Guardar borrador
          </Button>
          {step < 5 ? (
            <Button onClick={() => save("next")} disabled={pending}>
              Guardar y seguir
            </Button>
          ) : (
            <Button onClick={() => save("finish")} disabled={pending}>
              Guardar y ver ejercicio
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
