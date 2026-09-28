"use client";

import { toast } from "sonner";

const COLORS = ["#F2C200", "#111111", "#F2C200", "#A3A3A0", "#FFFFFF"];

/** Confeti amarillo y negro + mensaje. Respeta "reducir movimiento" (solo muestra el mensaje). */
export function celebrate(title: string, description?: string) {
  toast.success(title, { description });
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const pieces: HTMLElement[] = [];
  for (let i = 0; i < 90; i++) {
    const el = document.createElement("span");
    el.className = "confetti-piece";
    el.setAttribute("aria-hidden", "true");
    const size = 6 + Math.random() * 6;
    el.style.left = `${Math.random() * 100}vw`;
    el.style.width = `${size}px`;
    el.style.height = `${size * 1.5}px`;
    el.style.background = COLORS[i % COLORS.length];
    el.style.border = "1px solid rgb(17 17 17 / 0.15)";
    el.style.animationDelay = `${Math.random() * 250}ms`;
    el.style.setProperty("--dur", `${1400 + Math.random() * 1200}ms`);
    el.style.setProperty("--dx", `${(Math.random() - 0.5) * 240}px`);
    el.style.setProperty("--rot", `${(Math.random() - 0.5) * 1440}deg`);
    document.body.appendChild(el);
    pieces.push(el);
  }
  window.setTimeout(() => pieces.forEach((p) => p.remove()), 3000);
}

export const CELEBRATIONS = {
  winner: ["¡Eso! ¡Ese camino sí era!", "¡Qué berraquera! Si funciona, seguimos: a escalarlo."],
  scaled: ["¡Ave María, qué belleza!", "La mula llegó con la carga: esto ya es parte del BAU."],
  setupDone: ["¡Listo pues, programa armado!", "Ya sabe por dónde es. Ahora hágale a la primera oportunidad de mejora."],
} as const;
