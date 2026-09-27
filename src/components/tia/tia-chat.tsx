"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { SendHorizontalIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { TiaAvatar, TiaDisclaimer, TiaText, TiaThinking } from "@/components/tia/tia-ui";
import { TIA_LINES } from "@/domain/tia";
import { CHAT_INTRO, CHAT_MESSAGE_MAX, CHAT_SUGGESTIONS, CHAT_TITLE, quotaLabel, splitStreamError } from "@/domain/tia-chat";
import { cn } from "@/lib/utils";
import { clearTiaChat, loadTiaChat } from "@/server/actions/tia-chat";

interface Bubble {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: string | null;
  streaming?: boolean;
}

let seq = 0;
const nextId = () => `local-${Date.now()}-${++seq}`;

/**
 * "Pregúntele a la Tía": botón flotante y panel lateral de chat del programa.
 * Solo presenta y conversa; la respuesta la arma el servidor (/api/tia/chat).
 */
export function TiaChat({ programId, programName, configured, left }: { programId: string; programName: string; configured: boolean; left: number | null }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [historyState, setHistoryState] = useState<"idle" | "loading" | "ready">("idle");
  const [stored, setStored] = useState(true);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState<number | null>(left);
  const [confirmClear, setConfirmClear] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputId = useId();
  const hintId = useId();

  const noQuota = quota === 0;
  const canAsk = configured && !noQuota && !busy;

  // Corta la respuesta en curso si se sale de la página.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Mantiene a la vista el último mensaje.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  async function loadHistory() {
    setHistoryState("loading");
    const res = await loadTiaChat(programId);
    if (res.ok) {
      setStored(res.data.stored);
      setMessages((current) => (current.length ? current : res.data.messages.map((m) => ({ id: m.id, role: m.role, content: m.content }))));
    }
    setHistoryState("ready");
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    setConfirmClear(false);
    if (next && configured && historyState === "idle") void loadHistory();
  }

  function patch(id: string, update: Partial<Bubble>) {
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...update } : m)));
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || !canAsk) return;
    const answerId = nextId();
    setMessages((ms) => [...ms, { id: nextId(), role: "user", content: question }, { id: answerId, role: "assistant", content: "", streaming: true }]);
    setDraft("");
    setBusy(true);
    setConfirmClear(false);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/tia/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ programId, message: question }),
        signal: controller.signal,
      });
      // Sin sesión, el proxy redirige al login: no es una respuesta de La Tía.
      if (res.redirected || (res.ok && !res.headers.get("content-type")?.startsWith("text/plain"))) {
        patch(answerId, { streaming: false, error: "Su sesión venció. Recargue la página e ingrese de nuevo." });
        return;
      }
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (res.status === 429 && body?.error === TIA_LINES.quotaExceeded) setQuota(0);
        patch(answerId, { streaming: false, error: body?.error ?? "La Tía no pudo responder. Intente de nuevo." });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        const { text: partial, error } = splitStreamError(raw);
        patch(answerId, { content: partial, error });
      }
      raw += decoder.decode();
      const { text: final, error } = splitStreamError(raw);
      patch(answerId, { content: final, error, streaming: false });
      if (!error) setQuota((q) => (q == null ? q : Math.max(0, q - 1)));
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      patch(answerId, { streaming: false, error: aborted ? "Se canceló la respuesta." : "No hubo conexión con La Tía. Revise su internet e intente de nuevo." });
    } finally {
      abortRef.current = null;
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(draft);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
  }

  async function clear() {
    abortRef.current?.abort();
    const res = await clearTiaChat(programId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setMessages([]);
    setConfirmClear(false);
    toast.success("Listo, borrón y cuenta nueva.");
    inputRef.current?.focus();
  }

  const quotaText = configured ? quotaLabel(quota) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-highlight bg-highlight/15 py-0.5 pr-0.5 pl-0.5 text-xs font-semibold text-ink transition hover:bg-highlight/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:pr-3 print:hidden"
          aria-label={`${CHAT_TITLE}: pregúntele sobre ${programName}`}
        >
          <TiaAvatar className="size-6 ring-0" />
          <span className="hidden sm:inline">{CHAT_TITLE}</span>
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 bg-paper p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        onOpenAutoFocus={(e) => {
          if (!canAsk) return;
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <SheetHeader className="flex-row items-start gap-3 border-b border-line p-4 pr-3">
          <TiaAvatar />
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-heading text-base font-extrabold text-ink">{CHAT_TITLE}</SheetTitle>
            <SheetDescription className="text-soft">
              {CHAT_INTRO} <span className="sr-only">Programa: {programName}.</span>
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Cerrar el chat">
              <XIcon />
            </Button>
          </SheetClose>
        </SheetHeader>

        {!configured ? (
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            <div className="rounded-2xl border border-line bg-wash p-4 text-sm">
              <p className="font-semibold">{TIA_LINES.notConfigured}</p>
              <p className="mt-2 text-soft">Para un admin de Arriero:</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-soft">
                <li>Conecte la llave de Claude en la configuración del servidor de la app.</li>
                <li>Vuelva a desplegar la app para que tome el cambio.</li>
                <li>Abra de nuevo este panel: La Tía ya le contesta.</li>
              </ol>
            </div>
          </div>
        ) : (
          <div
            ref={listRef}
            className="flex-1 space-y-4 overflow-y-auto p-4"
            role="log"
            aria-label="Conversación con La Tía"
            aria-busy={historyState === "loading"}
          >
            {historyState === "loading" && !messages.length ? (
              <p className="text-sm text-soft">Buscando lo que ya habían conversado…</p>
            ) : null}
            {historyState !== "loading" && !messages.length ? (
              <div className="space-y-3">
                <p className="text-sm text-soft">¿Por dónde empezamos? Puede tocar una de estas o escribir su pregunta:</p>
                <ul className="flex flex-wrap gap-2">
                  {CHAT_SUGGESTIONS.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        disabled={!canAsk}
                        onClick={() => void send(s)}
                        className="rounded-full border border-line bg-paper px-3 py-1.5 text-left text-sm transition hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
                {!stored ? <p className="text-xs text-soft">Por ahora la conversación no se guarda: al recargar, arrancamos de cero.</p> : null}
              </div>
            ) : null}
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-wash px-3 py-2 text-sm whitespace-pre-wrap text-ink">
                    <span className="sr-only">Usted: </span>
                    {m.content}
                  </p>
                </div>
              ) : (
                <div key={m.id} className="flex items-start gap-2">
                  <TiaAvatar className="size-7" />
                  <div
                    className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-sm border border-line bg-paper px-3 py-2"
                    aria-live={m.streaming ? "polite" : undefined}
                    aria-busy={m.streaming || undefined}
                  >
                    <span className="sr-only">La Tía: </span>
                    {m.content ? <TiaText text={m.content} /> : m.streaming ? <TiaThinking seed={m.id} /> : null}
                    {m.error ? (
                      <p className={cn("text-sm text-soft", m.content && "mt-2")} role="alert">
                        {m.error}
                      </p>
                    ) : null}
                  </div>
                </div>
              ),
            )}
          </div>
        )}

        <div className="space-y-2 border-t border-line p-4">
          {configured ? (
            <form onSubmit={onSubmit} className="space-y-2">
              <label htmlFor={inputId} className="sr-only">
                Su pregunta para La Tía
              </label>
              <div className="flex items-end gap-2">
                <Textarea
                  id={inputId}
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  maxLength={CHAT_MESSAGE_MAX}
                  rows={2}
                  disabled={!configured || noQuota}
                  aria-describedby={hintId}
                  placeholder={noQuota ? TIA_LINES.quotaExceeded : "Escríbale a La Tía…"}
                  className="max-h-40 min-h-11 resize-none"
                />
                <Button type="submit" size="icon" disabled={!canAsk || !draft.trim()} aria-label="Enviar pregunta">
                  <SendHorizontalIcon />
                </Button>
              </div>
              <div id={hintId} className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-soft">
                <span>Enter para enviar · Shift + Enter para otra línea{quotaText ? ` · ${quotaText}` : ""}</span>
                {messages.length ? (
                  confirmClear ? (
                    <span className="inline-flex items-center gap-1">
                      <span>¿Borrar toda la conversación?</span>
                      <Button type="button" variant="ghost" size="xs" onClick={() => void clear()}>
                        Sí, borrar
                      </Button>
                      <Button type="button" variant="ghost" size="xs" onClick={() => setConfirmClear(false)}>
                        No
                      </Button>
                    </span>
                  ) : (
                    <Button type="button" variant="ghost" size="xs" onClick={() => setConfirmClear(true)} disabled={busy}>
                      <Trash2Icon />
                      Borrar conversación
                    </Button>
                  )
                ) : null}
              </div>
            </form>
          ) : null}
          <TiaDisclaimer />
        </div>
      </SheetContent>
    </Sheet>
  );
}
