"use client";

import { CalendarClock, Flag, Plus, Snowflake, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/app/form";
import { Callout } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { rangesOverlap } from "@/domain/dates";
import { formatDate, formatDateRange } from "@/domain/format";
import { horizonProblems, proposeHorizons, suggestFreeze } from "@/domain/growth-templates";
import { typicalTelcoCalendar } from "@/domain/quick-start";
import type { CalendarEventType } from "@/domain/types";
import { saveScheduleStep } from "@/server/actions/setup";
import { FIELD_HELP } from "../help-content";
import { HelpLabel, InfoTip, UseExampleButton } from "../help";
import { StepFooter } from "../step-footer";
import { HorizonsSection, type HorizonDraft } from "./step-horizons";

interface Range {
  id?: string;
  start: string;
  end: string;
}
interface Peak extends Range {
  key: string;
  name: string;
  freeze: Range | null;
}
interface EventLike {
  id?: string;
  type: CalendarEventType;
  name: string;
  start_date: string;
  end_date: string;
}

let seq = 0;
const key = () => `k${++seq}`;

function fromEvents(events: EventLike[]) {
  const peaks: Peak[] = events
    .filter((e) => e.type === "peak")
    .map((e) => ({ key: key(), id: e.id, name: e.name, start: e.start_date, end: e.end_date, freeze: null }));
  const extras: (Range & { key: string; name: string })[] = [];
  for (const f of events.filter((e) => e.type === "freeze")) {
    const peak = peaks.find((p) => !p.freeze && rangesOverlap(p.start, p.end, f.start_date, f.end_date));
    if (peak) peak.freeze = { id: f.id, start: f.start_date, end: f.end_date };
    else extras.push({ key: key(), id: f.id, name: f.name, start: f.start_date, end: f.end_date });
  }
  const d = events.find((e) => e.type === "decision");
  return { peaks, extras, decision: d ? { id: d.id, date: d.start_date } : { date: "" } };
}

const sameHorizons = (a: HorizonDraft[], b: HorizonDraft[]) =>
  a.length === b.length && a.every((h, i) => h.name === b[i].name && h.start_date === b[i].start_date && h.end_date === b[i].end_date);

/** Enter en un campo auxiliar ejecuta su propia acción, no el "Guarde y siga" del paso. */
const onEnter = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter") {
    e.preventDefault();
    fn();
  }
};

/**
 * Paso "Calendario y horizontes": picos con su congelamiento, punto de decisión
 * y, abajo, los horizontes propuestos desde ese punto. Un programa nuevo arranca
 * con el calendario típico de telco ya puesto.
 */
export function StepCalendar({
  programId,
  program,
  events,
  horizons,
  suggestTypical,
  prevHref,
  nextHref,
  readOnly,
  canEditHorizons,
}: {
  programId: string;
  program: { start_date: string; end_date: string };
  events: EventLike[];
  horizons: HorizonDraft[];
  /** Programa sin calendario todavía: se propone el típico de telco. */
  suggestTypical: boolean;
  prevHref: string;
  nextHref: string;
  readOnly?: boolean;
  canEditHorizons: boolean;
}) {
  const router = useRouter();
  const [initial] = useState(() => fromEvents(suggestTypical ? typicalTelcoCalendar(program.start_date, program.end_date) : events));
  const [suggested, setSuggested] = useState(suggestTypical);
  const [peaks, setPeaks] = useState<Peak[]>(initial.peaks);
  const [extras, setExtras] = useState(initial.extras);
  const [decision, setDecision] = useState<{ id?: string; date: string }>(initial.decision);
  const [draft, setDraft] = useState({ name: "", start: "", end: "", withFreeze: true, before: 4, after: 6 });
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const originalIds = events.map((e) => e.id).filter((id): id is string => !!id);

  // Horizontes: siguen al punto de decisión mientras no se ajusten a mano.
  const propose = (date: string) =>
    proposeHorizons(program.start_date, program.end_date, date || null).map((p, i) => ({ ...p, id: horizons[i]?.id }));
  const [custom, setCustom] = useState<HorizonDraft[] | null>(() =>
    horizons.length && !sameHorizons(horizons, proposeHorizons(program.start_date, program.end_date, initial.decision.date || null)) ? horizons : null,
  );
  const horizonRows = custom ?? propose(decision.date);
  const problems = horizonProblems({ start: program.start_date, end: program.end_date }, horizonRows);

  const draftFreeze =
    draft.start && draft.end && draft.end >= draft.start ? suggestFreeze({ start_date: draft.start, end_date: draft.end }, draft.before, draft.after) : null;

  function addPeak() {
    if (draft.name.trim().length < 2 || !draft.start || !draft.end || draft.end < draft.start) {
      setError("Escriba el nombre del pico y sus fechas (el fin no puede ir antes del inicio). Ese camino no era.");
      return;
    }
    setError(undefined);
    setPeaks((p) => [
      ...p,
      {
        key: key(),
        name: draft.name.trim(),
        start: draft.start,
        end: draft.end,
        freeze: draft.withFreeze && draftFreeze ? { start: draftFreeze.start_date, end: draftFreeze.end_date } : null,
      },
    ]);
    setDraft({ ...draft, name: "", start: "", end: "" });
  }

  function applyTypical() {
    const t = fromEvents(typicalTelcoCalendar(program.start_date, program.end_date));
    setPeaks(t.peaks);
    setExtras([]);
    setDecision((d) => ({ ...d, date: t.decision.date }));
  }

  function clearAll() {
    setPeaks([]);
    setExtras([]);
    setDecision((d) => ({ ...d, date: "" }));
    setSuggested(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) {
      router.push(nextHref);
      return;
    }
    setError(undefined);
    const payload = [
      ...peaks.flatMap((p) => [
        { id: p.id, type: "peak" as const, name: p.name, start_date: p.start, end_date: p.end },
        ...(p.freeze ? [{ id: p.freeze.id, type: "freeze" as const, name: `Congelamiento ${p.name}`, start_date: p.freeze.start, end_date: p.freeze.end }] : []),
      ]),
      ...extras.map((f) => ({ id: f.id, type: "freeze" as const, name: f.name, start_date: f.start, end_date: f.end })),
      ...(decision.date ? [{ id: decision.id, type: "decision" as const, name: "Punto de decisión", start_date: decision.date, end_date: decision.date }] : []),
    ];
    const kept = new Set(payload.map((ev) => ev.id).filter(Boolean));
    const removedIds = originalIds.filter((id) => !kept.has(id));
    startTransition(async () => {
      const r = await saveScheduleStep(programId, {
        calendar: { events: payload, removedIds },
        horizons: canEditHorizons ? { horizons: horizonRows } : null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(nextHref);
    });
  }

  const outside = (d: string) => d && (d < program.start_date || d > program.end_date);

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {suggested && !readOnly ? (
        <Callout tone="neutral">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="size-4" aria-hidden /> Le dejamos puesto el calendario típico de telco para sus fechas. Quite lo que no aplique y
              siga.
            </span>
            <button type="button" className="text-sm underline underline-offset-4" onClick={clearAll}>
              Prefiero empezar vacío
            </button>
          </span>
        </Callout>
      ) : null}

      <div className="rounded-2xl border bg-paper p-5 shadow-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <CalendarClock className="size-4" aria-hidden /> Picos comerciales
            <InfoTip label="Pico comercial">{FIELD_HELP.peak}</InfoTip>
          </h2>
          {!readOnly && !suggested ? <UseExampleButton onClick={applyTypical} label="Usar el calendario típico de telco" /> : null}
        </div>

        {peaks.length ? (
          <ul className="stagger mb-4 space-y-2">
            {peaks.map((p) => (
              <li key={p.key} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-sm text-soft">{formatDateRange(p.start, p.end)}</span>
                  <span className="flex-1" />
                  {!readOnly ? (
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar ${p.name}`} onClick={() => setPeaks((x) => x.filter((y) => y.key !== p.key))}>
                      <Trash2 aria-hidden />
                    </Button>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <Snowflake className="size-4" aria-hidden />
                  {p.freeze ? (
                    <>
                      <span>Congelamiento</span>
                      <Input
                        type="date"
                        aria-label={`Inicio del congelamiento de ${p.name}`}
                        className="h-7 w-40"
                        value={p.freeze.start}
                        disabled={readOnly}
                        onChange={(e) => setPeaks((x) => x.map((y) => (y.key === p.key ? { ...y, freeze: { ...y.freeze!, start: e.target.value } } : y)))}
                      />
                      <span>a</span>
                      <Input
                        type="date"
                        aria-label={`Fin del congelamiento de ${p.name}`}
                        className="h-7 w-40"
                        value={p.freeze.end}
                        disabled={readOnly}
                        onChange={(e) => setPeaks((x) => x.map((y) => (y.key === p.key ? { ...y, freeze: { ...y.freeze!, end: e.target.value } } : y)))}
                      />
                      {!readOnly ? (
                        <Button type="button" size="xs" variant="ghost" onClick={() => setPeaks((x) => x.map((y) => (y.key === p.key ? { ...y, freeze: null } : y)))}>
                          Sin congelamiento
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <span className="text-soft">Sin congelamiento.</span>
                      {!readOnly ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            const f = suggestFreeze({ start_date: p.start, end_date: p.end });
                            setPeaks((x) => x.map((y) => (y.key === p.key ? { ...y, freeze: { start: f.start_date, end: f.end_date } } : y)));
                          }}
                        >
                          Proponer congelamiento
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-soft">
            Todavía no hay picos. Agregue las fechas en que más vende: en esos días no se lanzan pruebas, ahí es a vender. Si no tiene picos en
            este periodo, siga sin afán.
          </p>
        )}

        {!readOnly ? (
          <div className="rounded-lg border border-dashed p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_150px_150px]">
              <div className="space-y-1">
                <label htmlFor="pk-name" className="text-xs text-soft">
                  Nombre del pico
                </label>
                <Input
                  id="pk-name"
                  value={draft.name}
                  placeholder="Día de la madre"
                  onKeyDown={onEnter(addPeak)}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="pk-start" className="text-xs text-soft">
                  Desde
                </label>
                <Input
                  id="pk-start"
                  type="date"
                  value={draft.start}
                  onKeyDown={onEnter(addPeak)}
                  onChange={(e) => setDraft({ ...draft, start: e.target.value, end: draft.end || e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="pk-end" className="text-xs text-soft">
                  Hasta
                </label>
                <Input id="pk-end" type="date" value={draft.end} onKeyDown={onEnter(addPeak)} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <Switch id="pk-freeze" checked={draft.withFreeze} onCheckedChange={(c) => setDraft({ ...draft, withFreeze: c })} />
              <label htmlFor="pk-freeze">Congelar</label>
              {draft.withFreeze ? (
                <>
                  <Input
                    aria-label="Días antes"
                    type="number"
                    min={0}
                    max={30}
                    className="h-7 w-16"
                    value={draft.before}
                    onKeyDown={onEnter(addPeak)}
                    onChange={(e) => setDraft({ ...draft, before: Number(e.target.value) || 0 })}
                  />
                  <span>días antes y</span>
                  <Input
                    aria-label="Días después"
                    type="number"
                    min={0}
                    max={30}
                    className="h-7 w-16"
                    value={draft.after}
                    onKeyDown={onEnter(addPeak)}
                    onChange={(e) => setDraft({ ...draft, after: Number(e.target.value) || 0 })}
                  />
                  <span>días después</span>
                  <InfoTip label="Congelamiento">{FIELD_HELP.freeze}</InfoTip>
                  {draftFreeze ? <span className="text-soft">→ {formatDateRange(draftFreeze.start_date, draftFreeze.end_date)}</span> : null}
                </>
              ) : null}
            </div>
            <Button type="button" className="mt-3" size="sm" variant="outline" onClick={addPeak}>
              <Plus aria-hidden /> Agregar pico
            </Button>
          </div>
        ) : null}

        {extras.length ? (
          <div className="mt-4">
            <h3 className="text-sm font-medium">Otros congelamientos</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {extras.map((f) => (
                <li key={f.key} className="flex items-center gap-2">
                  <Snowflake className="size-4" aria-hidden /> {f.name} · {formatDateRange(f.start, f.end)}
                  {!readOnly ? (
                    <Button type="button" size="icon-xs" variant="ghost" aria-label={`Quitar ${f.name}`} onClick={() => setExtras((x) => x.filter((y) => y.key !== f.key))}>
                      <Trash2 aria-hidden />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border bg-paper p-5 shadow-card">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <Flag className="size-4" aria-hidden /> Punto de decisión
        </h2>
        <div className="max-w-xs space-y-1.5">
          <HelpLabel htmlFor="decision" help={FIELD_HELP.decision}>
            Fecha
          </HelpLabel>
          <Input
            id="decision"
            type="date"
            value={decision.date}
            disabled={readOnly}
            onChange={(e) => setDecision({ ...decision, date: e.target.value })}
            aria-invalid={!!outside(decision.date)}
            aria-describedby="decision-note"
          />
        </div>
        <div id="decision-note">
          {decision.date ? (
            <p className="mt-2 text-sm text-soft">El {formatDate(decision.date)} se revisa qué funcionó y se decide qué escalar.</p>
          ) : (
            <Callout tone="neutral" className="mt-3">
              Se lo recomendamos: sin punto de decisión, el programa tendrá un solo horizonte y no habrá un momento formal para decidir qué escalar.
            </Callout>
          )}
          {outside(decision.date) ? <p className="mt-2 text-sm font-medium">La fecha está fuera del periodo del programa.</p> : null}
          {decision.date && peaks.some((p) => decision.date >= p.start && decision.date <= p.end) ? (
            <p className="mt-2 text-sm font-medium">¡Ave María! El punto de decisión cae dentro de un pico. Mejor páselo a una fecha más tranquila.</p>
          ) : null}
        </div>
      </div>

      <HorizonsSection
        program={program}
        decisionDate={decision.date || null}
        rows={horizonRows}
        auto={custom === null}
        onChange={setCustom}
        onReset={() => setCustom(null)}
        problems={canEditHorizons ? problems : []}
        readOnly={readOnly || !canEditHorizons}
      />

      <FormError message={error} />
      <StepFooter prevHref={prevHref} pending={pending} disabled={!readOnly && canEditHorizons && problems.length > 0} />
    </form>
  );
}
