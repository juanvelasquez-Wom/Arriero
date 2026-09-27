"use client";

import { ArrowRight, Check, ListChecks, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { celebrate, CELEBRATIONS } from "@/components/brand/celebrate";
import { InfoTip } from "@/components/app/info-tip";
import { FormError } from "@/components/app/form";
import { FIELD_HELP, QUICK_FIELD_HELP } from "@/components/setup/help-content";
import { HelpLabel, UseExampleButton } from "@/components/setup/help";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/domain/format";
import { GENERIC_TEMPLATE, TELCO_TEMPLATES } from "@/domain/growth-templates";
import {
  CUSTOM_LINE_KEY,
  DEFAULT_QUICK_DURATION,
  QUICK_DURATIONS,
  quickProgramEnd,
  quickTreeMetrics,
  suggestProgramName,
  typicalTelcoCalendar,
  type QuickDuration,
  type QuickLineInput,
} from "@/domain/quick-start";
import { cn } from "@/lib/utils";
import { saveQuickStart } from "@/server/actions/setup";

const cardClass = (active: boolean) =>
  cn(
    "lift flex h-full cursor-pointer flex-col rounded-xl border p-3 text-left text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink",
    active ? "border-ink bg-wash ring-1 ring-ink" : "hover:bg-wash",
  );

/**
 * Arranque rápido: la puerta de entrada para crear un programa. Una sola
 * pantalla con valores por defecto en todo (hoy, 6 meses, calendario telco y la
 * primera plantilla marcada); el nombre, si queda vacío, se sugiere solo.
 */
export function QuickStartForm({ today, fullHref }: { today: string; fullHref: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([TELCO_TEMPLATES[0].key]);
  const [customOn, setCustomOn] = useState(false);
  const [lineName, setLineName] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [months, setMonths] = useState<QuickDuration>(DEFAULT_QUICK_DURATION);
  const [useTelcoCalendar, setUseTelcoCalendar] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate);
  const end = validStart ? quickProgramEnd(startDate, months) : null;
  const lines: QuickLineInput[] = [
    ...TELCO_TEMPLATES.filter((t) => selected.includes(t.key)).map((t) => ({ templateKey: t.key })),
    ...(customOn ? [{ templateKey: CUSTOM_LINE_KEY, lineName }] : []),
  ];
  const lineNames = [
    ...TELCO_TEMPLATES.filter((t) => selected.includes(t.key)).map((t) => t.name),
    ...(customOn ? [lineName.trim() || "su línea"] : []),
  ];
  const suggestion = suggestProgramName(lineNames, validStart ? startDate : null, months);

  // Resumen en vivo de lo que va a quedar armado.
  const events = useTelcoCalendar && end ? typicalTelcoCalendar(startDate, end) : [];
  const peaks = events.filter((e) => e.type === "peak").length;
  const decision = events.find((e) => e.type === "decision")?.start_date ?? null;
  const metricsCount =
    TELCO_TEMPLATES.filter((t) => selected.includes(t.key)).reduce((n, t) => n + quickTreeMetrics(t).length, 0) +
    (customOn ? quickTreeMetrics(GENERIC_TEMPLATE).length : 0);

  const toggle = (key: string) => setSelected((s) => (s.includes(key) ? s.filter((x) => x !== key) : [...s, key]));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setErrors({});
    if (!lines.length) {
      setErrors({ lines: "Elija al menos una línea de negocio. Sin línea no hay camino." });
      return;
    }
    if (customOn && lineName.trim().length < 2) {
      setErrors({ lineName: "Escriba el nombre de su línea de negocio." });
      document.getElementById("q-line")?.focus();
      return;
    }
    startTransition(async () => {
      const r = await saveQuickStart({ name, lines, startDate, months, useTelcoCalendar });
      if (!r.ok) {
        setError(r.error);
        if (r.fieldErrors) {
          const map: Record<string, string> = {};
          for (const [k, m] of Object.entries(r.fieldErrors)) map[k.endsWith("lineName") ? "lineName" : k.startsWith("lines") ? "lines" : k] = m[0];
          setErrors(map);
        }
        return;
      }
      if (r.data.partialError) {
        toast.error(r.data.partialError, { duration: 12000 });
      } else {
        celebrate(CELEBRATIONS.setupDone[0], r.message);
      }
      router.push(r.data.href);
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-paper p-5 shadow-card" noValidate>
      <FormError message={error} className="mb-4" />
      <fieldset disabled={pending} className="space-y-6">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <HelpLabel htmlFor="q-name" help={FIELD_HELP.programName}>
              Nombre del programa
            </HelpLabel>
            <UseExampleButton onClick={() => setName(suggestion)} label="Sugiérame un nombre" />
          </div>
          <Input
            id="q-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={suggestion}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "q-name-error" : "q-name-hint"}
          />
          {errors.name ? (
            <p id="q-name-error" className="text-sm font-medium">
              {errors.name}
            </p>
          ) : (
            <p id="q-name-hint" className="text-xs text-soft">
              Si lo deja vacío, le ponemos el de la sugerencia.
            </p>
          )}
        </div>

        <fieldset aria-describedby={errors.lines ? "q-lines-error" : undefined}>
          <legend className="flex items-center gap-1 text-sm font-medium">
            Líneas de negocio <span aria-hidden className="text-soft">*</span>
            <InfoTip label="Líneas de negocio">{QUICK_FIELD_HELP.line}</InfoTip>
          </legend>
          <p className="mt-0.5 text-xs text-soft">Marque una o varias. Las demás las agrega cuando quiera.</p>
          <div className="stagger mt-2 grid gap-2 sm:grid-cols-2">
            {TELCO_TEMPLATES.map((t) => {
              const active = selected.includes(t.key);
              return (
                <label key={t.key} className={cardClass(active)}>
                  <input type="checkbox" aria-label={t.name} checked={active} onChange={() => toggle(t.key)} className="sr-only" />
                  <span className="flex items-center justify-between gap-2 font-semibold">
                    {t.name}
                    <span
                      className={cn("flex size-5 shrink-0 items-center justify-center rounded border", active && "border-ink bg-ink text-paper")}
                      aria-hidden
                    >
                      {active ? <Check className="pop-in size-3.5" /> : null}
                    </span>
                  </span>
                  <span className="mt-0.5 text-soft">{t.summary}</span>
                  <span className="mt-2 text-xs text-soft">
                    Métrica norte: <span className="text-ink">{t.northStar.name}</span>
                  </span>
                </label>
              );
            })}
            <label className={cn(cardClass(customOn), "sm:col-span-2")}>
              <input type="checkbox" aria-label="Otra línea" checked={customOn} onChange={() => setCustomOn((v) => !v)} className="sr-only" />
              <span className="flex items-center justify-between gap-2 font-semibold">
                <span className="flex items-center gap-1.5">
                  <Plus className="size-4" aria-hidden /> Otra línea
                </span>
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded border", customOn && "border-ink bg-ink text-paper")} aria-hidden>
                  {customOn ? <Check className="pop-in size-3.5" /> : null}
                </span>
              </span>
              <span className="mt-0.5 text-soft">Una línea propia, con métricas genéricas de venta digital para arrancar.</span>
            </label>
          </div>
          {errors.lines ? (
            <p id="q-lines-error" className="mt-2 text-sm font-medium" role="alert">
              {errors.lines}
            </p>
          ) : null}
          {customOn ? (
            <div className="slide-in mt-3 space-y-1.5">
              <HelpLabel htmlFor="q-line" required>
                Nombre de la otra línea
              </HelpLabel>
              <Input
                id="q-line"
                value={lineName}
                onChange={(e) => setLineName(e.target.value)}
                placeholder="Hogar fibra"
                aria-invalid={!!errors.lineName}
                aria-describedby={errors.lineName ? "q-line-error" : undefined}
                autoFocus
              />
              {errors.lineName ? (
                <p id="q-line-error" className="text-sm font-medium">
                  {errors.lineName}
                </p>
              ) : null}
            </div>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <HelpLabel htmlFor="q-start" help={FIELD_HELP.programDates} required>
              Empieza
            </HelpLabel>
            <Input id="q-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-invalid={!!errors.startDate || !validStart} />
            {errors.startDate ? <p className="text-sm font-medium">{errors.startDate}</p> : null}
          </div>
          <fieldset className="space-y-1.5">
            <legend className="flex items-center gap-1 text-sm font-medium">
              Duración
              <InfoTip label="Duración">{QUICK_FIELD_HELP.duration}</InfoTip>
            </legend>
            <div role="radiogroup" className="flex gap-2">
              {QUICK_DURATIONS.map((d) => (
                <label key={d} className={cn(cardClass(months === d), "flex-1 items-center py-2 font-medium")}>
                  <input type="radio" name="q-months" aria-label={`${d} meses`} value={d} checked={months === d} onChange={() => setMonths(d)} className="sr-only" />
                  {d} meses
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        {end ? (
          <p className="-mt-3 text-xs text-soft">
            Va del {formatDate(startDate)} al {formatDate(end)}.
          </p>
        ) : null}

        <div className="flex items-start gap-2">
          <Checkbox id="q-calendar" checked={useTelcoCalendar} onCheckedChange={(v) => setUseTelcoCalendar(v === true)} className="mt-0.5" />
          <div>
            <label htmlFor="q-calendar" className="flex items-center gap-1 text-sm font-medium">
              Usar el calendario típico de telco
              <InfoTip label="Calendario típico de telco">{QUICK_FIELD_HELP.telcoCalendar}</InfoTip>
            </label>
            <p className="text-xs text-soft">Black Friday–Cyber y diciembre con sus congelamientos, más un punto de decisión.</p>
          </div>
        </div>

        <div className="rounded-xl bg-wash p-4 text-sm" aria-live="polite">
          <strong>Arriero le deja listo:</strong>
          <ul className="mt-2 space-y-1">
            <li className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                El programa <span className="font-medium">{name.trim() || suggestion}</span>
              </span>
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {useTelcoCalendar
                  ? `Calendario con ${peaks} pico(s) y sus congelamientos${decision ? `, decisión el ${formatDate(decision)}` : ""}, y horizontes ${decision ? "H1 y H2" : "H1"}`
                  : "Sin calendario comercial: un solo horizonte (H1) para todo el periodo"}
              </span>
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {lines.length ? (
                  <>
                    {lines.length} línea(s): <span className="font-medium">{lineNames.join(", ")}</span>, cada una con su métrica norte, eficiencia y
                    embudo de 4 etapas ({metricsCount} métricas de entrada en total)
                  </>
                ) : (
                  "Ninguna línea todavía: marque al menos una"
                )}
              </span>
            </li>
          </ul>
          <p className="mt-2 text-xs text-soft">Líneas base, metas, equipo y más líneas los completa después en Configuración. Nada queda escrito en piedra.</p>
        </div>
      </fieldset>

      <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href={fullHref} className="inline-flex items-center gap-1.5 text-sm text-soft underline underline-offset-4 hover:text-ink">
          <ListChecks className="size-4" aria-hidden /> Prefiero configurarlo todo paso a paso
        </Link>
        <Button type="submit" size="lg" disabled={pending} className="group w-full sm:w-auto">
          {pending ? <Spinner /> : null}
          Arme el programa {pending ? null : <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden />}
        </Button>
      </div>
    </form>
  );
}
