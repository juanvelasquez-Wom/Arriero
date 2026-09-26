"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDays, weekStart } from "@/domain/dates";
import { formatDate } from "@/domain/format";

/** Selector de semana: siempre navega al lunes (`?semana=YYYY-MM-DD`). */
export function WeekPicker({
  baseHref,
  week,
  currentWeek,
  dirty = false,
}: {
  baseHref: string;
  week: string;
  currentWeek: string;
  /** Hay cambios sin guardar: pedir confirmación antes de cambiar de semana. */
  dirty?: boolean;
}) {
  const router = useRouter();
  const confirmLeave = () =>
    !dirty || window.confirm("Tiene cambios sin guardar en esta semana. ¿Cambiar de semana sin guardarlos?");
  const guard = (e: { preventDefault: () => void }) => {
    if (!confirmLeave()) e.preventDefault();
  };
  const prev = addDays(week, -7);
  const next = addDays(week, 7);
  const canNext = next <= currentWeek;
  const href = (w: string) => `${baseHref}?semana=${w}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="icon" aria-label="Semana anterior">
        <Link href={href(prev)} onClick={guard}>
          <ChevronLeft aria-hidden />
        </Link>
      </Button>
      <label className="flex items-center gap-2 text-sm">
        <span className="sr-only">Elegir semana (cualquier día; se toma su lunes)</span>
        <Input
          type="date"
          className="w-40 tabular-nums"
          value={week}
          max={addDays(currentWeek, 6)}
          onChange={(e) => {
            const v = e.target.value;
            if (/^\d{4}-\d{2}-\d{2}$/.test(v) && confirmLeave()) router.push(href(weekStart(v)));
          }}
        />
      </label>
      {canNext ? (
        <Button asChild variant="outline" size="icon" aria-label="Semana siguiente">
          <Link href={href(next)} onClick={guard}>
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="icon" disabled aria-label="Semana siguiente (aún no empieza)">
          <ChevronRight aria-hidden />
        </Button>
      )}
      <span className="text-sm text-soft">
        Semana del <span className="font-medium text-ink">{formatDate(week)}</span> al {formatDate(addDays(week, 6))}
      </span>
      {week !== currentWeek ? (
        <Button asChild variant="ghost" size="sm">
          <Link href={href(currentWeek)} onClick={guard}>Ir a esta semana</Link>
        </Button>
      ) : null}
    </div>
  );
}
