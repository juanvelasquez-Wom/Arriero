"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Chistes de growth con acento paisa para la pantalla de acceso. Rotan solos
// (salvo con "reducir movimiento") y también con clic: tocar la mula da otro.
export const LOGIN_JOKES = [
  "Aquí la mula no carga corazonadas: solo hipótesis con evidencia.",
  "Un A/B test a la semana y el jefe ni pregunta.",
  "Si la métrica norte no se mueve, alguien está cargando por cargar.",
  "El embudo no se destapa solo. ¡Hágale pues!",
  "Menos reuniones, más experimentos. Y un tinto, obvio.",
  "¿Otra vez el deck de 80 láminas? Ese camino no era.",
  "El que no mide, no sabe por dónde es.",
  "En diciembre hay congelamiento: ni la mula lanza nada.",
  "Perder un experimento no es fracasar: es aprender con ruana.",
  "ICE alto y esfuerzo bajo: eso está como bueno.",
  "La conversión no sube rezando: sube probando.",
  "Del dato al camino, y del camino al BAU.",
] as const;

export function LoginJokes({ className, tone = "dark", compact = false }: { className?: string; tone?: "dark" | "light"; compact?: boolean }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduce = false;
    }
    if (reduce) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % LOGIN_JOKES.length), 6000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <button
      type="button"
      onClick={() => setI((n) => (n + 1) % LOGIN_JOKES.length)}
      className={cn(
        "group block w-full rounded-2xl text-left transition active:scale-[0.99]",
        compact ? "px-3.5 py-3" : "px-4 py-[1.6vh]",
        tone === "dark" ? "bg-highlight text-[#111111] hover:brightness-105" : "border border-highlight bg-highlight/15 text-ink hover:bg-highlight/25",
        className,
      )}
      aria-label="Otro chiste de la mula"
    >
      <span className="block text-[11px] font-bold tracking-[0.14em] uppercase opacity-70">La mula dice</span>
      <span
        key={i}
        aria-live="polite"
        className={cn("pop-in mt-1 block font-heading leading-snug font-extrabold", compact ? "text-base" : "text-[clamp(0.95rem,2.3vh,1.2rem)]")}
      >
        «{LOGIN_JOKES[i]}»
      </span>
      <span className="mt-1.5 block text-xs font-semibold opacity-60 group-hover:opacity-90">
        Toque para otro <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
      </span>
    </button>
  );
}
