"use client";

import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { FilterDef } from "./url-filters";

const ALL = "__all__";

/**
 * Filtros en la URL escondidos detrás de un solo botón «Filtros (n)», en
 * celular y en escritorio. `extraParams` son parámetros que manejan los hijos
 * (p. ej. un rango de fechas): cuentan como activos y se limpian con el resto.
 */
export function FiltersPanel({
  filters,
  search,
  extraParams = [],
  children,
  aside,
  className,
}: {
  filters: FilterDef[];
  search?: { param: string; placeholder: string };
  extraParams?: string[];
  children?: ReactNode;
  /** Lo que va a la derecha del botón (p. ej. selector de vista). */
  aside?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const owned = [...filters.map((f) => f.param), ...(search ? [search.param] : []), ...extraParams];
  const activeCount = owned.filter((p) => params.get(p)).length;
  const [open, setOpen] = useState(false);
  const panelId = useId();

  function replace(next: URLSearchParams) {
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  }
  function set(param: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) next.delete(param);
    else next.set(param, value);
    replace(next);
  }
  function clear() {
    const next = new URLSearchParams(params.toString());
    for (const p of owned) next.delete(p);
    replace(next);
  }

  return (
    <div className={cn("mb-4", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
          <SlidersHorizontal aria-hidden />
          Filtros{activeCount ? ` (${activeCount} activo${activeCount === 1 ? "" : "s"})` : ""}
          <ChevronDown aria-hidden className={cn("transition-transform", open && "rotate-180")} />
        </Button>
        {activeCount ? (
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            <X aria-hidden /> Limpiar
          </Button>
        ) : null}
        {pending ? <Spinner /> : null}
        {aside ? <div className="ml-auto">{aside}</div> : null}
      </div>
      <div id={panelId} hidden={!open} className="mt-3 rounded-2xl border bg-wash/60 p-3">
        <div className="flex flex-wrap items-end gap-2" role="search">
          {search ? (
            <div className="w-full min-w-56 flex-1 md:w-auto">
              <label htmlFor={`fp-${search.param}`} className="mb-1 block text-xs text-soft">
                Buscar
              </label>
              <Input
                id={`fp-${search.param}`}
                defaultValue={params.get(search.param) ?? ""}
                placeholder={search.placeholder}
                onKeyDown={(e) => {
                  if (e.key === "Enter") set(search.param, (e.target as HTMLInputElement).value.trim() || null);
                }}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (params.get(search.param) ?? "")) set(search.param, v || null);
                }}
              />
            </div>
          ) : null}
          {filters.map((f) => (
            <div key={f.param}>
              <label htmlFor={`fp-${f.param}`} className="mb-1 block text-xs text-soft">
                {f.label}
              </label>
              <Select value={params.get(f.param) ?? ALL} onValueChange={(v) => set(f.param, v)}>
                <SelectTrigger id={`fp-${f.param}`} className="w-44" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {f.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    </div>
  );
}
