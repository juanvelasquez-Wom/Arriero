"use client";

import { Check, Plus, Search } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { MEDIA_DATA_MODE_LABEL } from "@/domain/pilots/labels";
import { cn } from "@/lib/utils";
import { createMedia } from "@/server/actions/pilots";
import type { MediaChannel } from "@/server/queries/pilots";

const norm = (s: string) => s.trim().toLocaleLowerCase("es-CO").normalize("NFD").replace(/\p{M}/gu, "");

/**
 * Buscar un medio del catálogo o crearlo escribiendo su nombre, sin salir del
 * asistente. `onPick` recibe el medio elegido (o el recién creado).
 */
export function MediaPicker({
  catalog,
  selectedIds,
  onPick,
  onCreated,
}: {
  catalog: MediaChannel[];
  selectedIds: string[];
  onPick: (media: MediaChannel) => void;
  onCreated: (media: MediaChannel) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const listId = useId();
  const q = norm(query);
  const matches = catalog.filter((m) => !q || norm(m.name).includes(q) || norm(m.provider ?? "").includes(q));
  const exact = catalog.some((m) => norm(m.name) === q);

  const create = () =>
    startTransition(async () => {
      const r = await createMedia({ name: query.trim() });
      if (!r.ok) {
        toast.error("No se pudo crear el medio", { description: r.error });
        return;
      }
      toast.success(r.message ?? "Medio agregado.");
      const media: MediaChannel = {
        id: r.data.id,
        name: r.data.name,
        kind: null,
        provider: null,
        data_mode: "manual",
        integration: null,
        archived_at: null,
        merged_into_id: null,
      };
      onCreated(media);
      onPick(media);
      setQuery("");
      setOpen(false);
    });

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11">
          <Plus aria-hidden /> Agregar medio
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-2">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-soft" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                // Enter elige la primera coincidencia; si no hay ninguna, crea el medio.
                const first = matches.find((m) => !selectedIds.includes(m.id));
                if (first) {
                  onPick(first);
                  setOpen(false);
                } else if (query.trim() && !exact) create();
              }
            }}
            placeholder="Buscar o escribir un medio nuevo"
            aria-label="Buscar medio"
            aria-controls={listId}
            className="min-h-11 pl-8"
          />
        </div>
        <ul id={listId} className="max-h-64 overflow-y-auto" aria-label="Medios del catálogo">
          {matches.map((m) => {
            const taken = selectedIds.includes(m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={taken}
                  onClick={() => {
                    onPick(m);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-2.5 text-left text-sm hover:bg-wash focus-visible:bg-wash focus-visible:outline-2 focus-visible:outline-ink",
                    taken && "cursor-default opacity-60 hover:bg-transparent",
                  )}
                >
                  <span className="min-w-0 truncate">
                    {m.name}
                    {m.provider ? <span className="text-soft"> · {m.provider}</span> : null}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-soft">
                    {taken ? (
                      <>
                        <Check aria-hidden className="size-3.5" /> Ya está
                      </>
                    ) : (
                      MEDIA_DATA_MODE_LABEL[m.data_mode]
                    )}
                  </span>
                </button>
              </li>
            );
          })}
          {!matches.length && !query.trim() ? <li className="px-2.5 py-3 text-sm text-soft">El catálogo está vacío: escriba el nombre del medio.</li> : null}
        </ul>
        {query.trim() && !exact ? (
          <Button type="button" variant="secondary" className="min-h-11 justify-start" disabled={pending} onClick={create}>
            {pending ? <Spinner /> : <Plus aria-hidden />} Crear «{query.trim()}» en el catálogo
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
