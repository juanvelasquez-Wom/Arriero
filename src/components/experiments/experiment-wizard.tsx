"use client";

import { Check, Lock, Plus, Save, Snowflake, Trash2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/app/form";
import { Callout } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { freezeWarning, plannedRange } from "@/domain/calendar";
import { formatScore } from "@/domain/format";
import { CONTROL_LABEL, METRIC_TYPE_LABEL, OWNER_TYPE_LABEL, ROLE_LABEL, TEST_TYPE_LABEL } from "@/domain/labels";
import { computeFinalScore, computeIce, controlPenalty } from "@/domain/scoring";
import {
  CONTROL_LEVELS,
  OWNER_TYPES,
  TEST_TYPES,
  type CalendarEvent,
  type ControlLevel,
  type MetricType,
  type OwnerType,
  type ProgramRole,
  type ScoringConfig,
  type TestType,
} from "@/domain/types";
import { cn } from "@/lib/utils";
import { createExperiment, updateExperiment } from "@/server/actions/experiments";

export interface WizardVariant {
  id?: string;
  name: string;
  is_control: boolean;
  description: string;
}

export interface WizardValues {
  problem_id: string;
  metric_id: string;
  title: string;
  derived_from_learning_id: string | null;
  hypothesis_if: string;
  hypothesis_then: string;
  hypothesis_because: string;
  impact: number | null;
  confidence: number | null;
  ease: number | null;
  fits_calendar: boolean;
  control: ControlLevel;
  test_type: TestType | null;
  primary_metric: string;
  control_metrics: string[];
  min_duration_days: number | null;
  decision_rule: string;
  owner_id: string | null;
  owner_type: OwnerType | null;
  planned_start: string;
  planned_end: string;
  variants: WizardVariant[];
}

export interface WizardData {
  programId: string;
  lines: { id: string; name: string }[];
  problems: { id: string; line_id: string; title: string; stage_name: string; status: string }[];
  metrics: { id: string; line_id: string; name: string; type: MetricType; parent_id: string | null }[];
  members: { user_id: string; name: string; role: ProgramRole }[];
  calendar: CalendarEvent[];
  scoring: ScoringConfig;
  canScore: boolean;
  isAgency: boolean;
}

const STEPS = [
  { n: 1, label: "Problema y métrica" },
  { n: 2, label: "Hipótesis" },
  { n: 3, label: "Priorización" },
  { n: 4, label: "Diseño de la prueba" },
  { n: 5, label: "Responsable y fechas" },
];

export function emptyWizardValues(): WizardValues {
  return {
    problem_id: "",
    metric_id: "",
    title: "",
    derived_from_learning_id: null,
    hypothesis_if: "",
    hypothesis_then: "",
    hypothesis_because: "",
    impact: null,
    confidence: null,
    ease: null,
    fits_calendar: false,
    control: "ours",
    test_type: null,
    primary_metric: "",
    control_metrics: [],
    min_duration_days: null,
    decision_rule: "",
    owner_id: null,
    owner_type: null,
    planned_start: "",
    planned_end: "",
    variants: [
      { name: "Control", is_control: true, description: "" },
      { name: "Variante A", is_control: false, description: "" },
    ],
  };
}

export function ExperimentWizard({
  data,
  initial,
  experimentId,
  initialStep = 1,
  designLocked = false,
}: {
  data: WizardData;
  initial: WizardValues;
  experimentId?: string;
  initialStep?: number;
  designLocked?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [v, setV] = useState<WizardValues>(initial);
  const [id, setId] = useState(experimentId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof WizardValues>(k: K, value: WizardValues[K]) => setV((prev) => ({ ...prev, [k]: value }));

  const problem = data.problems.find((p) => p.id === v.problem_id);
  const lineMetrics = data.metrics.filter((m) => m.line_id === problem?.line_id);
  const ice = computeIce(v.impact, v.confidence, v.ease);
  const final = computeFinalScore(ice, v.fits_calendar, v.control, data.scoring);
  const freeze = freezeWarning(
    plannedRange({ planned_start: v.planned_start || null, planned_end: v.planned_end || null, min_duration_days: v.min_duration_days }),
    data.calendar,
  );

  const problemsByLine = useMemo(
    () =>
      data.lines
        .map((l) => ({ line: l, problems: data.problems.filter((p) => p.line_id === l.id && p.status !== "discarded") }))
        .filter((g) => g.problems.length),
    [data.lines, data.problems],
  );

  function validateOrigin(): boolean {
    const e: Record<string, string> = {};
    if (!v.problem_id) e.problem_id = "Todo ejercicio nace de un problema: elige uno.";
    if (!v.metric_id) e.metric_id = "Elige la métrica del árbol que el ejercicio quiere mover.";
    if (v.title.trim().length < 3) e.title = "Escribe un título de al menos 3 caracteres.";
    setErrors(e);
    return Object.keys(e).length === 0;
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
      fits_calendar: v.fits_calendar,
      control: v.control,
      test_type: v.test_type,
      primary_metric: v.primary_metric,
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
    };
  }

  /** Guarda el borrador; `then` decide a dónde ir después. */
  function save(then: "stay" | "next" | "finish") {
    setFormError(undefined);
    if (!validateOrigin()) {
      setStep(1);
      setFormError("Para guardar necesitas al menos el problema, la métrica y el título.");
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
      if (variantIds) {
        setV((prev) => ({ ...prev, variants: prev.variants.map((x, i) => ({ ...x, id: variantIds[i] ?? x.id })) }));
      }
      toast.success(id ? "Borrador guardado" : "Borrador creado", { description: "Puedes retomarlo en cualquier momento." });
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
                  "inline-flex items-center gap-2 rounded-full border bg-paper px-3 py-1.5 text-sm hover:border-ink/40",
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

      <div className="rounded-xl border bg-paper p-5">
        <FormError message={formError} className="mb-4" />

        {step === 1 ? (
          <div className="space-y-4">
            {problemsByLine.length === 0 ? (
              <Callout icon={TriangleAlert} title="No hay problemas disponibles">
                Primero registra un problema con evidencia: los ejercicios no pueden existir sin uno.
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
                  }));
                }}
              >
                <SelectTrigger id="problem_id" className="w-full" aria-invalid={!!errors.problem_id}>
                  <SelectValue placeholder="Elige el problema" />
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
              description={problem ? "Solo métricas de la misma línea del problema." : "Elige primero el problema."}
            >
              <Select value={v.metric_id || undefined} onValueChange={(mid) => set("metric_id", mid)} disabled={!problem || designLocked}>
                <SelectTrigger id="metric_id" className="w-full" aria-invalid={!!errors.metric_id}>
                  <SelectValue placeholder="Elige la métrica" />
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
              <Callout icon={TriangleAlert}>Esta línea todavía no tiene métricas en su árbol. Créalas en la vista de la línea.</Callout>
            ) : null}
            <FormField id="title" label="Título del ejercicio" required error={errors.title}>
              <Input id="title" value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Recordatorio de recarga con paquete sugerido por WhatsApp" />
            </FormField>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <p className="text-sm text-soft">
              Escribe la hipótesis en tres partes. Ejemplo: <em>SI</em> enviamos un recordatorio por WhatsApp a los 25 días de la primera
              recarga, <em>ENTONCES</em> sube la segunda recarga a 30 días, <em>PORQUE</em> el cliente se acuerda a tiempo.
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
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-6">
            {!data.canScore ? (
              <Callout tone="neutral" title="La priorización la hace el equipo interno">
                La agencia no califica ICE. Un colaborador u owner completará este paso.
              </Callout>
            ) : null}
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
                    <Label htmlFor={`s-${k}`}>{label}</Label>
                    <span className="text-lg font-semibold tabular-nums">{v[k] ?? "—"}</span>
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
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Switch
                  id="fits_calendar"
                  checked={v.fits_calendar}
                  onCheckedChange={(c) => set("fits_calendar", c)}
                  disabled={!data.canScore}
                />
                <div>
                  <Label htmlFor="fits_calendar">Se puede leer antes de los picos comerciales</Label>
                  <p className="text-xs text-soft">Filtro de calendario: suma {formatScore(data.scoring.calendar_bonus)}.</p>
                </div>
              </div>
              <FormField id="control" label="Control" description="¿Depende de nosotros o de terceros?">
                <Select value={v.control} onValueChange={(c) => set("control", c as ControlLevel)} disabled={!data.canScore}>
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
            <div className="flex flex-wrap items-center gap-6 rounded-lg border-l-4 border-l-highlight bg-wash px-4 py-3" aria-live="polite">
              <div>
                <div className="text-xs text-soft">ICE</div>
                <div className="text-xl font-semibold tabular-nums">{formatScore(ice)}</div>
              </div>
              <div>
                <div className="text-xs text-soft">Puntaje final</div>
                <div className="text-2xl font-semibold tabular-nums">{formatScore(final)}</div>
              </div>
              <p className="text-xs text-soft">
                ICE {formatScore(ice)} {v.fits_calendar ? `+ ${formatScore(data.scoring.calendar_bonus)} calendario ` : ""}
                {v.control !== "ours" ? `− ${formatScore(controlPenalty(v.control, data.scoring))} control ${CONTROL_LABEL[v.control].toLowerCase()}` : ""}
              </p>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <DesignStep v={v} set={set} setV={setV} locked={designLocked} metricName={lineMetrics.find((m) => m.id === v.metric_id)?.name} />
        ) : null}

        {step === 5 ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField id="owner_id" label="Responsable" description={data.canScore ? "Quién ejecuta y reporta el ejercicio." : "La agencia queda como responsable de lo que crea."}>
                <Select
                  value={v.owner_id ?? undefined}
                  onValueChange={(uid) => {
                    const m = data.members.find((x) => x.user_id === uid);
                    setV((prev) => ({
                      ...prev,
                      owner_id: uid,
                      owner_type: prev.owner_type ?? (m?.role === "agency" ? "agency" : "internal"),
                    }));
                  }}
                  disabled={!data.canScore}
                >
                  <SelectTrigger id="owner_id" className="w-full">
                    <SelectValue placeholder="Elige a una persona del programa" />
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
              <FormField id="planned_start" label="Inicio planeado">
                <Input id="planned_start" type="date" value={v.planned_start} onChange={(e) => set("planned_start", e.target.value)} />
              </FormField>
              <FormField id="planned_end" label="Fin planeado" error={errors.planned_end}>
                <Input id="planned_end" type="date" value={v.planned_end} onChange={(e) => set("planned_end", e.target.value)} />
              </FormField>
            </div>
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

function DesignStep({
  v,
  set,
  setV,
  locked,
  metricName,
}: {
  v: WizardValues;
  set: <K extends keyof WizardValues>(k: K, value: WizardValues[K]) => void;
  setV: React.Dispatch<React.SetStateAction<WizardValues>>;
  locked: boolean;
  metricName?: string;
}) {
  const [newControlMetric, setNewControlMetric] = useState("");
  function updateVariant(i: number, patch: Partial<WizardVariant>) {
    setV((prev) => ({
      ...prev,
      variants: prev.variants.map((x, j) =>
        j === i ? { ...x, ...patch } : patch.is_control ? { ...x, is_control: false } : x,
      ),
    }));
  }
  const weeks = v.min_duration_days ? v.min_duration_days / 7 : null;

  return (
    <fieldset disabled={locked} className="space-y-6">
      {locked ? (
        <Callout icon={Lock} title="Diseño bloqueado">
          El ejercicio ya está en prueba: variantes, métricas, duración y regla de decisión son de solo lectura. Solo el owner puede
          desbloquearlo desde el detalle.
        </Callout>
      ) : (
        <p className="text-sm text-soft">El diseño se fija antes de lanzar y no se reinterpreta después: al pasar a En prueba queda bloqueado.</p>
      )}
      <div>
        <div className="mb-2 text-sm font-medium">Tipo de prueba</div>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tipo de prueba">
          {TEST_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={v.test_type === t}
              onClick={() => set("test_type", t)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-sm hover:border-ink/40",
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
          <div className="text-sm font-medium">Variantes</div>
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
            <li key={x.id ?? i} className="grid items-start gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_2fr_auto_auto]">
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
        {!v.variants.some((x) => x.is_control) ? <p className="mt-2 text-sm">Marca una variante como control.</p> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField id="primary_metric" label="Métrica principal" description="La que decide el resultado.">
          <Input
            id="primary_metric"
            value={v.primary_metric}
            placeholder={metricName}
            onChange={(e) => set("primary_metric", e.target.value)}
          />
        </FormField>
        <FormField id="min_duration_days" label="Duración mínima (días)" description={weeks ? `≈ ${formatScore(weeks)} semanas` : "Ej.: 28 días = 4 semanas."}>
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

      <FormField id="decision_rule" label="Regla de decisión" description="Qué resultado lleva a escalar, ajustar o apagar. Se fija antes de lanzar.">
        <Textarea
          id="decision_rule"
          rows={2}
          value={v.decision_rule}
          placeholder="Escalar si la variante supera al control en al menos 10% relativo y el bloqueo no pasa de 1,5%."
          onChange={(e) => set("decision_rule", e.target.value)}
        />
      </FormField>
    </fieldset>
  );
}
