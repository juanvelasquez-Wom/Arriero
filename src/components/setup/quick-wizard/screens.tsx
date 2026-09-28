"use client";

// Pantallas del arranque rápido: una pregunta por pantalla. Solo presentan; el
// estado y la validación viven en QuickWizard.
import { CalendarCheck, CalendarOff, CalendarX2, Check, Flag, Mountain, Plus, Sparkles } from "lucide-react";
import { ChoiceCard } from "@/components/app/step-wizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatDateRange } from "@/domain/format";
import { TELCO_TEMPLATES } from "@/domain/growth-templates";
import { QUICK_DURATIONS, type PlannedEvent, type QuickDuration } from "@/domain/quick-start";
import { cn } from "@/lib/utils";

const Tick = ({ on }: { on: boolean }) => (
  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border", on && "border-ink bg-ink text-paper")} aria-hidden>
    {on ? <Check className="pop-in size-4" strokeWidth={3} /> : null}
  </span>
);

const FieldError = ({ id, message }: { id: string; message?: string }) =>
  message ? (
    <p id={id} className="mt-2 text-sm font-medium" role="alert">
      {message}
    </p>
  ) : null;

// -----------------------------------------------------------------------------
// 1 · Nombre
// -----------------------------------------------------------------------------

export function NameScreen({
  name,
  onName,
  suggestion,
  error,
}: {
  name: string;
  onName: (v: string) => void;
  suggestion: string;
  error?: string;
}) {
  return (
    <div className="space-y-3">
      <Label htmlFor="q-name" className="text-sm font-medium">
        Nombre del programa
      </Label>
      <Input
        id="q-name"
        autoFocus
        data-autofocus
        value={name}
        onChange={(e) => onName(e.target.value)}
        placeholder={suggestion}
        className="h-12 text-base"
        aria-invalid={!!error}
        aria-describedby={error ? "q-name-error" : "q-name-hint"}
      />
      {error ? (
        <FieldError id="q-name-error" message={error} />
      ) : (
        <p id="q-name-hint" className="text-sm text-soft">
          Si lo deja vacío, le ponemos uno según las líneas y las fechas que elija.
        </p>
      )}
      {name.trim() !== suggestion ? (
        <Button type="button" variant="outline" size="sm" className="min-h-9" onClick={() => onName(suggestion)}>
          <Sparkles aria-hidden /> Usar la sugerencia
        </Button>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// 2 · Líneas
// -----------------------------------------------------------------------------

export function LinesScreen({
  selected,
  onToggle,
  customOn,
  onCustom,
  lineName,
  onLineName,
  errors,
}: {
  selected: string[];
  onToggle: (key: string) => void;
  customOn: boolean;
  onCustom: () => void;
  lineName: string;
  onLineName: (v: string) => void;
  errors: { lines?: string; lineName?: string };
}) {
  return (
    <fieldset aria-describedby={errors.lines ? "q-lines-error" : undefined}>
      <legend className="sr-only">Líneas de negocio</legend>
      <div className="stagger grid gap-3 sm:grid-cols-2">
        {TELCO_TEMPLATES.map((t, i) => {
          const active = selected.includes(t.key);
          return (
            <label key={t.key}>
              <input
                type="checkbox"
                aria-label={t.name}
                checked={active}
                onChange={() => onToggle(t.key)}
                className="sr-only"
                data-autofocus={i === 0 ? true : undefined}
              />
              <ChoiceCard active={active}>
                <span className="flex items-center justify-between gap-2 text-base font-semibold">
                  {t.name}
                  <Tick on={active} />
                </span>
                <span className="mt-1 text-soft">{t.summary}</span>
                <span className="mt-auto pt-3 text-xs text-soft">
                  Métrica norte: <span className="text-ink">{t.northStar.name}</span>
                </span>
              </ChoiceCard>
            </label>
          );
        })}
        <label className="sm:col-span-2">
          <input type="checkbox" aria-label="Otra línea" checked={customOn} onChange={onCustom} className="sr-only" />
          <ChoiceCard active={customOn}>
            <span className="flex items-center justify-between gap-2 text-base font-semibold">
              <span className="flex items-center gap-1.5">
                <Plus className="size-4" aria-hidden /> Otra línea
              </span>
              <Tick on={customOn} />
            </span>
            <span className="mt-1 text-soft">Una línea propia, con métricas genéricas de venta digital para arrancar.</span>
          </ChoiceCard>
        </label>
      </div>
      <FieldError id="q-lines-error" message={errors.lines} />
      {customOn ? (
        <div className="slide-in mt-4 space-y-1.5">
          <Label htmlFor="q-line">
            ¿Cómo se llama esa línea? <span aria-hidden className="text-soft">*</span>
          </Label>
          <Input
            id="q-line"
            value={lineName}
            onChange={(e) => onLineName(e.target.value)}
            placeholder="Hogar fibra"
            className="h-11"
            aria-invalid={!!errors.lineName}
            aria-describedby={errors.lineName ? "q-line-error" : undefined}
          />
          <FieldError id="q-line-error" message={errors.lineName} />
        </div>
      ) : null}
    </fieldset>
  );
}

// -----------------------------------------------------------------------------
// 3 · Fechas
// -----------------------------------------------------------------------------

export function DatesScreen({
  startDate,
  onStart,
  months,
  onMonths,
  end,
  error,
}: {
  startDate: string;
  onStart: (v: string) => void;
  months: QuickDuration;
  onMonths: (m: QuickDuration) => void;
  end: string | null;
  error?: string;
}) {
  return (
    <div className="space-y-6">
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="q-start">Arranca el</Label>
        <Input
          id="q-start"
          type="date"
          data-autofocus
          value={startDate}
          onChange={(e) => onStart(e.target.value)}
          className="h-11"
          aria-invalid={!!error}
          aria-describedby={error ? "q-start-error" : undefined}
        />
        <FieldError id="q-start-error" message={error} />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Y dura</legend>
        <div role="radiogroup" className="grid grid-cols-3 gap-3">
          {QUICK_DURATIONS.map((d) => (
            <label key={d}>
              <input type="radio" name="q-months" aria-label={`${d} meses`} value={d} checked={months === d} onChange={() => onMonths(d)} className="sr-only" />
              <ChoiceCard active={months === d} className="items-center py-5 text-center">
                <span className="font-heading text-3xl font-extrabold tabular-nums">{d}</span>
                <span className="text-soft">meses</span>
                {d === 6 ? <span className="mt-1 text-xs text-soft">Lo más común</span> : null}
              </ChoiceCard>
            </label>
          ))}
        </div>
      </fieldset>
      {end ? (
        <p className="rounded-xl bg-wash px-4 py-3 text-sm" aria-live="polite">
          Va del <strong>{formatDate(startDate)}</strong> al <strong>{formatDate(end)}</strong>.
        </p>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// 4 · Calendario
// -----------------------------------------------------------------------------

const EVENT_ICON = { peak: Mountain, freeze: CalendarX2, decision: Flag } as const;
const EVENT_KIND = { peak: "Pico", freeze: "Congelamiento", decision: "Decisión" } as const;

export function CalendarScreen({
  useTelco,
  onUseTelco,
  events,
}: {
  useTelco: boolean;
  onUseTelco: (v: boolean) => void;
  /** Lo que traería el calendario típico en estas fechas. */
  events: PlannedEvent[];
}) {
  const preview = events.slice(0, 6);
  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Calendario típico de telco" className="grid gap-3 sm:grid-cols-2">
        <label>
          <input
            type="radio"
            name="q-calendar"
            aria-label="Sí, con el calendario típico de telco"
            checked={useTelco}
            onChange={() => onUseTelco(true)}
            className="sr-only"
            data-autofocus
          />
          <ChoiceCard active={useTelco}>
            <span className="flex items-center justify-between gap-2 text-base font-semibold">
              <span className="flex items-center gap-2">
                <CalendarCheck className="size-5" aria-hidden /> Sí, úselo
              </span>
              <Tick on={useTelco} />
            </span>
            <span className="mt-1 text-soft">Picos, congelamientos y un punto de decisión, ya puestos.</span>
          </ChoiceCard>
        </label>
        <label>
          <input
            type="radio"
            name="q-calendar"
            aria-label="No, sin calendario comercial"
            checked={!useTelco}
            onChange={() => onUseTelco(false)}
            className="sr-only"
          />
          <ChoiceCard active={!useTelco}>
            <span className="flex items-center justify-between gap-2 text-base font-semibold">
              <span className="flex items-center gap-2">
                <CalendarOff className="size-5" aria-hidden /> No, sin calendario
              </span>
              <Tick on={!useTelco} />
            </span>
            <span className="mt-1 text-soft">Un solo horizonte para todo el periodo. Los picos los pone después.</span>
          </ChoiceCard>
        </label>
      </div>

      {useTelco ? (
        <div className="slide-in rounded-2xl border bg-wash p-4" aria-live="polite">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-soft">Así se ve en sus fechas</div>
          {preview.length ? (
            <ul className="space-y-1.5 text-sm">
              {preview.map((e) => {
                const Icon = EVENT_ICON[e.type];
                return (
                  <li key={`${e.type}-${e.name}`} className="flex items-start gap-2">
                    <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn("font-medium", e.type === "decision" && "rounded bg-highlight px-1 text-[#1f1f1f]")}>{EVENT_KIND[e.type]}</span>
                      <span className="text-soft"> · {e.name.replace(/^Congelamiento /, "")}</span>
                    </span>
                    <span className="shrink-0 text-xs text-soft tabular-nums">
                      {e.start_date === e.end_date ? formatDate(e.start_date) : formatDateRange(e.start_date, e.end_date)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-soft">En estas fechas no cae ningún pico típico. Igual le dejamos el horizonte listo.</p>
          )}
          {events.length > preview.length ? <p className="mt-2 text-xs text-soft">Y {events.length - preview.length} más.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// 5 · Resumen
// -----------------------------------------------------------------------------

export interface QuickSummary {
  name: string;
  period: string;
  lineNames: string[];
  metricsCount: number;
  calendar: string;
}

export function SummaryScreen({ summary, onEdit }: { summary: QuickSummary; onEdit: (step: "nombre" | "lineas" | "fechas" | "calendario") => void }) {
  const rows: { key: "nombre" | "lineas" | "fechas" | "calendario"; label: string; value: React.ReactNode }[] = [
    { key: "nombre", label: "Nombre", value: summary.name },
    {
      key: "lineas",
      label: summary.lineNames.length === 1 ? "Línea" : "Líneas",
      value: (
        <>
          {summary.lineNames.join(", ")}
          <span className="block text-xs text-soft">
            Cada una con su métrica norte, eficiencia y embudo de 4 etapas ({summary.metricsCount} métricas de entrada en total).
          </span>
        </>
      ),
    },
    { key: "fechas", label: "Periodo", value: summary.period },
    { key: "calendario", label: "Calendario", value: summary.calendar },
  ];
  return (
    <div className="space-y-4">
      <dl className="stagger divide-y rounded-2xl border bg-paper">
        {rows.map((r) => (
          <div key={r.key} className="flex items-start gap-3 px-4 py-3">
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <dt className="text-xs font-semibold uppercase tracking-wide text-soft">{r.label}</dt>
              <dd className="mt-0.5 text-[15px]">{r.value}</dd>
            </div>
            <Button type="button" variant="ghost" size="sm" className="min-h-9 shrink-0" onClick={() => onEdit(r.key)}>
              Cambiar<span className="sr-only"> {r.label.toLowerCase()}</span>
            </Button>
          </div>
        ))}
      </dl>
      <p className="text-sm text-soft">Líneas base, metas, equipo y más líneas los completa después en Configuración. Nada queda escrito en piedra.</p>
    </div>
  );
}
