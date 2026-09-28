"use client";

import { ChevronDown, CloudRain } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RETO_EXAMPLES, SESSION_TITLE_MAX, SESSION_TITLE_MIN } from "@/domain/ideas";
import { cn } from "@/lib/utils";
import { createIdeaSession, updateIdeaSession } from "@/server/actions/ideas";

export interface SessionFormValues {
  title: string;
  context: string;
  line_hint: string;
  deadline: string;
}
const EMPTY: SessionFormValues = { title: "", context: "", line_hint: "", deadline: "" };
const LINE_CHIPS = ["Pospago", "Prepago", "Recargas y paquetes", "Portabilidad", "Equipos", "Hogar"];

/**
 * «Arme un aguacero»: el reto es lo único obligatorio; lo demás va plegado.
 * Al crear, lleva directo a la sesión para que empiece a llover.
 */
export function SessionForm({
  sessionId,
  initial = EMPTY,
  exampleKey = 0,
  onDone,
}: {
  sessionId?: string;
  initial?: SessionFormValues;
  exampleKey?: number;
  onDone?: () => void;
}) {
  const router = useRouter();
  const ids = useId();
  const [v, setV] = useState<SessionFormValues>(initial);
  const [more, setMore] = useState(!!(initial.context || initial.line_hint || initial.deadline));
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const set = <K extends keyof SessionFormValues>(k: K, val: SessionFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const example = RETO_EXAMPLES[Math.abs(exampleKey) % RETO_EXAMPLES.length];

  function submit() {
    setError(undefined);
    start(async () => {
      const input = { title: v.title, context: v.context, line_hint: v.line_hint, deadline: v.deadline };
      const r = sessionId ? await updateIdeaSession(sessionId, input) : await createIdeaSession(input);
      if (!r.ok) {
        setError(r.fieldErrors ? (Object.values(r.fieldErrors)[0]?.[0] ?? r.error) : r.error);
        return;
      }
      toast.success(r.message);
      if (sessionId) {
        router.refresh();
        onDone?.();
      } else {
        router.push(`/ideas/${(r.data as { id: string }).id}`);
      }
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <label htmlFor={`${ids}-title`} className="text-sm font-semibold">
          ¿Cuál es el reto?
        </label>
        <Input
          id={`${ids}-title`}
          value={v.title}
          maxLength={SESSION_TITLE_MAX}
          placeholder={`Ej.: ${example}`}
          onChange={(e) => set("title", e.target.value)}
          className="mt-1.5 h-11 text-base"
        />
        <p className="mt-1 text-xs text-soft">Como una pregunta que se pueda responder con muchas ideas. Mientras más concreta, mejor llueve.</p>
      </div>

      <button
        type="button"
        onClick={() => setMore((m) => !m)}
        aria-expanded={more}
        className="inline-flex items-center gap-1 text-sm font-medium text-soft hover:text-ink"
      >
        <ChevronDown aria-hidden className={cn("size-4 transition-transform", more && "rotate-180")} />
        {more ? "Menos detalles" : "Agregar contexto, línea o fecha límite (opcional)"}
      </button>

      {more ? (
        <div className="slide-in space-y-4">
          <div>
            <label htmlFor={`${ids}-context`} className="text-sm font-semibold">
              Contexto
            </label>
            <Textarea
              id={`${ids}-context`}
              value={v.context}
              rows={3}
              maxLength={2000}
              placeholder="El dato que duele, lo que ya se probó, lo que no se puede tocar…"
              onChange={(e) => set("context", e.target.value)}
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
                  className={cn("rounded-full border px-3 py-1 text-sm", v.line_hint === l ? "border-transparent bg-ink font-semibold text-paper" : "hover:bg-wash")}
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
            <label htmlFor={`${ids}-deadline`} className="text-sm font-semibold">
              ¿Hasta cuándo llueve?
            </label>
            <Input id={`${ids}-deadline`} type="date" value={v.deadline} onChange={(e) => set("deadline", e.target.value)} className="mt-1.5 w-full sm:w-48" />
            <p className="mt-1 text-xs text-soft">Solo es un recordatorio: la fase la cambia usted.</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl bg-wash px-3 py-2 text-sm font-medium">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending || v.title.trim().length < SESSION_TITLE_MIN} className="h-11 w-full sm:w-auto">
          <CloudRain aria-hidden className="size-4" /> {sessionId ? "Guardar cambios" : "Armar el aguacero"}
        </Button>
      </div>
    </form>
  );
}
