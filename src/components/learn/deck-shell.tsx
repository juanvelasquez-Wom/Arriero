"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { BrandIcon } from "@/components/brand/icons";
import { Button } from "@/components/ui/button";
import { parseDeckProgress, serializeDeckProgress, type DeckProgress } from "@/domain/learn-content";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Progreso en localStorage. Si el almacenamiento falla (privado, bloqueado),
// se guarda en memoria y la página funciona igual mientras esté abierta.
// ---------------------------------------------------------------------------

const memory = new Map<string, string>();
const EVENT = "arriero:deck";

function readRaw(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    if (v != null) return v;
  } catch {
    // sin almacenamiento
  }
  return memory.get(key) ?? null;
}

function writeRaw(key: string, value: string) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // sin almacenamiento: queda en memoria
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useDeckProgress(storageKey: string, total: number) {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(storageKey),
    () => null,
  );
  const progress = useMemo(() => parseDeckProgress(raw, total), [raw, total]);
  const save = useCallback((next: DeckProgress) => writeRaw(storageKey, serializeDeckProgress(next)), [storageKey]);
  return [progress, save] as const;
}

// ---------------------------------------------------------------------------
// Barra de avance con la mula caminando
// ---------------------------------------------------------------------------

export function DeckProgressBar({ index, total, finished, label }: { index: number; total: number; finished: boolean; label: string }) {
  const pct = finished ? 100 : Math.round(((index + 1) / total) * 100);
  return (
    <div className="mb-6">
      <div className="mb-1 flex items-center justify-between text-xs font-medium text-soft tabular-nums">
        <span>{label}</span>
        <span>{finished ? "¡Llegamos!" : `${index + 1} de ${total}`}</span>
      </div>
      <div
        className="relative h-9"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={finished ? total : index + 1}
        aria-label={label}
      >
        <div className="absolute inset-x-0 bottom-1 h-2 overflow-hidden rounded-full bg-gray-2">
          <div className="h-full rounded-full bg-highlight transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${pct}%` }} />
        </div>
        <div
          className="absolute bottom-2 -translate-x-1/2 transition-[left] duration-500 ease-out motion-reduce:transition-none"
          style={{ left: `clamp(16px, ${pct}%, calc(100% - 16px))` }}
          aria-hidden
        >
          <BrandIcon name="mula-cargada" className={cn("w-9", !finished && "mule-walk")} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta con deslizamiento (dedo o mouse) y flechas del teclado
// ---------------------------------------------------------------------------

export function SwipeCard({
  children,
  onNext,
  onPrev,
  cardKey,
}: {
  children: ReactNode;
  onNext: () => void;
  onPrev: () => void;
  cardKey: string;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [role='slider'], [contenteditable='true']") || e.altKey || e.ctrlKey || e.metaKey)) return;
      if (e.key === "ArrowRight") onNext();
      if (e.key === "ArrowLeft") onPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onPrev]);

  return (
    <div
      key={cardKey}
      className="slide-in touch-pan-y rounded-3xl border bg-paper p-5 shadow-card sm:p-8"
      onPointerDown={(e) => {
        const t = e.target as HTMLElement;
        if (e.pointerType === "mouse" || t.closest("[data-no-swipe], button, a, [role='slider']")) {
          start.current = null;
          return;
        }
        start.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if (dx < 0) onNext();
        else onPrev();
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      {children}
    </div>
  );
}

export function DeckNav({
  index,
  total,
  onPrev,
  onNext,
  nextLabel,
  lastLabel,
}: {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  nextLabel?: string;
  lastLabel: string;
}) {
  const last = index === total - 1;
  return (
    <div className="mt-5 flex items-center gap-3">
      <Button variant="outline" size="lg" className="h-12 min-w-12 px-4" onClick={onPrev} disabled={index === 0} aria-label="Anterior">
        <ArrowLeft className="size-5" aria-hidden />
        <span className="hidden sm:inline">Anterior</span>
      </Button>
      <Button size="lg" className="h-12 flex-1 text-base" onClick={onNext}>
        {last ? lastLabel : (nextLabel ?? "Siguiente")}
        <ArrowRight className="size-5" aria-hidden />
      </Button>
    </div>
  );
}

/** Puntos para saltar a cualquier pantalla. */
export function DeckDots({ index, total, onGo, labels }: { index: number; total: number; onGo: (i: number) => void; labels: string[] }) {
  return (
    <nav aria-label="Pantallas" className="mt-4 flex flex-wrap justify-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onGo(i)}
          aria-label={`Ir a ${i + 1}: ${labels[i] ?? ""}`}
          aria-current={i === index ? "step" : undefined}
          className="flex size-7 items-center justify-center rounded-full"
        >
          <span
            className={cn(
              "block rounded-full transition-all motion-reduce:transition-none",
              i === index ? "h-2.5 w-5 bg-ink" : i < index ? "size-2 bg-soft" : "size-2 bg-gray-3",
            )}
          />
        </button>
      ))}
    </nav>
  );
}

/** Al cambiar de pantalla en el celular, volver arriba (sin animación si se pidió reducir movimiento). */
export function scrollDeckTop() {
  if (typeof window === "undefined") return;
  if (window.scrollY < 80) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
}
