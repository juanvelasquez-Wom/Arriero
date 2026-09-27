"use client";

import { ArrowLeft, ArrowRight, Check, Plus } from "lucide-react";
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
import { TELCO_TEMPLATES } from "@/domain/growth-templates";
import { CUSTOM_LINE_KEY, DEFAULT_QUICK_DURATION, QUICK_DURATIONS, quickProgramEnd, type QuickDuration } from "@/domain/quick-start";
import { cn } from "@/lib/utils";
import { saveQuickStart } from "@/server/actions/setup";

const cardClass = (active: boolean) =>
  cn(
    "flex h-full cursor-pointer flex-col rounded-xl border p-3 text-left text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink",
    active ? "border-ink bg-wash" : "hover:bg-wash",
  );

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** "2026-10-01" → "oct 2026" (para sugerir el nombre del programa). */
const monthYear = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

export function QuickStartForm({ today, fullHref, backHref }: { today: string; fullHref: string; backHref: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [templateKey, setTemplateKey] = useState<string>(TELCO_TEMPLATES[0].key);
  const [lineName, setLineName] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [months, setMonths] = useState<QuickDuration>(DEFAULT_QUICK_DURATION);
  const [useTelcoCalendar, setUseTelcoCalendar] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate);
  const end = validStart ? quickProgramEnd(startDate, months) : null;
  const isCustom = templateKey === CUSTOM_LINE_KEY;
  const lineLabel = isCustom ? lineName.trim() || "su línea" : (TELCO_TEMPLATES.find((t) => t.key === templateKey)?.name ?? "");

  function useExample() {
    const template = TELCO_TEMPLATES.find((t) => t.key === templateKey) ?? TELCO_TEMPLATES[0];
    const from = validStart ? monthYear(startDate) : "";
    const to = end ? monthYear(end) : "";
    setName(`Plan digital ${isCustom ? lineName.trim() || "WOM" : template.name}${from && to ? ` ${from} – ${to}` : ""}`);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setErrors({});
    startTransition(async () => {
      const r = await saveQuickStart({ name, templateKey, lineName: isCustom ? lineName : null, startDate, months, useTelcoCalendar });
      if (!r.ok) {
        setError(r.error);
        if (r.fieldErrors) setErrors(Object.fromEntries(Object.entries(r.fieldErrors).map(([k, m]) => [k, m[0]])));
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
      <div className="mb-4 flex justify-end">
        <UseExampleButton onClick={useExample} label="Sugiérame un nombre" />
      </div>
      <FormError message={error} className="mb-4" />
      <fieldset disabled={pending} className="space-y-6">
        <div className="space-y-1.5">
          <HelpLabel htmlFor="q-name" help={FIELD_HELP.programName} required>
            Nombre del programa
          </HelpLabel>
          <Input
            id="q-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Plan digital Pospago oct 2026 – mar 2027"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "q-name-error" : undefined}
          />
          {errors.name ? (
            <p id="q-name-error" className="text-sm">
              {errors.name}
            </p>
          ) : null}
        </div>

        <fieldset>
          <legend className="flex items-center gap-1 text-sm font-medium">
            Línea de negocio <span aria-hidden className="text-soft">*</span>
            <InfoTip label="Línea de negocio">{QUICK_FIELD_HELP.line}</InfoTip>
          </legend>
          <p className="mt-0.5 text-xs text-soft">Arranque con una. Las demás las agrega después en Configuración.</p>
          <div role="radiogroup" className="mt-2 grid gap-2 sm:grid-cols-2">
            {TELCO_TEMPLATES.map((t) => {
              const active = templateKey === t.key;
              return (
                <label key={t.key} className={cardClass(active)}>
                  <input type="radio" name="q-template" value={t.key} checked={active} onChange={() => setTemplateKey(t.key)} className="sr-only" />
                  <span className="flex items-center justify-between gap-2 font-semibold">
                    {t.name}
                    {active ? <Check className="size-4" aria-hidden /> : null}
                  </span>
                  <span className="mt-0.5 text-soft">{t.summary}</span>
                  <span className="mt-2 text-xs text-soft">
                    Métrica norte: <span className="text-ink">{t.northStar.name}</span>
                  </span>
                </label>
              );
            })}
            <label className={cn(cardClass(isCustom), "sm:col-span-2")}>
              <input type="radio" name="q-template" value={CUSTOM_LINE_KEY} checked={isCustom} onChange={() => setTemplateKey(CUSTOM_LINE_KEY)} className="sr-only" />
              <span className="flex items-center justify-between gap-2 font-semibold">
                <span className="flex items-center gap-1.5">
                  <Plus className="size-4" aria-hidden /> Otra línea
                </span>
                {isCustom ? <Check className="size-4" aria-hidden /> : null}
              </span>
              <span className="mt-0.5 text-soft">Una línea propia, con métricas genéricas de venta digital para arrancar.</span>
            </label>
          </div>
          {isCustom ? (
            <div className="mt-3 space-y-1.5">
              <HelpLabel htmlFor="q-line" required>
                Nombre de la línea
              </HelpLabel>
              <Input
                id="q-line"
                value={lineName}
                onChange={(e) => setLineName(e.target.value)}
                placeholder="Hogar fibra"
                aria-invalid={!!errors.lineName}
                autoFocus
              />
              {errors.lineName ? <p className="text-sm">{errors.lineName}</p> : null}
            </div>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <HelpLabel htmlFor="q-start" help={FIELD_HELP.programDates} required>
              Empieza
            </HelpLabel>
            <Input id="q-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-invalid={!!errors.startDate} />
            {errors.startDate ? <p className="text-sm">{errors.startDate}</p> : null}
          </div>
          <fieldset className="space-y-1.5">
            <legend className="flex items-center gap-1 text-sm font-medium">
              Duración
              <InfoTip label="Duración">{QUICK_FIELD_HELP.duration}</InfoTip>
            </legend>
            <div role="radiogroup" className="flex gap-2">
              {QUICK_DURATIONS.map((d) => (
                <label key={d} className={cn(cardClass(months === d), "flex-1 items-center py-2 font-medium")}>
                  <input type="radio" name="q-months" value={d} checked={months === d} onChange={() => setMonths(d)} className="sr-only" />
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

        <div className="rounded-xl bg-wash p-3 text-sm">
          <strong>Arriero le deja listo:</strong> el programa, {useTelcoCalendar ? "el calendario comercial, " : ""}los horizontes, la línea{" "}
          {lineLabel} con su métrica norte y de eficiencia, el árbol de métricas y el embudo. Después puede completar líneas base, metas y más
          líneas en Configuración.
        </div>
      </fieldset>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <Button variant="outline" asChild>
          <Link href={backHref}>
            <ArrowLeft aria-hidden /> Volver
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href={fullHref}>Prefiero la configuración completa</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner /> : null}
            Arme el programa {pending ? null : <ArrowRight aria-hidden />}
          </Button>
        </div>
      </div>
    </form>
  );
}
