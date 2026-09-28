"use client";

import { SendHorizontalIcon, Sparkles, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { TIA_ENABLED } from "@/domain/tia";
import { emptyCopilotState, type Chip, type ChipAction, type CopilotMode, type CopilotState, type TiaOut } from "@/domain/tia-copilot";
import { formatCop } from "@/domain/tia-cost";
import { cn } from "@/lib/utils";
import { openTiaCopilot, sendTiaCopilot } from "@/server/actions/tia-copilot";
import { TiaAvatar, TiaDisclaimer, TiaText, TiaThinking } from "./tia-ui";

const STORAGE_KEY = "arriero:tia:copiloto";
const OPEN_EVENT = "tia:open";
const MAX_KEPT = 40;

type Bubble = { id: string; from: "tia"; out: TiaOut } | { id: string; from: "user"; text: string };

interface Saved {
  state: CopilotState;
  bubbles: Bubble[];
  cop: number;
}

function load(): Saved | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function save(s: Saved) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, bubbles: s.bubbles.slice(-MAX_KEPT) }));
  } catch {
    // Sin almacenamiento: la conversación vive mientras la pestaña esté abierta.
  }
}

let seq = 0;
const nextId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Abre La Tía desde cualquier botón de la app (opcionalmente, directo en un modo). */
export function openTia(mode?: CopilotMode) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { mode } }));
}

/** Botón "Hágalo con La Tía" para poner en tarjetas y asistentes. */
export function OpenTiaButton({ mode, label = "Hágalo con La Tía", className, variant = "outline" }: { mode?: CopilotMode; label?: string; className?: string; variant?: "outline" | "default" | "ghost" }) {
  if (!TIA_ENABLED) return null;
  return (
    <Button type="button" variant={variant} className={className} onClick={() => openTia(mode)}>
      <TiaAvatar className="size-5 ring-0" />
      {label}
    </Button>
  );
}

function TiaCopilotInner({ showCost }: { showCost: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // El panel solo se pinta abierto: leer la sesión al iniciar no cambia el HTML del servidor.
  const [saved] = useState(load);
  const [state, setState] = useState<CopilotState>(() => saved?.state ?? emptyCopilotState());
  const [bubbles, setBubbles] = useState<Bubble[]>(() => saved?.bubbles ?? []);
  const [cop, setCop] = useState(() => saved?.cop ?? 0);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  // El estado más reciente, para los eventos que llegan desde afuera.
  const live = useRef({ state, bubbles, busy });
  useEffect(() => {
    live.current = { state, bubbles, busy };
  }, [state, bubbles, busy]);

  useEffect(() => {
    save({ state, bubbles, cop });
  }, [state, bubbles, cop]);

  // Siempre a la vista lo último, también al abrir el panel.
  useEffect(() => {
    const id = requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
    return () => cancelAnimationFrame(id);
  }, [bubbles, busy, open]);

  const apply = useCallback((reply: Awaited<ReturnType<typeof sendTiaCopilot>>) => {
    setState(reply.state);
    setBubbles((b) => [...b, ...reply.out.map((out) => ({ id: nextId(), from: "tia" as const, out }))]);
    if (reply.spend.length) setCop((c) => c + reply.spend.reduce((s, x) => s + x.cop, 0));
  }, []);

  const send = useCallback(
    async (input: { message?: string; chip?: ChipAction; echo: string }) => {
      if (live.current.busy) return;
      setBusy(true);
      setBubbles((b) => [...b, { id: nextId(), from: "user", text: input.echo }]);
      try {
        apply(await sendTiaCopilot({ state: live.current.state, message: input.message, chip: input.chip, path: pathname }));
      } catch {
        setBubbles((b) => [...b, { id: nextId(), from: "tia", out: { text: "Se me cayó la señal. Intente de nuevo en un momentico.", tone: "warn" } }]);
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [apply, pathname],
  );

  const greet = useCallback(async (from?: CopilotState) => {
    setBusy(true);
    try {
      apply(await openTiaCopilot(from ?? live.current.state, pathname));
    } catch {
      setBubbles((b) => [...b, { id: nextId(), from: "tia", out: { text: "No pude conectarme. Intente de nuevo en un momentico.", tone: "warn" } }]);
    } finally {
      setBusy(false);
    }
  }, [apply, pathname]);

  // Abrir desde otros botones de la app.
  useEffect(() => {
    function onOpen(e: Event) {
      const mode = (e as CustomEvent<{ mode?: CopilotMode }>).detail?.mode;
      setOpen(true);
      if (mode) void send({ chip: { t: "mode", mode }, echo: MODE_ECHO[mode] });
      else if (!live.current.bubbles.length) void greet();
    }
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [greet, send]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && !live.current.bubbles.length) void greet();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void send({ message: text, echo: text });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) onSubmit(e);
  }

  function restart() {
    const fresh = emptyCopilotState();
    setState(fresh);
    setBubbles([]);
    setCop(0);
    void greet(fresh);
  }

  const lastTia = [...bubbles].reverse().find((b) => b.from === "tia");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="tia-fab fixed right-4 bottom-20 z-40 inline-flex items-center gap-2 rounded-full border border-highlight bg-paper py-1 pr-4 pl-1 text-sm font-semibold text-ink shadow-card transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:bottom-6 print:hidden"
        aria-label="Hablar con La Tía, su copiloto"
      >
        <TiaAvatar className="size-9 ring-0" />
        <span className="hidden sm:inline">La Tía</span>
      </button>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 bg-paper p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <SheetHeader className="flex-row items-start gap-3 border-b border-line p-4 pr-3">
          <TiaAvatar />
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-heading text-base font-extrabold text-ink">La Tía · su copiloto</SheetTitle>
            <SheetDescription className="text-soft">Dígale qué quiere hacer: ella pregunta lo que falta, lo crea y le lleva el hilo.</SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Cerrar La Tía">
              <XIcon />
            </Button>
          </SheetClose>
        </SheetHeader>

        <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-4" role="log" aria-label="Conversación con La Tía" aria-busy={busy}>
          {bubbles.map((b) =>
            b.from === "user" ? (
              <div key={b.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-wash px-3 py-2 text-sm whitespace-pre-wrap text-ink">
                  <span className="sr-only">Usted: </span>
                  {b.text}
                </p>
              </div>
            ) : (
              <TiaBubble key={b.id} out={b.out} active={b === lastTia && !busy} onChip={(c) => void send({ chip: c.action, echo: c.label })} />
            ),
          )}
          {busy ? (
            <div className="flex items-start gap-2">
              <TiaAvatar className="size-7" />
              <div className="rounded-2xl rounded-tl-sm border border-line bg-paper px-3 py-2">
                <TiaThinking seed={String(bubbles.length)} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-2 border-t border-line p-4">
          <form onSubmit={onSubmit} className="space-y-2">
            <label htmlFor={inputId} className="sr-only">
              Su mensaje para La Tía
            </label>
            <div className="flex items-end gap-2">
              <Textarea
                id={inputId}
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                maxLength={2000}
                rows={2}
                placeholder="Ej.: quiero un piloto de clic a WhatsApp en Meta para pospago, arrancando el lunes"
                className="max-h-40 min-h-11 resize-none"
              />
              <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label="Enviar">
                <SendHorizontalIcon />
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-soft">
              <span>
                Enter para enviar{showCost && cop > 0 ? ` · Esta charla va en ~${formatCop(cop)}` : ""}
              </span>
              {bubbles.length > 1 ? (
                <Button type="button" variant="ghost" size="xs" onClick={restart} disabled={busy}>
                  <Sparkles /> Empezar de nuevo
                </Button>
              ) : null}
            </div>
          </form>
          <TiaDisclaimer />
        </div>
      </SheetContent>
    </Sheet>
  );
}

const MODE_ECHO: Record<CopilotMode, string> = {
  project: "Quiero crear un proyecto de growth",
  pilot: "Quiero crear un piloto de medios",
  update: "Le quiero contar un avance",
};

function TiaBubble({ out, active, onChip }: { out: TiaOut; active: boolean; onChip: (c: Chip) => void }) {
  return (
    <div className="flex items-start gap-2">
      <TiaAvatar className="size-7" />
      <div className="min-w-0 max-w-[88%] space-y-2">
        <div
          className={cn(
            "rounded-2xl rounded-tl-sm border px-3 py-2",
            out.tone === "warn" ? "border-highlight bg-highlight/10" : out.tone === "ok" ? "border-highlight/60 bg-highlight/5" : "border-line bg-paper",
          )}
        >
          <span className="sr-only">La Tía: </span>
          <TiaText text={out.text} />
          {out.summary?.length ? (
            <dl className="mt-2 divide-y divide-line rounded-xl border border-line bg-wash text-sm">
              {out.summary.map((r) => (
                <div key={r.label} className="grid grid-cols-[7.5rem_1fr] gap-2 px-3 py-1.5">
                  <dt className="text-soft">{r.label}</dt>
                  <dd className="min-w-0 break-words text-ink">{r.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {out.links?.length ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {out.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-flex rounded-full bg-highlight px-3 py-1 text-sm font-semibold text-[#1F1F1F] hover:brightness-95">
                    {l.label} →
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {active && out.chips?.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Respuestas rápidas">
            {out.chips.map((c, i) => (
              <li key={`${c.label}-${i}`}>
                <button
                  type="button"
                  onClick={() => onChip(c)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                    c.primary ? "border-highlight bg-highlight text-[#1F1F1F] hover:brightness-95" : "border-line bg-paper hover:bg-wash",
                  )}
                >
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/** Atajo en los asistentes: en vez de llenar paso a paso, contárselo a La Tía. */
export function TiaShortcut({ mode, text }: { mode: CopilotMode; text: string }) {
  if (!TIA_ENABLED) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-highlight/70 bg-highlight/10 px-4 py-3 text-sm">
      <TiaAvatar className="size-8" />
      <p className="min-w-0 flex-1">{text}</p>
      <Button type="button" size="sm" variant="outline" onClick={() => openTia(mode)}>
        Hágalo con La Tía
      </Button>
    </div>
  );
}

/** Franja del inicio: pedirle a La Tía que arme las cosas en vez de llenar formularios. */
export function TiaHomeStrip({ canProject, canPilot }: { canProject: boolean; canPilot: boolean }) {
  if (!TIA_ENABLED) return null;
  return (
    <section className="rise mt-5 flex flex-col gap-3 rounded-2xl border border-highlight/70 bg-highlight/10 p-4 sm:flex-row sm:items-center">
      <TiaAvatar className="size-11" />
      <div className="min-w-0 flex-1">
        <h2 className="font-heading text-lg font-extrabold">¿Pereza de formularios? Cuéntele a La Tía</h2>
        <p className="text-sm text-soft">Dígale qué quiere con sus palabras: ella le pregunta lo que falta, lo arma y le lleva el hilo. No cobra, pero sí juzga.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canProject ? (
          <Button type="button" onClick={() => openTia("project")}>
            Armar un proyecto
          </Button>
        ) : null}
        {canPilot ? (
          <Button type="button" variant={canProject ? "outline" : "default"} onClick={() => openTia("pilot")}>
            Armar un piloto
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={() => openTia("update")}>
          Contarle un avance
        </Button>
      </div>
    </section>
  );
}

/** La Tía en toda la app (solo si está prendida con NEXT_PUBLIC_TIA_ENABLED). */
export function TiaCopilot({ showCost = false }: { showCost?: boolean }) {
  return TIA_ENABLED ? <TiaCopilotInner showCost={showCost} /> : null;
}
