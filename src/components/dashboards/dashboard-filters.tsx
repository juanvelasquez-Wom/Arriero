"use client";

import { FilterX } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useId, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export interface FilterField {
  /** Nombre del search param (`linea`, `estado`, …). */
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

const ALL = "__todos__";

/**
 * Selects que escriben en la URL. `current` son los search params actuales
 * (se conservan los que no son filtros, p. ej. `zoom`).
 */
export function DashboardFilters({
  fields,
  current,
  className,
}: {
  fields: FilterField[];
  current: Record<string, string>;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const baseId = useId();
  const active = fields.filter((f) => current[f.key]);

  function push(next: Record<string, string>) {
    const sp = new URLSearchParams(next);
    const qs = sp.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function setValue(key: string, value: string) {
    const next = { ...current };
    if (value === ALL) delete next[key];
    else next[key] = value;
    push(next);
  }

  function clear() {
    const next = { ...current };
    for (const f of fields) delete next[f.key];
    push(next);
  }

  return (
    <div
      role="search"
      aria-label="Filtros del tablero"
      className={cn("flex flex-wrap items-end gap-3 rounded-xl border bg-paper p-3", className)}
    >
      {fields.map((f) => {
        const id = `${baseId}-${f.key}`;
        const value = current[f.key] && f.options.some((o) => o.value === current[f.key]) ? current[f.key] : ALL;
        return (
          <div key={f.key} className="flex min-w-36 flex-col gap-1">
            <label htmlFor={id} className="text-xs font-medium text-soft">
              {f.label}
            </label>
            <Select value={value} onValueChange={(v) => setValue(f.key, v)}>
              <SelectTrigger id={id} size="sm" className={cn("w-44 bg-paper", value !== ALL && "border-ink/40 font-medium")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={ALL}>Todos</SelectItem>
                {f.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
      <div className="flex items-center gap-2 pb-0.5">
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={active.length === 0 || pending}>
          <FilterX aria-hidden /> Limpiar filtros
        </Button>
        <span aria-live="polite" className="flex items-center gap-1.5 text-xs text-soft">
          {pending ? (
            <>
              <Spinner className="size-3.5" /> Actualizando…
            </>
          ) : active.length ? (
            `${active.length} filtro${active.length === 1 ? "" : "s"} activo${active.length === 1 ? "" : "s"}`
          ) : null}
        </span>
      </div>
    </div>
  );
}
