"use client";

import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export interface FilterDef {
  param: string;
  label: string;
  options: { value: string; label: string }[];
}

const ALL = "__all__";

/**
 * En pantallas pequeñas (< md) esconde los filtros detrás de un botón
 * «Filtros (n activos)»; en escritorio los muestra siempre, sin cambios.
 */
export function MobileFiltersToggle({
  activeCount,
  className,
  children,
}: {
  activeCount: number;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className={className}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mb-2 md:hidden"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersHorizontal aria-hidden />
        Filtros{activeCount ? ` (${activeCount} activo${activeCount === 1 ? "" : "s"})` : ""}
        <ChevronDown aria-hidden className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      <div id={panelId} className={cn(open ? "block" : "hidden", "md:block")}>
        {children}
      </div>
    </div>
  );
}

/** Filtros como parámetros de la URL (compartibles y persistentes al recargar). */
export function UrlFilters({ filters, search }: { filters: FilterDef[]; search?: { param: string; placeholder: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function set(param: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) next.delete(param);
    else next.set(param, value);
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  }

  const activeCount = filters.filter((f) => params.get(f.param)).length + (search && params.get(search.param) ? 1 : 0);

  return (
    <MobileFiltersToggle activeCount={activeCount} className="mb-4">
      <div className="flex flex-wrap items-end gap-2" role="search">
        {search ? (
          <div className="w-full min-w-56 flex-1 md:w-auto">
            <label htmlFor={`f-${search.param}`} className="mb-1 block text-xs text-soft">
              Buscar
            </label>
            <Input
              id={`f-${search.param}`}
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
            <label htmlFor={`f-${f.param}`} className="mb-1 block text-xs text-soft">
              {f.label}
            </label>
            <Select value={params.get(f.param) ?? ALL} onValueChange={(v) => set(f.param, v)}>
              <SelectTrigger id={`f-${f.param}`} className="w-44" size="sm">
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
        {activeCount ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}
            className="mb-0.5"
          >
            <X aria-hidden /> Limpiar
          </Button>
        ) : null}
        {pending ? <Spinner className="mb-2" /> : null}
      </div>
    </MobileFiltersToggle>
  );
}
