"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/**
 * Filtro de fechas "desde / hasta" en la URL (se combina con UrlFilters). Se
 * aplica al salir del campo o con Enter, para no recargar mientras se escribe.
 */
export function DateRangeFilter({
  legend = "Fechas",
  fromParam = "desde",
  toParam = "hasta",
}: {
  legend?: string;
  fromParam?: string;
  toParam?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const id = useId();

  const urlFrom = params.get(fromParam) ?? "";
  const urlTo = params.get(toParam) ?? "";
  const [from, setFrom] = useState(urlFrom);
  const [to, setTo] = useState(urlTo);
  // Si la URL cambia desde afuera (p. ej. "Limpiar"), los campos la siguen.
  const [seen, setSeen] = useState(`${urlFrom}|${urlTo}`);
  if (seen !== `${urlFrom}|${urlTo}`) {
    setSeen(`${urlFrom}|${urlTo}`);
    setFrom(urlFrom);
    setTo(urlTo);
  }

  function commit(param: string, value: string) {
    if ((params.get(param) ?? "") === value) return;
    const next = new URLSearchParams(params.toString());
    if (value) next.set(param, value);
    else next.delete(param);
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  }

  return (
    <fieldset className="flex flex-wrap items-end gap-2">
      <legend className="sr-only">{legend}</legend>
      <div>
        <label htmlFor={`${id}-from`} className="mb-1 block text-xs text-soft">
          Desde
        </label>
        <Input
          id={`${id}-from`}
          type="date"
          className="h-8 w-40 tabular-nums"
          value={from}
          max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
          onBlur={() => commit(fromParam, from)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(fromParam, from);
          }}
        />
      </div>
      <div>
        <label htmlFor={`${id}-to`} className="mb-1 block text-xs text-soft">
          Hasta
        </label>
        <Input
          id={`${id}-to`}
          type="date"
          className="h-8 w-40 tabular-nums"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
          onBlur={() => commit(toParam, to)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(toParam, to);
          }}
        />
      </div>
      {pending ? <Spinner className="mb-2" /> : null}
    </fieldset>
  );
}
