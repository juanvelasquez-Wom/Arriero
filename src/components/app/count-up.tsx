"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Número que sube desde 0 hasta su valor al aparecer (≈600 ms). Con "reducir
 * movimiento", o si el valor no es un número entero pequeño de mostrar, se ve
 * fijo desde el inicio. El texto final siempre es el mismo que el servidor.
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduce = false;
    }
    if (reduce || !Number.isInteger(value) || value <= 0 || value > 100000) return;
    const start = performance.now();
    const duration = 600;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span className={className} aria-label={String(value)}>
      <span aria-hidden>{shown.toLocaleString("es-CO")}</span>
    </span>
  );
}
