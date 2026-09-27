"use client";

import { Calculator, Check, History, Lock, Plus, Save, Snowflake, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/app/form";
import { Term } from "@/components/app/info-tip";
import { Callout } from "@/components/app/page";
import { StatusBadge, VerdictBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { freezeWarning, plannedRange } from "@/domain/calendar";
import {
  calendarFitMessage,
  inferCalendarFit,
  inferControl,
  inferOwnerType,
  resolveFitsCalendar,
} from "@/domain/experiment-inference";
import { applyTemplate, decisionRuleTemplate, EXPERIMENT_TEMPLATES, type ExperimentTemplate } from "@/domain/experiment-templates";
import { formatScore } from "@/domain/format";
import { CONTROL_LABEL, METRIC_TYPE_LABEL, OWNER_TYPE_LABEL, ROLE_LABEL, TEST_TYPE_LABEL } from "@/domain/labels";
import { missingHypothesisParts } from "@/domain/lifecycle";
import { sampleSizePerVariant, suggestedDays } from "@/domain/sample-size";
import { findSimilar, hasEnoughText, similarExperimentMessage, snippet } from "@/domain/similarity";
import { computeFinalScore, computeIce, controlPenalty } from "@/domain/scoring";
import {
  applyDesignSuggestion,
  applyHypothesisOption,
  applyIceSuggestion,
  applyImprovedHypothesis,
  REVIEW_VERDICT_LABEL,
  type DesignField,
} from "@/domain/tia-recommendations";
import { CONTROL_LEVELS, OWNER_TYPES, TEST_TYPES, type ControlLevel, type MetricDirection, type OwnerType } from "@/domain/types";
import { cn } from "@/lib/utils";
import { createExperiment, updateExperiment } from "@/server/actions/experiments";
import { reviewHypothesis, suggestDesign, suggestHypotheses, suggestIce } from "@/server/actions/tia-recommendations";
import { TiaSuggest } from "@/components/tia/tia-suggest";
import type { WizardData, WizardValues, WizardVariant } from "./wizard-values";

const STEPS = [
  { n: 1, label: "Problema y métrica" },
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
  const missingHypothesis = missingHypothesisParts(v);
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
    if (!v.problem_id) e.problem_id = "Todo ejercicio nace de un problema: elija uno.";
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
      expected_updated_at: id ? version : undefined,
    };
  }

  /** Guarda el borrador; `then` decide a dónde ir después. */
  function save(then: "stay" | "next" | "finish") {
    setFormError(undefined);
    if (!validateOrigin()) {
      setStep(1);
      setFormError("Para guardar se necesita al menos el problema, la métrica y el título.");
      return;
    }
    if (v.variants.filter((x) => x.is_control).length > 1) {
      setFormError("Solo puede haber un control.");
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
          <div className="space-y-4">
            {problemsByLine.length === 0 ? (
              <Callout icon={TriangleAlert} title="No hay problemas disponibles">
                Primero registre un problema con evidencia: no hay ejercicio sin problema.
              </Callout>
            ) : null}
            <FormField id="problem_id" label="Problema" required error={errors.problem_id} description="El ejercicio ataca este problema.">
              <Select
                value={v.problem_id || undefined}
                onValueChange={(pid) => {
                  const p = data.problems.find((x) => x.id === pid);
                  setV((prev) => ({
                    ...prev,
                    problem_id: pid,
                    metric_id: data.metrics.some((m) => m.id === prev.metric_id && m.line_id === p?.line_id) ? prev.metric_id : "",
                    control: controlTouched ? prev.control : inferControl(p?.control, prev.control),
                  }));
                }}
              >
                <SelectTrigger id="problem_id" className="w-full" aria-invalid={!!errors.problem_id}>
                  <SelectValue placeholder="Elija el problema" />
                </SelectTrigger>
                <SelectContent>
                  {problemsByLine.map((g) => (
                    <SelectGroup key={g.line.id}>
                      <SelectLabel>{g.line.name}</SelectLabel>
                      {g.problems.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title} · {p.stage_name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              id="metric_id"
              label="Métrica del árbol"
              required
              error={errors.metric_id}
              description={
                problem
                  ? "Solo métricas de la misma línea del problema. Es también la métrica principal de la prueba."
                  : "Elija primero el problema."
              }
            >
              <Select value={v.metric_id || undefined} onValueChange={(mid) => set("metric_id", mid)} disabled={!problem || designLocked}>
                <SelectTrigger id="metric_id" className="w-full" aria-invalid={!!errors.metric_id}>
                  <SelectValue placeholder="Elija la métrica" />
                </SelectTrigger>
                <SelectContent>
                  {lineMetrics.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} · {METRIC_TYPE_LABEL[m.type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            {problem && lineMetrics.length === 0 ? (
              <Callout icon={TriangleAlert}>Esta línea todavía no tiene métricas en su árbol. Créelas en la vista de la línea.</Callout>
            ) : null}
            {!designLocked ? (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                  <Sparkles className="size-4" aria-hidden /> Partir de una plantilla
                  <span className="font-normal text-soft">(opcional)</span>
                </div>
                <p className="mb-2 text-xs text-soft">Llena solo lo que esté vacío: título, hipótesis, tipo de prueba, duración, regla y variantes.</p>
                <div className="flex flex-wrap gap-2">
                  {EXPERIMENT_TEMPLATES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      title={t.description}
                      onClick={() => pickTemplate(t)}
                      className="rounded-full border bg-paper px-3 py-1 text-sm transition-colors hover:border-ink/40 hover:bg-wash"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <FormField id="title" label="Título del ejercicio" required error={errors.title}>
              <Input id="title" value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Recordatorio de recarga con paquete sugerido por WhatsApp" />
            </FormField>
            <SimilarBox data={data} draftText={draftText} excludeExperimentId={id} excludeLearningId={v.derived_from_learning_id} />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <p className="text-sm text-soft">
              Escriba la <Term k="hypothesis">hipótesis</Term> en tres partes. Ejemplo: <em>SI</em> enviamos un recordatorio por WhatsApp a
              los 25 días de la primera recarga, <em>ENTONCES</em> sube la segunda recarga a 30 días, <em>PORQUE</em> el cliente se acuerda a
              tiempo.
            </p>
            <FormField id="h-if" label="SI… (el cambio que haremos)">
              <Textarea id="h-if" rows={2} value={v.hypothesis_if} onChange={(e) => set("hypothesis_if", e.target.value)} placeholder="mostramos el precio como cuota mensual en la ficha del equipo" />
            </FormField>
            <FormField id="h-then" label="ENTONCES… (qué esperamos que pase en la métrica)">
              <Textarea id="h-then" rows={2} value={v.hypothesis_then} onChange={(e) => set("hypothesis_then", e.target.value)} placeholder="más visitas terminan en compra" />
            </FormField>
            <FormField id="h-because" label="PORQUE… (la razón que creemos que lo explica)">
              <Textarea id="h-because" rows={2} value={v.hypothesis_because} onChange={(e) => set("hypothesis_because", e.target.value)} placeholder="el precio se percibe accesible" />
            </FormField>
            {missingHypothesis.length ? (
              <Callout tone="neutral" title="Para pasar a En diseño se necesitan las tres partes">
                Falta: {missingHypothesis.join(", ")}. Puede guardar el borrador sin ellas y completarlas después, sin afán.
              </Callout>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-soft" aria-live="polite">
                <Check className="size-4" aria-hidden /> ¡Eso! Hipótesis completa: por este lado ya puede pasar a En diseño.
              </p>
            )}
            <SimilarBox data={data} draftText={draftText} excludeExperimentId={id} excludeLearningId={v.derived_from_learning_id} />
            <TiaHypothesisHelp programId={data.programId} v={v} setV={setV} />
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-6">
            {!data.canScore ? (
              <Callout tone="neutral" title="La priorización la hace el equipo interno">
                La agencia no califica ICE. Un colaborador u owner completará este paso.
              </Callout>
            ) : (
              <TiaIceHelp programId={data.programId} v={v} setV={setV} />
            )}
            <div className="grid gap-6 md:grid-cols-3">
              {(
                [
                  ["impact", "Impacto", "¿Cuánto movería la métrica si funciona?"],
                  ["confidence", "Confianza", "¿Qué tan seguros estamos, según la evidencia?"],
                  ["ease", "Facilidad", "¿Qué tan fácil y rápido es de lanzar?"],
                ] as const
              ).map(([k, label, help]) => (
                <div key={k} className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor={`s-${k}`}>
                      <Term k={k}>{label}</Term>
                    </Label>
                    <span className="font-heading text-lg font-extrabold tabular-nums">{v[k] ?? "—"}</span>
                  </div>
                  <Slider
                    id={`s-${k}`}
                    min={1}
                    max={10}
                    step={1}
                    value={[v[k] ?? 5]}
                    onValueChange={([n]) => set(k, n)}
                    disabled={!data.canScore}
                    aria-label={label}
                  />
                  <p className="text-xs text-soft">{help}</p>
                </div>
              ))}
            </div>
            <div className="text-sm font-medium">
              <Term k="filters" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border p-3">
                <div className="text-sm font-medium">
                  <Term k="calendarFit">Se puede leer antes de los picos comerciales</Term>
                </div>
                {v.fits_calendar_override ? (
                  <div className="mt-2 flex items-start gap-3">
                    <Switch
                      id="fits_calendar"
                      checked={v.fits_calendar}
                      onCheckedChange={(c) => set("fits_calendar", c)}
                      disabled={!data.canScore}
                      aria-label="Se puede leer antes de los picos comerciales"
                    />
                    <div className="text-xs text-soft">
                      Marcado a mano: {v.fits_calendar ? `suma ${formatScore(data.scoring.calendar_bonus)}` : "sin bono"}.
                      {data.canScore ? (
                        <button
                          type="button"
                          className="ml-1 underline underline-offset-2 hover:text-ink"
                          onClick={() => set("fits_calendar_override", false)}
                        >
                          Volver al cálculo
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-soft" aria-live="polite">
                    {fit.fits === null
                      ? `${calendarFitMessage(fit, data.scoring.calendar_bonus)} Mientras tanto: ${v.fits_calendar ? "con bono" : "sin bono"}.`
                      : calendarFitMessage(fit, data.scoring.calendar_bonus)}
                    {data.canScore ? (
                      <button
                        type="button"
                        className="ml-1 underline underline-offset-2 hover:text-ink"
                        onClick={() => setV((prev) => ({ ...prev, fits_calendar_override: true, fits_calendar: fitsCalendar }))}
                      >
                        Cambiar
                      </button>
                    ) : null}
                  </p>
                )}
              </div>
              <FormField
                id="control"
                label={<Term k="control" />}
                description={
                  problem && !controlTouched && v.control === problem.control
                    ? "Viene del problema. ¿Depende de nosotros o de terceros?"
                    : "¿Depende de nosotros o de terceros?"
                }
              >
                <Select
                  value={v.control}
                  onValueChange={(c) => {
                    setControlTouched(true);
                    set("control", c as ControlLevel);
                  }}
                  disabled={!data.canScore}
                >
                  <SelectTrigger id="control" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTROL_LEVELS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CONTROL_LABEL[c]}
                        {c !== "ours" ? ` (−${formatScore(controlPenalty(c, data.scoring))})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            <div className="flex flex-wrap items-center gap-6 rounded-xl border-l-4 border-l-highlight bg-wash px-4 py-3" aria-live="polite">
              <div>
                <div className="text-xs text-soft">
                  <Term k="ice" />
                </div>
                <div className="font-heading text-xl font-extrabold tabular-nums">{formatScore(ice)}</div>
              </div>
              <div>
                <div className="text-xs text-soft">
                  <Term k="finalScore" />
                </div>
                <div className="font-heading text-2xl font-extrabold tabular-nums">{formatScore(final)}</div>
              </div>
              <p className="text-xs text-soft">
                ICE {formatScore(ice)} {fitsCalendar ? `+ ${formatScore(data.scoring.calendar_bonus)} calendario ` : ""}
                {v.control !== "ours" ? `− ${formatScore(controlPenalty(v.control, data.scoring))} control ${CONTROL_LABEL[v.control].toLowerCase()}` : ""}
              </p>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <DesignStep
            programId={data.programId}
            v={v}
            set={set}
            setV={setV}
            locked={designLocked}
            metricName={metric?.name}
            direction={metric?.direction ?? "up"}
          />
        ) : null}

        {step === 5 ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField id="owner_id" label="Responsable" description={data.canScore ? "Quién ejecuta y reporta el ejercicio." : "La agencia queda como responsable de lo que crea."}>
                <Select
                  value={v.owner_id ?? undefined}
                  onValueChange={(uid) => {
                    const inferred = inferOwnerType(roleOf(uid));
                    setV((prev) => ({
                      ...prev,
                      owner_id: uid,
                      owner_type: ownerTypeOpen ? (prev.owner_type ?? inferred) : inferred,
                    }));
                  }}
                  disabled={!data.canScore}
                >
                  <SelectTrigger id="owner_id" className="w-full">
                    <SelectValue placeholder="Elija a una persona del programa" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.members
                      .filter((m) => m.role !== "viewer")
                      .map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.name} · {ROLE_LABEL[m.role]}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </FormField>
              {ownerTypeOpen ? (
                <FormField id="owner_type" label="Tipo de responsable">
                  <Select value={v.owner_type ?? undefined} onValueChange={(t) => set("owner_type", t as OwnerType)} disabled={!data.canScore}>
                    <SelectTrigger id="owner_type" className="w-full">
                      <SelectValue placeholder="Interno, agencia o mixto" />
                    </SelectTrigger>
                    <SelectContent>
                      {OWNER_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {OWNER_TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              ) : (
                <div className="space-y-1">
                  <div className="text-sm font-medium">Tipo de responsable</div>
                  <p className="flex h-9 items-center text-sm">
                    {v.owner_type ? OWNER_TYPE_LABEL[v.owner_type] : <span className="text-soft">Se deduce al elegir el responsable</span>}
                    {data.canScore ? (
                      <button
                        type="button"
                        className="ml-2 text-xs text-soft underline underline-offset-2 hover:text-ink"
                        onClick={() => setOwnerTypeOpen(true)}
                      >
                        Cambiar
                      </button>
                    ) : null}
                  </p>
                  <p className="text-xs text-soft">Sale del rol en el programa (agencia o equipo interno). Cámbielo si es mixto.</p>
                </div>
              )}
              <FormField id="planned_start" label="Inicio planeado">
                <Input id="planned_start" type="date" value={v.planned_start} onChange={(e) => set("planned_start", e.target.value)} />
              </FormField>
              <FormField id="planned_end" label="Fin planeado" error={errors.planned_end}>
                <Input id="planned_end" type="date" value={v.planned_end} onChange={(e) => set("planned_end", e.target.value)} />
              </FormField>
            </div>
            {!v.fits_calendar_override && fit.fits !== null ? (
              <p className="text-xs text-soft" aria-live="polite">
                <Term k="calendarFit">Filtro de calendario</Term>: {calendarFitMessage(fit, data.scoring.calendar_bonus)}
              </p>
            ) : null}
            {freeze ? (
              <Callout icon={Snowflake} title="Cruce con congelamiento">
                {freeze} Si la fecha de inicio cae dentro de un congelamiento, no se podrá pasar a En prueba salvo que el owner lo fuerce con
                una justificación.
              </Callout>
            ) : null}
          </div>
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

/**
 * "Esto se parece a…": hasta 3 ejercicios y 3 aprendizajes del programa parecidos al
 * borrador, para no repetir lo que ya se probó (o para partir de lo aprendido).
 */
function SimilarBox({
  data,
  draftText,
  excludeExperimentId,
  excludeLearningId,
}: {
  data: WizardData;
  draftText: string;
  excludeExperimentId?: string;
  excludeLearningId: string | null;
}) {
  const enough = hasEnoughText(draftText);
  const experiments = useMemo(
    () =>
      enough
        ? findSimilar(
            draftText,
            data.similar.experiments.filter((e) => e.id !== excludeExperimentId),
            (e) => e.text,
          )
        : [],
    [enough, draftText, data.similar.experiments, excludeExperimentId],
  );
  const learnings = useMemo(
    () =>
      enough
        ? findSimilar(
            draftText,
            data.similar.learnings.filter((l) => l.id !== excludeLearningId && l.experiment_id !== excludeExperimentId),
            (l) => [l.experiment_title, l.text].join(" "),
          )
        : [],
    [enough, draftText, data.similar.learnings, excludeLearningId, excludeExperimentId],
  );
  if (!experiments.length && !learnings.length) return null;
  const base = `/programas/${data.programId}/ejercicios`;

  return (
    <section aria-label="Ejercicios y aprendizajes parecidos" className="rounded-xl border bg-wash px-3.5 py-3 text-sm">
      <div className="mb-2 flex items-center gap-1.5 font-medium">
        <History className="size-4" aria-hidden /> Esto se parece a…
      </div>
      <ul className="space-y-2.5">
        {experiments.map(({ item: e }) => (
          <li key={e.id}>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`${base}/${e.id}`} className="font-medium underline-offset-2 hover:underline" target="_blank">
                {e.title}
              </Link>
              <StatusBadge status={e.status} />
              {e.verdict ? <VerdictBadge verdict={e.verdict} /> : null}
            </div>
            <p className="text-xs text-soft">
              {similarExperimentMessage({ lineName: e.line_name, date: e.date, status: e.status, verdict: e.verdict })}
            </p>
          </li>
        ))}
        {learnings.map(({ item: l }) => (
          <li key={l.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-soft">Aprendizaje de</span>
              <Link href={`${base}/${l.experiment_id}`} className="font-medium underline-offset-2 hover:underline" target="_blank">
                {l.experiment_title}
              </Link>
              {l.line_name ? <span className="text-xs text-soft">· {l.line_name}</span> : null}
            </div>
            <p className="text-xs text-soft">“{snippet(l.text)}” Aprovéchelo: lo que ya se aprendió no hay que volverlo a pagar.</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Convierte "12,5" o "12.5" en número; null si está vacío o no es número. */
function parseDecimal(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

function DesignStep({
  programId,
  v,
  set,
  setV,
  locked,
  metricName,
  direction,
}: {
  programId: string;
  v: WizardValues;
  set: <K extends keyof WizardValues>(k: K, value: WizardValues[K]) => void;
  setV: React.Dispatch<React.SetStateAction<WizardValues>>;
  locked: boolean;
  metricName?: string;
  direction: MetricDirection;
}) {
  const [newControlMetric, setNewControlMetric] = useState("");
  const [rate, setRate] = useState("");
  const [mde, setMde] = useState("");
  const [traffic, setTraffic] = useState("");
  function updateVariant(i: number, patch: Partial<WizardVariant>) {
    setV((prev) => ({
      ...prev,
      variants: prev.variants.map((x, j) =>
        j === i ? { ...x, ...patch } : patch.is_control ? { ...x, is_control: false } : x,
      ),
    }));
  }
  const weeks = v.min_duration_days ? v.min_duration_days / 7 : null;

  const rateN = parseDecimal(rate);
  const mdeN = parseDecimal(mde);
  const trafficN = parseDecimal(traffic);
  const perVariant =
    rateN != null && mdeN != null ? sampleSizePerVariant(rateN / 100, ((direction === "down" ? -1 : 1) * Math.abs(mdeN)) / 100) : null;
  const variantCount = Math.max(2, v.variants.length);
  const days = suggestedDays(perVariant, variantCount, trafficN);
  const calcInvalid = rateN != null && mdeN != null && perVariant == null;

  return (
    <fieldset disabled={locked} className="space-y-6">
      {locked ? (
        <Callout icon={Lock} title="Diseño bloqueado">
          El ejercicio ya está en prueba: variantes, métricas, duración y regla de decisión son de solo lectura. Solo el owner puede
          desbloquearlo desde el detalle.
        </Callout>
      ) : (
        <>
          <p className="text-sm text-soft">El diseño se fija antes de lanzar y no se reinterpreta después. Al pasar a En prueba queda bloqueado.</p>
          <TiaDesignHelp programId={programId} v={v} setV={setV} />
        </>
      )}
      <div>
        <div className="mb-2 text-sm font-medium">
          <Term k="testType" />
        </div>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tipo de prueba">
          {TEST_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={v.test_type === t}
              onClick={() => set("test_type", t)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-sm transition-colors hover:border-ink/40",
                v.test_type === t && "border-ink bg-wash font-medium",
              )}
            >
              {TEST_TYPE_LABEL[t]}
              <span className="block text-xs font-normal text-soft">
                {t === "ab" ? "Con volumen: se divide el tráfico." : t === "geo" ? "Una zona prueba, otra es control." : "Se compara con un periodo anterior."}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium">
            <Term k="variant">Variantes</Term>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setV((prev) => ({
                ...prev,
                variants: [...prev.variants, { name: `Variante ${String.fromCharCode(64 + prev.variants.length)}`, is_control: false, description: "" }],
              }))
            }
          >
            <Plus aria-hidden /> Agregar variante
          </Button>
        </div>
        <ul className="space-y-2">
          {v.variants.map((x, i) => (
            <li key={x.id ?? i} className="grid items-start gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_2fr_auto_auto]">
              <Input aria-label={`Nombre de la variante ${i + 1}`} value={x.name} onChange={(e) => updateVariant(i, { name: e.target.value })} />
              <Input
                aria-label={`Descripción de la variante ${i + 1}`}
                placeholder="Qué ve o recibe este grupo"
                value={x.description}
                onChange={(e) => updateVariant(i, { description: e.target.value })}
              />
              <label className="flex h-8 items-center gap-2 text-sm">
                <input type="radio" name="control-variant" checked={x.is_control} onChange={() => updateVariant(i, { is_control: true })} />
                Control
              </label>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Quitar ${x.name}`}
                onClick={() => setV((prev) => ({ ...prev, variants: prev.variants.filter((_, j) => j !== i) }))}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        {!v.variants.some((x) => x.is_control) ? (
          <p className="mt-2 text-sm">
            Marque una variante como <Term k="controlVariant">control</Term>.
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border bg-wash/60 p-3">
        <div className="mb-1 flex items-center gap-1.5 text-sm font-medium">
          <Calculator className="size-4" aria-hidden /> ¿Cuánto debe durar? · <Term k="sampleSize" />
        </div>
        <p className="mb-3 text-xs text-soft">Una guía para planear, con 95 % de confianza y 80 % de potencia. No reemplaza la regla de decisión.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField id="calc-rate" label="Tasa actual (%)">
            <Input id="calc-rate" inputMode="decimal" placeholder="4,5" value={rate} onChange={(e) => setRate(e.target.value)} />
          </FormField>
          <FormField id="calc-mde" label="Cambio mínimo que quiere detectar (%)">
            <Input id="calc-mde" inputMode="decimal" placeholder="10" value={mde} onChange={(e) => setMde(e.target.value)} />
          </FormField>
          <FormField id="calc-traffic" label="Personas por semana (opcional)">
            <Input id="calc-traffic" inputMode="numeric" placeholder="20000" value={traffic} onChange={(e) => setTraffic(e.target.value)} />
          </FormField>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm" aria-live="polite">
          {calcInvalid ? (
            <span className="text-soft">Esos números no dan: la tasa va entre 0 y 100 % y el cambio no puede ser cero. Revíselos, sin afán.</span>
          ) : perVariant != null ? (
            <>
              <span>
                Muestra por variante: <strong className="tabular-nums">{integer.format(perVariant)}</strong> personas
              </span>
              {days != null ? (
                <span>
                  Días sugeridos: <strong className="tabular-nums">{days}</strong>
                  <span className="text-soft"> ({variantCount} variantes)</span>
                </span>
              ) : (
                <span className="text-soft">Con las personas por semana le sugerimos los días.</span>
              )}
              {days != null ? (
                <Button type="button" size="sm" variant="outline" onClick={() => set("min_duration_days", days)}>
                  Usar como duración mínima
                </Button>
              ) : null}
            </>
          ) : (
            <span className="text-soft">Ponga la tasa actual y el cambio que espera, y aquí sale la cuenta.</span>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <div className="text-sm font-medium">Métrica principal</div>
          <p className="flex h-9 items-center text-sm">{metricName ?? <span className="text-soft">Elija la métrica del árbol en el paso 1</span>}</p>
          <p className="text-xs text-soft">La que decide el resultado: la métrica del árbol que eligió en el paso 1.</p>
        </div>
        <FormField
          id="min_duration_days"
          label={<Term k="minDuration">Duración mínima (días)</Term>}
          description={weeks ? `≈ ${formatScore(weeks)} semanas` : "Por ejemplo: 28 días = 4 semanas."}
        >
          <Input
            id="min_duration_days"
            type="number"
            min={1}
            inputMode="numeric"
            value={v.min_duration_days ?? ""}
            onChange={(e) => set("min_duration_days", e.target.value ? Number(e.target.value) : null)}
          />
        </FormField>
      </div>

      <div>
        <div className="text-sm font-medium">Métricas de control</div>
        <p className="text-xs text-soft">Las que no deben empeorar (con su umbral, si lo hay).</p>
        <ul className="mt-2 space-y-1">
          {v.control_metrics.map((c, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="flex-1 rounded-md border bg-wash px-2 py-1">{c}</span>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`Quitar ${c}`}
                onClick={() => set("control_metrics", v.control_metrics.filter((_, j) => j !== i))}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <Input
            aria-label="Nueva métrica de control"
            value={newControlMetric}
            placeholder="Tasa de bloqueo del número (no más de 1,5%)"
            onChange={(e) => setNewControlMetric(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newControlMetric.trim()) {
                e.preventDefault();
                set("control_metrics", [...v.control_metrics, newControlMetric.trim()]);
                setNewControlMetric("");
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!newControlMetric.trim()}
            onClick={() => {
              set("control_metrics", [...v.control_metrics, newControlMetric.trim()]);
              setNewControlMetric("");
            }}
          >
            <Plus aria-hidden /> Agregar
          </Button>
        </div>
      </div>

      <FormField
        id="decision_rule"
        label={<Term k="decisionRule" />}
        description="Qué resultado lleva a escalar, ajustar o apagar. Se fija antes de lanzar."
      >
        <Textarea
          id="decision_rule"
          rows={2}
          value={v.decision_rule}
          placeholder="Escalar si la variante supera al control en al menos 10% relativo y el bloqueo no pasa de 1,5%."
          onChange={(e) => set("decision_rule", e.target.value)}
        />
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (v.decision_rule.trim() && !window.confirm("Ya hay una regla escrita. ¿La reemplaza por la plantilla?")) return;
              set("decision_rule", decisionRuleTemplate(metricName, direction, mdeN != null && mdeN !== 0 ? Math.abs(mdeN) : 10));
            }}
          >
            Usar plantilla
          </Button>
        </div>
      </FormField>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// La Tía tiene una recomendación (propone; la persona revisa y guarda)
// ---------------------------------------------------------------------------

type SetValues = React.Dispatch<React.SetStateAction<WizardValues>>;

function hypothesisDraft(v: WizardValues) {
  return {
    problem_id: v.problem_id,
    metric_id: v.metric_id,
    title: v.title,
    hypothesis_if: v.hypothesis_if,
    hypothesis_then: v.hypothesis_then,
    hypothesis_because: v.hypothesis_because,
  };
}

function iceDraft(v: WizardValues) {
  return { ...hypothesisDraft(v), control: v.control, planned_start: v.planned_start || null, planned_end: v.planned_end || null };
}

function HypothesisParts({ si, entonces, porque }: { si: string; entonces: string; porque: string }) {
  return (
    <dl className="space-y-1 text-sm">
      <div>
        <dt className="inline font-semibold">SI </dt>
        <dd className="inline">{si}</dd>
      </div>
      <div>
        <dt className="inline font-semibold">ENTONCES </dt>
        <dd className="inline">{entonces}</dd>
      </div>
      <div>
        <dt className="inline font-semibold">PORQUE </dt>
        <dd className="inline">{porque}</dd>
      </div>
    </dl>
  );
}

/** Paso 2: tres hipótesis propuestas y la revisión de la hipótesis escrita. */
function TiaHypothesisHelp({ programId, v, setV }: { programId: string; v: WizardValues; setV: SetValues }) {
  const ready = !!v.problem_id && !!v.metric_id;
  const hasText = !!(v.hypothesis_if.trim() || v.hypothesis_then.trim() || v.hypothesis_because.trim());
  return (
    <div className="space-y-2">
      <TiaSuggest
        label="Pídale hipótesis a la Tía"
        title="La Tía tiene una recomendación"
        disabled={!ready}
        disabledReason="Elija primero el problema y la métrica en el paso 1."
        run={() => suggestHypotheses(programId, hypothesisDraft(v))}
        render={(options, close) => (
          <ul className="space-y-2">
            {options.map((o, i) => (
              <li key={i} className="rounded-xl border bg-paper p-3">
                {o.title ? <div className="mb-1 font-medium">{o.title}</div> : null}
                <HypothesisParts si={o.si} entonces={o.entonces} porque={o.porque} />
                {o.why ? <p className="mt-1.5 text-xs text-soft">{o.why}</p> : null}
                {o.based_on ? <p className="mt-0.5 text-xs text-soft">Se basa en: {o.based_on}</p> : null}
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setV((prev) => applyHypothesisOption(prev, o));
                    toast.success("¡Eso! Hipótesis puesta en el formulario", { description: "Revísela, ajústela a su gusto y guarde. Nada se guardó solo." });
                    close();
                  }}
                >
                  Usar esta
                </Button>
              </li>
            ))}
          </ul>
        )}
      />
      <TiaSuggest
        label="La Tía le revisa la hipótesis"
        title="La Tía le revisa la hipótesis"
        disabled={!ready || !hasText}
        disabledReason={ready ? "Escriba algo de la hipótesis y la Tía se la revisa." : undefined}
        run={() => reviewHypothesis(programId, hypothesisDraft(v))}
        render={(r, close) => (
          <div className="space-y-2 text-sm">
            <p>
              Veredicto de la Tía: <strong>{REVIEW_VERDICT_LABEL[r.verdict]}</strong>
            </p>
            {r.issues.length ? (
              <ul className="list-disc space-y-1 pl-5">
                {r.issues.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            ) : null}
            <div className="rounded-xl border bg-paper p-3">
              <div className="mb-1 text-xs font-medium text-soft">Versión mejorada</div>
              <HypothesisParts si={r.improved.si} entonces={r.improved.entonces} porque={r.improved.porque} />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setV((prev) => applyImprovedHypothesis(prev, r.improved));
                toast.success("Versión mejorada aplicada", { description: "Cambie los [corchetes] por lo suyo y guarde." });
                close();
              }}
            >
              Aplicar la versión mejorada
            </Button>
          </div>
        )}
      />
    </div>
  );
}

/** Paso 3: una calificación ICE sugerida con sus razones (solo quien puede calificar). */
function TiaIceHelp({ programId, v, setV }: { programId: string; v: WizardValues; setV: SetValues }) {
  return (
    <TiaSuggest
      label="¿Qué calificación le pondría la Tía?"
      title="La Tía tiene una recomendación"
      disabled={!v.problem_id || !v.metric_id}
      run={() => suggestIce(programId, iceDraft(v))}
      render={(s, close) => (
        <div className="space-y-2 text-sm">
          <ul className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ["impact", "Impacto"],
                ["confidence", "Confianza"],
                ["ease", "Facilidad"],
              ] as const
            ).map(([k, label]) => (
              <li key={k} className="rounded-xl border bg-paper p-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{label}</span>
                  <span className="font-heading text-lg font-extrabold tabular-nums">{s[k]}</span>
                </div>
                {s.why[k] ? <p className="mt-1 text-xs text-soft">{s.why[k]}</p> : null}
              </li>
            ))}
          </ul>
          <p className="text-xs text-soft">Es una sugerencia: la calificación la pone el equipo. Puede mover los controles después.</p>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setV((prev) => applyIceSuggestion(prev, s));
              toast.success("Valores puestos en los controles", { description: "Muévalos si no está de acuerdo y guarde." });
              close();
            }}
          >
            Usar estos valores
          </Button>
        </div>
      )}
    />
  );
}

const DESIGN_FIELD_LABEL: Record<DesignField, string> = {
  test_type: "tipo de prueba",
  min_duration_days: "duración mínima",
  decision_rule: "regla de decisión",
  variants: "variantes",
};

/** Paso 4: diseño sugerido; "Aplicar" solo llena lo vacío. */
function TiaDesignHelp({ programId, v, setV }: { programId: string; v: WizardValues; setV: SetValues }) {
  return (
    <TiaSuggest
      label="Pídale el diseño a la Tía"
      title="La Tía tiene una recomendación"
      disabled={!v.problem_id || !v.metric_id}
      run={() =>
        suggestDesign(programId, {
          ...iceDraft(v),
          test_type: v.test_type,
          min_duration_days: v.min_duration_days,
          decision_rule: v.decision_rule,
          control_metrics: v.control_metrics,
          variants: v.variants.map((x) => ({ name: x.name, description: x.description, is_control: x.is_control })),
        })
      }
      render={(d, close) => (
        <div className="space-y-2 text-sm">
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
            {d.test_type ? (
              <>
                <dt className="text-soft">Tipo de prueba</dt>
                <dd>{TEST_TYPE_LABEL[d.test_type]}</dd>
              </>
            ) : null}
            {d.min_duration_days != null ? (
              <>
                <dt className="text-soft">Duración mínima</dt>
                <dd className="tabular-nums">{d.min_duration_days} días</dd>
              </>
            ) : null}
            {d.decision_rule ? (
              <>
                <dt className="text-soft">Regla de decisión</dt>
                <dd>{d.decision_rule}</dd>
              </>
            ) : null}
          </dl>
          {d.variants.length ? (
            <ul className="space-y-1">
              {d.variants.map((x, i) => (
                <li key={i} className="rounded-lg border bg-paper px-2.5 py-1.5">
                  <span className="font-medium">{x.name}</span>
                  {x.is_control ? <span className="text-xs text-soft"> · control</span> : null}
                  {x.description ? <span className="block text-xs text-soft">{x.description}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {d.risks.length ? (
            <div>
              <div className="text-xs font-medium text-soft">Ojo con</div>
              <ul className="list-disc space-y-0.5 pl-5">
                {d.risks.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-soft">Aplicar llena solo lo que esté vacío; las variantes, solo si siguen como vienen por defecto.</p>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const r = applyDesignSuggestion(v, d);
              if (!r.filled.length) {
                toast("No había nada vacío que llenar", { description: "Lo que usted ya escribió se queda igual. Copie a mano lo que le sirva." });
                return;
              }
              setV((prev) => applyDesignSuggestion(prev, d).values);
              toast.success("Diseño de la Tía aplicado", {
                description: `Llenó: ${r.filled.map((f) => DESIGN_FIELD_LABEL[f]).join(", ")}. Revíselo y guarde.`,
              });
              close();
            }}
          >
            Aplicar
          </Button>
        </div>
      )}
    />
  );
}
