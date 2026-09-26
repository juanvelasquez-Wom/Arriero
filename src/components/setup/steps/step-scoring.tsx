"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/app/form";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { formatScore } from "@/domain/format";
import { CONTROL_LABEL } from "@/domain/labels";
import { computeFinalScore, computeIce, controlPenalty } from "@/domain/scoring";
import type { ControlLevel, ScoringConfig } from "@/domain/types";
import { updateScoring } from "@/server/actions/programs";
import { FIELD_HELP } from "../help-content";
import { HelpLabel } from "../help";
import { StepFooter } from "../step-footer";

const ICE_HELP = {
  impact: "¿Cuánto movería la métrica si funciona? 10 = muchísimo.",
  confidence: "¿Qué tan seguros estamos, según la evidencia? 10 = casi seguro.",
  ease: "¿Qué tan fácil y rápido es de lanzar? 10 = se lanza mañana.",
};

export function StepScoring({
  programId,
  config,
  canEdit,
  prevHref,
  nextHref,
}: {
  programId: string;
  config: ScoringConfig;
  canEdit: boolean;
  prevHref: string;
  nextHref: string;
}) {
  const router = useRouter();
  const [ice, setIce] = useState({ impact: 8, confidence: 7, ease: 8 });
  const [fits, setFits] = useState(true);
  const [control, setControl] = useState<ControlLevel>("ours");
  const [cfg, setCfg] = useState(config);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const iceScore = computeIce(ice.impact, ice.confidence, ice.ease);
  const final = computeFinalScore(iceScore, fits, control, cfg);
  const changed = cfg.calendar_bonus !== config.calendar_bonus || cfg.shared_penalty !== config.shared_penalty || cfg.external_penalty !== config.external_penalty;

  function next() {
    if (!canEdit || !changed) {
      router.push(nextHref);
      return;
    }
    startTransition(async () => {
      const r = await updateScoring(programId, cfg, false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(nextHref);
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-paper shadow-card p-5">
        <h2 className="text-lg font-bold">Pruebe la calculadora</h2>
        <p className="mt-1 text-sm text-soft">Mueva los valores y vea cómo quedaría un ejercicio en el backlog. Aquí no se guarda nada, así que hágale sin miedo.</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          {(["impact", "confidence", "ease"] as const).map((k) => (
            <div key={k} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <HelpLabel help={ICE_HELP[k]}>{k === "impact" ? "Impacto" : k === "confidence" ? "Confianza" : "Facilidad"}</HelpLabel>
                <span className="text-lg font-semibold tabular-nums">{ice[k]}</span>
              </div>
              <Slider min={1} max={10} step={1} value={[ice[k]]} onValueChange={([v]) => setIce({ ...ice, [k]: v })} aria-label={k === "impact" ? "Impacto" : k === "confidence" ? "Confianza" : "Facilidad"} />
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Switch id="calc-fits" checked={fits} onCheckedChange={setFits} />
            <HelpLabel htmlFor="calc-fits" help={FIELD_HELP.calendarBonus}>
              Se puede leer antes de los picos
            </HelpLabel>
          </div>
          <div className="space-y-1">
            <Label htmlFor="calc-control">¿Depende de nosotros?</Label>
            <Select value={control} onValueChange={(v) => setControl(v as ControlLevel)}>
              <SelectTrigger id="calc-control" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["ours", "shared", "external"] as const).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CONTROL_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-6 rounded-lg border-l-4 border-l-highlight bg-wash px-4 py-3" aria-live="polite">
          <div>
            <div className="text-xs text-soft">ICE (promedio)</div>
            <div className="text-xl font-semibold tabular-nums">{formatScore(iceScore)}</div>
          </div>
          <div className="text-sm tabular-nums">
            {fits ? `+ ${formatScore(cfg.calendar_bonus)} calendario` : "+ 0 calendario"} · − {formatScore(controlPenalty(control, cfg))} control
          </div>
          <div>
            <div className="text-xs text-soft">Puntaje final</div>
            <div className="text-2xl font-semibold tabular-nums">{formatScore(final)}</div>
          </div>
        </div>
      </div>

      <Collapsible className="rounded-2xl border bg-paper shadow-card">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium">
          Opciones avanzadas: cambiar el bono y las penalidades <ChevronDown className="size-4" aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-5 pb-5">
          <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["calendar_bonus", "Bono de calendario", FIELD_HELP.calendarBonus],
                ["shared_penalty", "Penalidad control compartido", FIELD_HELP.sharedPenalty],
                ["external_penalty", "Penalidad control externo", FIELD_HELP.externalPenalty],
              ] as const
            ).map(([k, label, help]) => (
              <div key={k} className="space-y-1">
                <HelpLabel htmlFor={`cfg-${k}`} help={help}>
                  {label}
                </HelpLabel>
                <Input id={`cfg-${k}`} type="number" step="0.5" min={0} max={10} value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value) || 0 })} />
              </div>
            ))}
          </fieldset>
          <p className="mt-2 text-xs text-soft">Valores por defecto del modelo: +1, −1 y −3.</p>
        </CollapsibleContent>
      </Collapsible>

      <FormError message={error} />
      <StepFooter prevHref={prevHref} pending={pending} onNext={next} />
    </div>
  );
}
