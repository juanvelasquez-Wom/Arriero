"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Equal, GitMerge, Plus, RefreshCw, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyFieldErrors, FormError, FormField } from "@/components/app/form";
import { Callout } from "@/components/app/page";
import { PilotStatusBadge, WeakEvidenceBadge } from "@/components/pilots/pilot-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { needsDesignJustification } from "@/domain/pilots/flow";
import { PILOT_TEST_TYPE_HELP, PILOT_TEST_TYPE_LABEL, PILOT_TEST_TYPE_SETUP, VARIABLE_CATEGORY_LABEL } from "@/domain/pilots/labels";
import { describeOverlap, overlapsFor } from "@/domain/pilots/overlap";
import { PILOT_TEST_TYPES, VARIABLE_CATEGORIES, type PilotSummary, type PilotTestType, type VariableCategory } from "@/domain/pilots/types";
import {
  armsForTestType,
  DEFAULT_HOLDOUT_PCT,
  holdoutSplits,
  nextArmName,
  plannedDays,
  splitEvenly,
  splitTotal,
  summaryFromDesign,
} from "@/domain/pilots/wizard";
import { formatDateRange } from "@/domain/format";
import { formatCop } from "@/domain/value";
import { cn } from "@/lib/utils";
import { pilotDesignSchema, type PilotDesignInput } from "@/lib/validation/pilots";
import { savePilotDesign } from "@/server/actions/pilots";
import type { MediaChannel, PilotVariable } from "@/server/queries/pilots";
import { ChipInput, NumberInput } from "./inputs";
import { MediaPicker } from "./media-picker";
import { WizardFooter, type SaveThen } from "./wizard-footer";
import { pilotStepHref } from "./wizard-links";

type DesignValues = z.output<typeof pilotDesignSchema>;
type Arm = PilotDesignInput["arms"][number];
type Media = PilotDesignInput["media"][number];

export interface StepDesignProps {
  pilotId: string;
  pilotTitle: string;
  initial: PilotDesignInput;
  variables: PilotVariable[];
  media: MediaChannel[];
  /** Resúmenes de los otros pilotos, para avisar cruces en vivo. */
  others: PilotSummary[];
}

const MAX_ARMS = 12;
const MAX_MEDIA = 10;

/** Texto con que la base avisa que otra persona guardó primero (RPC save_pilot_design). */
const STALE_MARK = "Otra persona cambió este piloto";

function errorText(e: unknown): string | undefined {
  if (!e || typeof e !== "object") return undefined;
  const x = e as { message?: unknown; root?: { message?: unknown } };
  if (typeof x.message === "string") return x.message;
  if (typeof x.root?.message === "string") return x.root.message;
  return undefined;
}

export function StepDesign({ pilotId, pilotTitle, initial, variables, media, others }: StepDesignProps) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [stale, setStale] = useState(false);
  const [pending, startTransition] = useTransition();
  const [catalog, setCatalog] = useState(media);

  const form = useForm<PilotDesignInput, unknown, DesignValues>({
    resolver: zodResolver(pilotDesignSchema),
    defaultValues: initial,
  });
  const { errors } = form.formState;
  const values = useWatch({ control: form.control }) as PilotDesignInput;
  const arms = (values.arms ?? []) as Arm[];
  const mediaRows = (values.media ?? []) as Media[];
  const testType = values.test_type ?? null;
  const config = values.design_config ?? {};
  const variable = variables.find((v) => v.id === values.variable_id) ?? null;
  const needsJustification = needsDesignJustification({
    variable: variable ? { recommended_test_type: variable.recommended_test_type, alternative_test_type: variable.alternative_test_type } : null,
    test_type: testType,
  });
  const days = plannedDays(values.planned_start || null, values.planned_end || null);
  const controlIndex = arms.findIndex((a) => a.is_control);
  const total = splitTotal(arms.map((a) => ({ split_pct: a.split_pct ?? null })));
  const usesSplits = testType === "ab_creative" || testType === "ab_platform";
  const usesCities = testType === "geo";
  const usesPreStart = testType === "geo" || testType === "pre_post";

  const mediaNames = Object.fromEntries(catalog.map((m) => [m.id, m.name]));
  const overlaps = overlapsFor(
    summaryFromDesign(
      {
        id: pilotId,
        title: pilotTitle,
        status: "draft",
        test_type: testType,
        planned_start: values.planned_start || null,
        planned_end: values.planned_end || null,
        media: mediaRows.map((m) => ({ ...m, media_id: m.media_id ?? "" })),
        arms: arms.map((a) => ({ cities: a.cities ?? [] })),
      },
      mediaNames,
    ),
    others,
  );

  const variablesByCategory = VARIABLE_CATEGORIES.map((c) => ({ category: c, items: variables.filter((v) => v.category === c) })).filter(
    (g) => g.items.length,
  );
  const uncategorized = variables.filter((v) => !VARIABLE_CATEGORIES.includes(v.category as VariableCategory));

  const setArms = (next: Arm[]) => form.setValue("arms", next, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
  const setArm = (i: number, patch: Partial<Arm>) => setArms(arms.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const setMedia = (next: Media[]) => form.setValue("media", next, { shouldDirty: true });
  const setMediaRow = (i: number, patch: Partial<Media>) => setMedia(mediaRows.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const chooseType = (t: PilotTestType) => {
    form.setValue("test_type", t, { shouldDirty: true });
    let holdout = config.holdout_pct ?? null;
    if (t === "holdout" && holdout == null) {
      holdout = DEFAULT_HOLDOUT_PCT;
      form.setValue("design_config.holdout_pct", holdout, { shouldDirty: true });
    }
    const drafts = arms.map((a) => ({ ...a, split_pct: a.split_pct ?? null, cities: a.cities ?? [] }));
    setArms(armsForTestType(t, drafts, holdout));
  };

  const setHoldout = (pct: number | null) => {
    form.setValue("design_config.holdout_pct", pct, { shouldDirty: true });
    if (pct == null || Number.isNaN(pct)) return;
    const [exposed, holdout] = holdoutSplits(pct);
    setArms(arms.map((a) => ({ ...a, split_pct: a.is_control ? holdout : exposed })));
  };

  const addArm = () => {
    if (!testType || arms.length >= MAX_ARMS) return;
    const next: Arm[] = [...arms, { name: nextArmName(testType, arms), is_control: false, split_pct: null, cities: [] }];
    setArms(usesSplits ? next.map((a, i) => ({ ...a, split_pct: splitEvenly(next.length)[i] })) : next);
  };

  const removeArm = (i: number) => {
    const next = arms.filter((_, j) => j !== i);
    if (arms[i]?.is_control && next.length) next[0] = { ...next[0], is_control: true };
    setArms(usesSplits ? next.map((a, j) => ({ ...a, split_pct: splitEvenly(next.length)[j] })) : next);
  };

  const save = (then: SaveThen) => {
    form.clearErrors("design_justification");
    if (then === "next" && needsJustification && (values.design_justification ?? "").trim().length < 10) {
      form.setError("design_justification", { type: "manual", message: "Cuente en al menos 10 caracteres por qué no usa el tipo recomendado." });
      setError("Revise los campos marcados, sin afán.");
      return;
    }
    form.handleSubmit(
      (data) => {
        setError(undefined);
        startTransition(async () => {
          const r = await savePilotDesign(pilotId, data);
          if (!r.ok) {
            if (r.error.includes(STALE_MARK)) {
              setStale(true);
              return;
            }
            setError(r.error);
            applyFieldErrors(r.fieldErrors, form.setError);
            return;
          }
          setStale(false);
          // Lo guardado es la nueva versión de referencia para el próximo guardado.
          if (r.data.updatedAt) form.setValue("expected_updated_at", r.data.updatedAt);
          toast.success(r.message ?? "Diseño guardado.");
          if (then === "next") router.push(pilotStepHref(pilotId, "metricas"));
          else router.refresh();
        });
      },
      () => setError("Revise los campos marcados, sin afán."),
    )();
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save("next");
      }}
      className="space-y-6"
    >
      <FormError message={error} />
      {stale ? (
        <Callout icon={TriangleAlert} title="Otra persona guardó este piloto mientras usted lo editaba">
          <p>Para no pisar sus cambios, no guardamos los suyos. Copie lo que necesite, recargue para ver lo último y vuelva a guardar.</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => window.location.reload()}>
            <RefreshCw aria-hidden /> Recargar
          </Button>
        </Callout>
      ) : null}

      {/* Qué se prueba */}
      <section className="space-y-4 rounded-2xl border bg-paper p-4 shadow-card sm:p-5">
        <h2 className="text-base font-bold">Qué se prueba</h2>
        <FormField id="design-variable" label="Variable" error={errors.variable_id?.message} description="Lo único que cambia entre los grupos.">
          <Controller
            control={form.control}
            name="variable_id"
            render={({ field }) => (
              <Select
                value={field.value || undefined}
                onValueChange={(v) => {
                  field.onChange(v);
                  // Sin tipo elegido todavía, arranca con el recomendado.
                  const picked = variables.find((x) => x.id === v);
                  if (picked && !testType) chooseType(picked.recommended_test_type);
                }}
              >
                <SelectTrigger id="design-variable" className="min-h-11 w-full" aria-invalid={!!errors.variable_id}>
                  <SelectValue placeholder="Elija qué va a probar" />
                </SelectTrigger>
                <SelectContent>
                  {variablesByCategory.map((g) => (
                    <SelectGroup key={g.category}>
                      <SelectLabel>{VARIABLE_CATEGORY_LABEL[g.category]}</SelectLabel>
                      {g.items.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                  {uncategorized.length ? (
                    <SelectGroup>
                      <SelectLabel>Otras</SelectLabel>
                      {uncategorized.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        {!variables.length ? (
          <Callout tone="neutral" title="El catálogo de variables está vacío">
            Un aprobador las agrega en{" "}
            <Link href="/pilotos/catalogos" className="underline underline-offset-4">
              Catálogos
            </Link>
            .
          </Callout>
        ) : null}
        {variable ? (
          <div className="pop-in rounded-xl border bg-wash px-4 py-3 text-sm">
            {variable.description ? <p className="mb-2 text-soft">{variable.description}</p> : null}
            <div className="flex flex-wrap items-center gap-2 font-medium">
              <Sparkles aria-hidden className="size-4" /> Arriero recomienda: {PILOT_TEST_TYPE_LABEL[variable.recommended_test_type]}
              {variable.alternative_test_type ? (
                <span className="font-normal text-soft">· también sirve {PILOT_TEST_TYPE_LABEL[variable.alternative_test_type]}</span>
              ) : null}
            </div>
            <p className="mt-1 text-soft">{PILOT_TEST_TYPE_HELP[variable.recommended_test_type]}</p>
            {testType !== variable.recommended_test_type ? (
              <Button type="button" variant="outline" size="sm" className="mt-2 min-h-9" onClick={() => chooseType(variable.recommended_test_type)}>
                Usar {PILOT_TEST_TYPE_LABEL[variable.recommended_test_type]}
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Tipo de prueba */}
      <section className="space-y-4 rounded-2xl border bg-paper p-4 shadow-card sm:p-5">
        <h2 className="text-base font-bold" id="design-type-label">
          Tipo de prueba
        </h2>
        <RadioGroup
          aria-labelledby="design-type-label"
          value={testType ?? ""}
          onValueChange={(v) => chooseType(v as PilotTestType)}
          className="stagger grid gap-2 sm:grid-cols-2"
        >
          {PILOT_TEST_TYPES.map((t) => {
            const recommended = variable?.recommended_test_type === t;
            const alternative = variable?.alternative_test_type === t;
            return (
              <Label
                key={t}
                htmlFor={`type-${t}`}
                className={cn(
                  "lift flex cursor-pointer items-start gap-3 rounded-xl border bg-paper p-3 font-normal hover:border-ink/40",
                  testType === t && "border-ink bg-wash",
                )}
              >
                <RadioGroupItem id={`type-${t}`} value={t} className="mt-0.5" />
                <span className="min-w-0 space-y-1">
                  <span className="flex flex-wrap items-center gap-1.5 font-semibold">
                    {PILOT_TEST_TYPE_LABEL[t]}
                    {recommended ? (
                      <span className="inline-flex h-5 items-center gap-1 rounded-full bg-highlight px-2 text-[11px] font-semibold text-[#1f1f1f]">
                        <Sparkles aria-hidden className="size-3" /> Recomendado
                      </span>
                    ) : alternative ? (
                      <span className="inline-flex h-5 items-center rounded-full border border-line px-2 text-[11px] font-medium text-soft">También sirve</span>
                    ) : null}
                    {t === "pre_post" ? <WeakEvidenceBadge /> : null}
                  </span>
                  <span className="block text-xs text-soft">{PILOT_TEST_TYPE_HELP[t]}</span>
                </span>
              </Label>
            );
          })}
        </RadioGroup>
        {errors.test_type?.message ? <p className="text-sm text-destructive">{errors.test_type.message}</p> : null}
        {needsJustification ? (
          <FormField
            id="design-justification"
            label="¿Por qué otro tipo de prueba?"
            required
            error={errors.design_justification?.message}
            description="El aprobador lo lee antes de aprobar. Mínimo 10 caracteres."
          >
            <Textarea
              id="design-justification"
              rows={2}
              placeholder="Ej. No hay volumen para un holdout; la venta pasa por WhatsApp y solo se puede leer por ciudad."
              aria-invalid={!!errors.design_justification}
              {...form.register("design_justification")}
            />
          </FormField>
        ) : null}
      </section>

      {/* Configuración según el tipo */}
      {testType ? (
        <section className="space-y-4 rounded-2xl border bg-paper p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-bold">Grupos y configuración</h2>
              <p className="text-xs text-soft">{PILOT_TEST_TYPE_SETUP[testType]}</p>
            </div>
            {testType === "pre_post" ? <WeakEvidenceBadge /> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label id="design-granularity-label">Los datos se cargan por</Label>
              <Controller
                control={form.control}
                name="design_config.granularity"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    aria-labelledby="design-granularity-label"
                    value={field.value ?? "day"}
                    onValueChange={(v) => v && field.onChange(v)}
                  >
                    <ToggleGroupItem value="day" className="min-h-11 px-4">
                      Día
                    </ToggleGroupItem>
                    <ToggleGroupItem value="week" className="min-h-11 px-4">
                      Semana
                    </ToggleGroupItem>
                  </ToggleGroup>
                )}
              />
            </div>
            {testType === "holdout" ? (
              <FormField
                id="design-holdout"
                label="Holdout (%)"
                error={errors.design_config?.holdout_pct?.message}
                description="Qué parte del público se queda sin ver la campaña. Lo normal: entre 10 % y 20 %."
              >
                <NumberInput
                  id="design-holdout"
                  className="[&_input]:min-h-11"
                  suffix="%"
                  value={config.holdout_pct}
                  onChange={setHoldout}
                  aria-invalid={!!errors.design_config?.holdout_pct}
                />
              </FormField>
            ) : null}
            {usesPreStart ? (
              <FormField
                id="design-pre-start"
                label="Periodo previo desde"
                error={errors.design_config?.pre_start?.message}
                description="Desde cuándo se toman datos del «antes» para comparar."
              >
                <Input id="design-pre-start" type="date" className="min-h-11" {...form.register("design_config.pre_start")} />
              </FormField>
            ) : null}
          </div>

          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-medium">Grupos · el control es la referencia</legend>
            <RadioGroup
              aria-label="Grupo de control"
              value={controlIndex >= 0 ? String(controlIndex) : ""}
              onValueChange={(v) => setArms(arms.map((a, i) => ({ ...a, is_control: String(i) === v })))}
              className="space-y-2"
              disabled={testType === "holdout"}
            >
              {arms.map((arm, i) => {
                const armErrors = (errors.arms as unknown as Record<number, Record<string, unknown>> | undefined)?.[i];
                return (
                  <div key={arm.id || `new-${i}`} className={cn("rounded-xl border p-3", arm.is_control && "border-ink/40 bg-wash")}>
                    <div className="flex flex-wrap items-end gap-3">
                      <FormField id={`arm-${i}-name`} label="Nombre" className="min-w-40 flex-1" error={errorText(armErrors?.name)}>
                        <Input
                          id={`arm-${i}-name`}
                          className="min-h-11"
                          value={arm.name}
                          onChange={(e) => setArm(i, { name: e.target.value })}
                          disabled={testType === "holdout"}
                        />
                      </FormField>
                      {usesSplits || testType === "holdout" ? (
                        <FormField id={`arm-${i}-split`} label="Reparto" className="w-28">
                          <NumberInput
                            id={`arm-${i}-split`}
                            className="[&_input]:min-h-11"
                            suffix="%"
                            value={arm.split_pct}
                            onChange={(v) => setArm(i, { split_pct: v })}
                            disabled={testType === "holdout"}
                          />
                        </FormField>
                      ) : null}
                      <Label htmlFor={`arm-${i}-control`} className="flex min-h-11 cursor-pointer items-center gap-2 font-normal">
                        <RadioGroupItem id={`arm-${i}-control`} value={String(i)} /> Control
                      </Label>
                      {testType !== "holdout" && arms.length > 2 ? (
                        <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Quitar ${arm.name || "grupo"}`} onClick={() => removeArm(i)}>
                          <Trash2 aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                    {usesCities ? (
                      <div className="mt-3 space-y-1.5">
                        <Label htmlFor={`arm-${i}-cities`}>Ciudades {arm.is_control ? "de control" : "de prueba"}</Label>
                        <ChipInput
                          id={`arm-${i}-cities`}
                          label={`Ciudades de ${arm.name || "este grupo"}`}
                          value={arm.cities ?? []}
                          onChange={(cities) => setArm(i, { cities })}
                          placeholder="Ej. Medellín y presione Enter"
                          invalid={(arm.cities ?? []).length === 0 && form.formState.isSubmitted}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </RadioGroup>
            {errorText(errors.arms) ? <p className="text-sm text-destructive">{errorText(errors.arms)}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              {testType !== "holdout" ? (
                <Button type="button" variant="outline" className="min-h-11" onClick={addArm} disabled={arms.length >= MAX_ARMS}>
                  <Plus aria-hidden /> {usesCities ? "Agregar grupo de ciudades" : testType === "pre_post" ? "Agregar serie" : "Agregar variante"}
                </Button>
              ) : null}
              {usesSplits ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => setArms(arms.map((a, i) => ({ ...a, split_pct: splitEvenly(arms.length)[i] })))}
                  >
                    <Equal aria-hidden /> Repartir parejo
                  </Button>
                  <span className={cn("text-sm tabular-nums", Math.abs(total - 100) > 0.5 ? "font-semibold text-ink" : "text-soft")}>
                    Suma: {String(total).replace(".", ",")} %{Math.abs(total - 100) > 0.5 ? " · debe sumar 100 %" : ""}
                  </span>
                </>
              ) : null}
            </div>
            {controlIndex < 0 ? <p className="text-sm text-soft">Marque cuál grupo es el control.</p> : null}
          </fieldset>
        </section>
      ) : null}

      {/* Medios */}
      <section className="space-y-4 rounded-2xl border bg-paper p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold">Medios</h2>
            <p className="text-xs text-soft">Dónde corre el piloto. Cuenta, campaña, audiencia, destino y ciudades sirven para avisar cruces.</p>
          </div>
          {mediaRows.length < MAX_MEDIA ? (
            <MediaPicker
              catalog={catalog.filter((m) => !m.archived_at && !m.merged_into_id)}
              selectedIds={mediaRows.map((m) => m.media_id)}
              onCreated={(m) => setCatalog((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m].sort((a, b) => a.name.localeCompare(b.name, "es"))))}
              onPick={(m) => setMedia([...mediaRows, { media_id: m.id, account: "", campaign: "", audience: "", destination: "", cities: [] }])}
            />
          ) : null}
        </div>
        {errorText(errors.media) ? <p className="text-sm text-destructive">{errorText(errors.media)}</p> : null}
        {!mediaRows.length ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-soft">Todavía no hay medios. Agregue al menos uno para enviar a revisión.</p>
        ) : (
          <ul className="stagger space-y-3">
            {mediaRows.map((m, i) => (
              <li key={m.id || `${m.media_id}-${i}`} className="rounded-xl border p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="font-semibold">{mediaNames[m.media_id] ?? "Medio"}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={`Quitar ${mediaNames[m.media_id] ?? "medio"}`}
                    onClick={() => setMedia(mediaRows.filter((_, j) => j !== i))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["account", "Cuenta", "Ej. WOM Pospago"],
                      ["campaign", "Campaña", "Ej. CTWA Pospago oct"],
                      ["audience", "Audiencia", "Ej. Portabilidad 25–45"],
                      ["destination", "Destino", "Ej. WhatsApp ventas"],
                    ] as const
                  ).map(([key, label, placeholder]) => (
                    <FormField key={key} id={`media-${i}-${key}`} label={label}>
                      <Input
                        id={`media-${i}-${key}`}
                        className="min-h-11"
                        placeholder={placeholder}
                        value={m[key] ?? ""}
                        onChange={(e) => setMediaRow(i, { [key]: e.target.value } as Partial<Media>)}
                      />
                    </FormField>
                  ))}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor={`media-${i}-cities`}>Ciudades</Label>
                    <ChipInput
                      id={`media-${i}-cities`}
                      label={`Ciudades de ${mediaNames[m.media_id] ?? "este medio"}`}
                      value={m.cities ?? []}
                      onChange={(cities) => setMediaRow(i, { cities })}
                      placeholder="Vacío = todo el país"
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Fechas y presupuesto */}
      <section className="space-y-4 rounded-2xl border bg-paper p-4 shadow-card sm:p-5">
        <h2 className="text-base font-bold">Fechas y presupuesto</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="design-start" label="Inicio planeado" error={errors.planned_start?.message}>
            <Input id="design-start" type="date" className="min-h-11" {...form.register("planned_start")} />
          </FormField>
          <FormField
            id="design-end"
            label="Fin planeado"
            error={errors.planned_end?.message}
            description={days ? `${days} ${days === 1 ? "día" : "días"}` : undefined}
          >
            <Input id="design-end" type="date" className="min-h-11" {...form.register("planned_end")} />
          </FormField>
          <FormField
            id="design-budget"
            label="Presupuesto (COP)"
            error={errors.planned_budget_cop?.message}
            description={values.planned_budget_cop ? formatCop(values.planned_budget_cop) : "Inversión total del piloto."}
          >
            <Controller
              control={form.control}
              name="planned_budget_cop"
              render={({ field }) => (
                <NumberInput
                  id="design-budget"
                  className="[&_input]:min-h-11"
                  prefix="$"
                  placeholder="12.000.000"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-invalid={!!errors.planned_budget_cop}
                />
              )}
            />
          </FormField>
        </div>
      </section>

      {overlaps.length ? (
        <Callout icon={GitMerge} title="Ojo: estos pilotos se cruzan">
          <ul className="mt-1 space-y-2">
            {overlaps.map((o) => (
              <li key={o.otherId}>
                <Link href={`/pilotos/${o.otherId}`} className="font-medium underline underline-offset-4" target="_blank">
                  {o.otherTitle}
                </Link>{" "}
                <PilotStatusBadge status={o.otherStatus} className="ml-1 align-middle" />
                <div className="text-sm">
                  {describeOverlap(o)} · {formatDateRange(o.from, o.to)}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">Si corren a la vez, uno contamina la lectura del otro. Cambie las fechas o sepárelos.</p>
        </Callout>
      ) : null}

      {testType === "pre_post" ? (
        <Callout icon={TriangleAlert} tone="neutral" title="Antes / después es evidencia débil">
          Úselo solo si no hay forma de repartir al azar ni por ciudades. La lectura queda como evidencia débil.
        </Callout>
      ) : null}

      <WizardFooter prevHref={pilotStepHref(pilotId, "problema")} pending={pending} onSave={save} />
    </form>
  );
}
