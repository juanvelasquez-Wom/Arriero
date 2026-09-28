"use client";

import { BookOpenCheck, ClipboardList, FlaskConical, FolderKanban, Gauge, Keyboard, Search, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  isSearchable,
  resolveShortcut,
  SHORTCUTS_HELP,
  type SearchGroup,
  type SearchHit,
  type SearchKind,
  type ShortcutState,
} from "@/domain/search";
import { cn } from "@/lib/utils";
import { searchEverything } from "@/server/actions/search";

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  experiment: FlaskConical,
  problem: ClipboardList,
  learning: BookOpenCheck,
  metric: Gauge,
  program: FolderKanban,
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || !!target.closest("[role=combobox]");
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-wash px-1 font-sans text-[11px] font-semibold text-soft">
      {children}
    </kbd>
  );
}

/**
 * Buscador global (Ctrl/⌘+K) y atajos de teclado. `programId` = programa
 * abierto (habilita N, G B, G K y sube sus resultados en el ranking).
 */
export function CommandSearch({ programId, canCreateExperiment = false }: { programId?: string | null; canCreateExperiment?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const shortcutState = useRef<ShortcutState>({ pendingG: false });
  const gTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const listId = useId();
  const inputId = useId();

  const flat: SearchHit[] = groups.flatMap((g) => g.hits);
  const base = programId ? `/programas/${programId}` : null;

  // Atajos globales.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat) return;
      const { action, state } = resolveShortcut(shortcutState.current, e, {
        inProgram: !!base,
        typing: isTypingTarget(e.target),
      });
      shortcutState.current = state;
      if (gTimer.current) clearTimeout(gTimer.current);
      if (state.pendingG) gTimer.current = setTimeout(() => (shortcutState.current = { pendingG: false }), 1200);
      if (!action) return;
      // Con un diálogo abierto (otro que no sea el nuestro), solo Ctrl+K.
      if (action !== "open-search" && document.querySelector("[role=dialog], [role=alertdialog]")) return;
      e.preventDefault();
      if (action === "open-search") {
        setHelpOpen(false);
        setOpen(true);
      } else if (action === "open-help") setHelpOpen(true);
      else if (base && action === "go-backlog") router.push(`${base}/ejercicios`);
      else if (base && action === "go-kanban") router.push(`${base}/tableros/kanban`);
      else if (base && action === "new-experiment" && canCreateExperiment) router.push(`${base}/ejercicios/nuevo`);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (gTimer.current) clearTimeout(gTimer.current);
    };
  }, [base, canCreateExperiment, router]);

  function runSearch(value: string) {
    if (debounce.current) clearTimeout(debounce.current);
    if (!isSearchable(value)) {
      requestId.current++;
      setGroups([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      const id = ++requestId.current;
      const result = await searchEverything({ query: value, programId: programId ?? null });
      if (id !== requestId.current) return; // llegó una búsqueda más nueva
      setLoading(false);
      setActiveIndex(0);
      if (result.ok) {
        setGroups(result.data);
        setError(null);
      } else {
        setGroups([]);
        setError(result.error);
      }
    }, 220);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      if (debounce.current) clearTimeout(debounce.current);
      requestId.current++;
      setQuery("");
      setGroups([]);
      setError(null);
      setLoading(false);
      setActiveIndex(0);
    }
  }

  function go(hit: SearchHit | undefined) {
    if (!hit) return;
    onOpenChange(false);
    router.push(hit.href);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flat.length) setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length) setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === "Home" && flat.length) {
      setActiveIndex(0);
    } else if (e.key === "End" && flat.length) {
      setActiveIndex(flat.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[activeIndex]);
    }
  }

  const optionId = (i: number) => `${listId}-opt-${i}`;
  const searchable = isSearchable(query);
  // Índice global del primer resultado de cada grupo (para aria-activedescendant).
  const offsets = groups.map((_, gi) => groups.slice(0, gi).reduce((n, g) => n + g.hits.length, 0));

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 rounded-full text-soft"
        aria-label="Buscar (Ctrl+K)"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Search aria-hidden />
        <span className="hidden xl:inline">Buscar</span>
        <span className="hidden items-center gap-0.5 xl:inline-flex" aria-hidden>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="top-[12vh] translate-y-0 gap-0 p-0 sm:max-w-xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Buscar en sus programas</DialogTitle>
            <DialogDescription>
              Escriba al menos dos letras. Use las flechas para moverse entre resultados y Enter para abrir.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 border-b px-3 py-2 pr-11">
            <Search aria-hidden className="size-4 shrink-0 text-soft" />
            <label htmlFor={inputId} className="sr-only">
              Buscar problemas, ejercicios, aprendizajes y métricas
            </label>
            <Input
              id={inputId}
              autoFocus
              autoComplete="off"
              role="combobox"
              aria-expanded={flat.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={flat.length ? optionId(activeIndex) : undefined}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                runSearch(e.target.value);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Problemas, ejercicios, aprendizajes, métricas…"
              className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            {loading ? <Spinner className="size-4 shrink-0" /> : null}
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            <ul id={listId} role="listbox" aria-label="Resultados" className={cn(!flat.length && "hidden")}>
              {groups.map((g, gi) => (
                <li key={g.kind} role="presentation" className="mb-2 last:mb-0">
                  <div role="presentation" className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft">
                    {g.label}
                  </div>
                  <ul role="group" aria-label={g.label}>
                    {g.hits.map((hit, hi) => {
                      const i = offsets[gi] + hi;
                      const Icon = KIND_ICON[hit.kind];
                      const active = i === activeIndex;
                      return (
                        <li
                          key={`${hit.kind}-${hit.id}`}
                          id={optionId(i)}
                          role="option"
                          aria-selected={active}
                          onMouseMove={() => setActiveIndex(i)}
                          onClick={() => go(hit)}
                          className={cn(
                            "flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2",
                            active ? "bg-wash ring-1 ring-ink/20" : "hover:bg-wash",
                          )}
                        >
                          <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-soft" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{hit.title}</span>
                            {hit.snippet ? <span className="block truncate text-xs text-soft">{hit.snippet}</span> : null}
                          </span>
                          {hit.kind !== "program" ? (
                            <span className="hidden max-w-36 shrink-0 truncate text-xs text-soft sm:block">{hit.programName}</span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>

            <div role="status" aria-live="polite" className="px-2 py-6 text-center text-sm text-soft empty:hidden">
              {error
                ? error
                : !searchable
                  ? query
                    ? "Escriba al menos dos letras."
                    : "Busque por título, evidencia, hipótesis o nombre de métrica. Sin tildes también funciona."
                  : !loading && !flat.length
                    ? "Nada por aquí con ese nombre. Pruebe con otra palabra, que la mula no se rinde."
                    : !loading
                      ? `${flat.length} resultado${flat.length === 1 ? "" : "s"}.`
                      : ""}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-soft">
            <span className="inline-flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> moverse
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>Enter</Kbd> abrir
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>Esc</Kbd> cerrar
            </span>
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1 rounded hover:text-ink"
              onClick={() => {
                onOpenChange(false);
                setHelpOpen(true);
              }}
            >
              <Keyboard aria-hidden className="size-3.5" /> Atajos <Kbd>?</Kbd>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atajos de teclado</DialogTitle>
            <DialogDescription>Para andar más ligero que mula en bajada.</DialogDescription>
          </DialogHeader>
          <dl className="grid gap-2 text-sm">
            {SHORTCUTS_HELP.filter((s) => !s.inProgram || base)
              .filter((s) => s.keys[0] !== "N" || canCreateExperiment)
              .map((s) => (
                <div key={s.label} className="flex items-center justify-between gap-4">
                  <dt>{s.label}</dt>
                  <dd className="flex shrink-0 items-center gap-1">
                    {s.keys.map((k, i) => (
                      <span key={k} className="inline-flex items-center gap-1">
                        {i > 0 ? <span className="text-xs text-soft">{s.keys[0] === "Ctrl" ? "+" : "luego"}</span> : null}
                        <Kbd>{k}</Kbd>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
          </dl>
          {!base ? <p className="text-xs text-soft">Dentro de un programa hay más atajos: N, G luego B y G luego K.</p> : null}
          <p className="text-xs text-soft">En Mac, use ⌘ en lugar de Ctrl.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
