"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/app/form";
import { Term } from "@/components/app/info-tip";
import { Callout } from "@/components/app/page";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { calendarFitMessage, type CalendarFit } from "@/domain/experiment-inference";
import { formatScore } from "@/domain/format";
import { suggestIce } from "@/domain/ice-assist";
import { CONTROL_LABEL } from "@/domain/labels";
import { controlPenalty } from "@/domain/scoring";
import { CONTROL_LEVELS, type ControlLevel, type ImpactLevel } from "@/domain/types";
import { IceAssistHint } from "../ice-assist-hint";
import type { WizardData, WizardValues } from "../wizard-values";
import type { SetField, SetValues } from "./shared";
import { TiaIceHelp } from "./tia-help";

/** Paso 3 · Priorización: ICE (con la sugerencia de Arriero) y filtros. */
export function StepPriority({
  data,
  v,
  set,
  setV,
  fit,
  fitsCalendar,
  ice,
  final,
  controlTouched,
  onControlTouched,
  draftText,
  experimentId,
}: {
  data: WizardData;
  v: WizardValues;
  set: SetField;
  setV: SetValues;
  fit: CalendarFit;
  fitsCalendar: boolean;
  ice: number | null;
  final: number | null;
  controlTouched: boolean;
  onControlTouched: () => void;
  draftText: string;
  experimentId?: string;
}) {
  const problem = data.problems.find((p) => p.id === v.problem_id);
  const metric = data.metrics.find((m) => m.id === v.metric_id);
  const suggestion = useMemo(
    () =>
      suggestIce({
        expectedEffectPct: v.expected_effect_pct,
        metric: metric
          ? {
              unit: metric.unit ?? null,
              baseline: metric.baseline ?? null,
              latest_value: metric.latest_value ?? null,
              unit_value: metric.unit_value ?? null,
              direction: metric.direction,
            }
          : null,
        peerMonthlyValues: (data.peerValues ?? []).filter((p) => p.id !== experimentId).map((p) => p.monthly),
        problem: problem
          ? {
              status: problem.status,
              evidence: problem.evidence ?? null,
              attachments: problem.attachments ?? 0,
              impact: (problem.impact as ImpactLevel | null | undefined) ?? null,
            }
          : null,
        draftText,
        learnings: data.similar.learnings.filter((l) => l.experiment_id !== experimentId),
      }),
    [v.expected_effect_pct, metric, data.peerValues, data.similar.learnings, problem, draftText, experimentId],
  );

  return (
    <div className="space-y-6">
      {!data.canScore ? (
        <Callout tone="neutral" title="La priorización la hace el equipo interno">
          La agencia no califica ICE. Un colaborador u owner completará este paso.
        </Callout>
      ) : (
        <>
          <IceAssistHint
            suggestion={suggestion}
            onUse={() => {
              setV((prev) => ({
                ...prev,
                impact: suggestion.impact ?? prev.impact,
                confidence: suggestion.confidence ?? prev.confidence,
              }));
              toast.success("Sugerencia puesta en los controles", { description: "Muévalos si no está de acuerdo: la calificación es suya." });
            }}
          />
          <TiaIceHelp programId={data.programId} v={v} setV={setV} />
        </>
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
              ? "Viene de la oportunidad de mejora. ¿Depende de nosotros o de terceros?"
              : "¿Depende de nosotros o de terceros?"
          }
        >
          <Select
            value={v.control}
            onValueChange={(c) => {
              onControlTouched();
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
  );
}
