"use client";

import { ChevronDown, Lightbulb } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  INSIGHT_EXAMPLES,
  INSIGHT_SOURCES,
  INSIGHT_STAGE_LABEL,
  parseTags,
  TITLE_MAX,
  type InsightSource,
  type InsightStage,
} from "@/domain/insights";
import { cn } from "@/lib/utils";
import { createInsight, updateInsight } from "@/server/actions/insights";

export interface InsightFormValues {
  title: string;
  detail: string;
  source: InsightSource;
  source_ref: string;
  line_hint: string;
  stage: InsightStage | null;
  channel: string;
  tags: string;
}

export const EMPTY_INSIGHT: InsightFormValues = {
  title: "",
  detail: "",
  source: "data",
  source_ref: "",
  line_hint: "",
  stage: null,
  channel: "",
  tags: "",
};

const LINE_CHIPS = ["Pospago", "Prepago", "Recargas y paquetes", "Portabilidad", "Equipos", "Hogar"];

/**
 * Formulario del insight. Lo único obligatorio es la frase; la fuente se elige
 * con un clic y lo demás va plegado. Ctrl+Enter guarda.
 */
export function InsightForm({
  insightId,
  initial = EMPTY_INSIGHT,
  exampleKey = 0,
  autoFocus = true,
  onDone,
}: {
  insightId?: string;
  initial?: InsightFormValues;
  exampleKey?: number;
  autoFocus?: boolean;
  onDone?: (id: string) => void;
}) {
  const router = useRouter();
  const ids = useId();
  const [v, setV] = useState<InsightFormValues>(initial);
  const [more, setMore] = useState(!!(initial.detail || initial.line_hint || initial.stage || initial.channel || initial.tags || initial.source_ref));
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const set = <K extends keyof InsightFormValues>(k: K, val: InsightFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const example = INSIGHT_EXAMPLES[Math.abs(exampleKey) % INSIGHT_EXAMPLES.length];

  function submit() {
    setError(undefined);
    start(async () => {
      const input = {
        title: v.title,
        detail: v.detail,
        source: v.source,
        source_ref: v.source_ref,
        line_hint: v.line_hint,
        stage: v.stage,
        channel: v.channel,
        tags: parseTags(v.tags),
      };
      const r = insightId ? await updateInsight(insightId, input) : await createInsight(input);
      if (!r.ok) {
        setError(r.fieldErrors ? Object.values(r.fieldErrors)[0]?.[0] ?? r.error : r.error);
        return;
      }
      toast.success(r.message);
      const id = insightId ?? (r.data as { id: string }).id;
      if (!insightId) setV(EMPTY_INSIGHT);
      router.refresh();
      onDone?.(id);
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div>
        <label htmlFor={`${ids}-title`} className="text-sm font-semibold">
          ¿De qué se dio cuenta?
        </label>
        <Textarea
          id={`${ids}-title`}
          value={v.title}
          maxLength={TITLE_MAX}
          autoFocus={autoFocus}
          rows={2}
          placeholder={`Ej.: ${example}`}
          onChange={(e) => set("title", e.target.value)}
          className="mt-1.5 resize-none text-base"
        />
        <div className="mt-1 flex justify-between text-xs text-soft">
          <span>Una idea, en una frase. Como se lo contaría a alguien en el tinto.</span>
          <span className="tabular-nums">
            {v.title.length}/{TITLE_MAX}
          </span>
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold">¿De dónde sale?</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup">
          {INSIGHT_SOURCES.map((s) => (
            <button
              key={s.key}
              type="button"
              role="radio"
              aria-checked={v.source === s.key}
              title={s.hint}
              onClick={() => set("source", s.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                v.source === s.key ? "border-transparent bg-highlight font-semibold text-[#111111]" : "hover:bg-wash",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-soft">{INSIGHT_SOURCES.find((s) => s.key === v.source)?.hint}</p>
      </fieldset>

      <button
        type="button"
        onClick={() => setMore((m) => !m)}
        aria-expanded={more}
        className="inline-flex items-center gap-1 text-sm font-medium text-soft hover:text-ink"
      >
        <ChevronDown aria-hidden className={cn("size-4 transition-transform", more && "rotate-180")} />
        {more ? "Menos detalles" : "Agregar evidencia, línea o etiquetas (opcional)"}
      </button>

      {more ? (
        <div className="slide-in space-y-4">
          <div>
            <label htmlFor={`${ids}-detail`} className="text-sm font-semibold">
              Evidencia o contexto
            </label>
            <Textarea
              id={`${ids}-detail`}
              value={v.detail}
              rows={3}
              maxLength={4000}
              placeholder="Qué vio, cuántas veces, dónde. Un número vale más que mil adjetivos."
              onChange={(e) => set("detail", e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <label htmlFor={`${ids}-ref`} className="text-sm font-semibold">
              Enlace o referencia
            </label>
            <Input
              id={`${ids}-ref`}
              value={v.source_ref}
              maxLength={500}
              placeholder="El reporte, el tablero, la conversación…"
              onChange={(e) => set("source_ref", e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <div className="text-sm font-semibold">Línea de negocio</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {LINE_CHIPS.map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={v.line_hint === l}
                  onClick={() => set("line_hint", v.line_hint === l ? "" : l)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm",
                    v.line_hint === l ? "border-transparent bg-ink font-semibold text-paper" : "hover:bg-wash",
                  )}
                >
                  {l}
                </button>
              ))}
              <Input
                aria-label="Otra línea"
                value={LINE_CHIPS.includes(v.line_hint) ? "" : v.line_hint}
                maxLength={80}
                placeholder="Otra…"
                onChange={(e) => set("line_hint", e.target.value)}
                className="h-8 w-32"
              />
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold">Etapa del embudo</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(Object.keys(INSIGHT_STAGE_LABEL) as InsightStage[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  aria-pressed={v.stage === st}
                  onClick={() => set("stage", v.stage === st ? null : st)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm",
                    v.stage === st ? "border-transparent bg-ink font-semibold text-paper" : "hover:bg-wash",
                  )}
                >
                  {INSIGHT_STAGE_LABEL[st]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${ids}-channel`} className="text-sm font-semibold">
                Canal
              </label>
              <Input
                id={`${ids}-channel`}
                value={v.channel}
                maxLength={80}
                placeholder="WhatsApp, eCommerce, tienda…"
                onChange={(e) => set("channel", e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <label htmlFor={`${ids}-tags`} className="text-sm font-semibold">
                Etiquetas
              </label>
              <Input
                id={`${ids}-tags`}
                value={v.tags}
                placeholder="precio, quincena, competencia"
                onChange={(e) => set("tags", e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl bg-wash px-3 py-2 text-sm font-medium">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="hidden text-xs text-soft sm:inline">Ctrl + Enter para guardar</span>
        <Button type="submit" size="lg" disabled={pending || v.title.trim().length < 5} className="h-11">
          <Lightbulb aria-hidden className="size-4" /> {insightId ? "Guardar cambios" : "Guardar en el carriel"}
        </Button>
      </div>
    </form>
  );
}
