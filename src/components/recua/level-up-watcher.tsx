"use client";

import { useEffect } from "react";
import { celebrate } from "@/components/brand/celebrate";
import { levelFor } from "@/domain/gamification";

/** Celebra cuando la persona sube de nivel desde la última vez que la vio (en este navegador). */
export function LevelUpWatcher({ userId, points }: { userId: string; points: number }) {
  useEffect(() => {
    const { level } = levelFor(points);
    const key = `arriero:recua:nivel:${userId}`;
    try {
      const prev = Number(window.localStorage.getItem(key) ?? "0");
      window.localStorage.setItem(key, String(level.rank));
      if (prev > 0 && level.rank > prev) celebrate(`¡Subió a ${level.title}!`, level.blurb);
    } catch {
      // sin almacenamiento: no hay con qué comparar, no se celebra
    }
  }, [userId, points]);
  return null;
}
