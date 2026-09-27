"use client";

import { Ban, ListChecks, UserRoundCog, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { bulkSummary, type BulkAction, type BulkItemResult } from "@/domain/home";
import { bulkAssign, bulkTransition } from "@/server/actions/bulk";

interface SelectionState {
  selected: Set<string>;
  toggle: (id: string, on: boolean) => void;
  setMany: (ids: string[], on: boolean) => void;
  clear: () => void;
}

const SelectionContext = createContext<SelectionState | null>(null);

function useSelection(): SelectionState | null {
  return useContext(SelectionContext);
}

/** Envuelve la tabla y las tarjetas del backlog para seleccionar varios ejercicios. */
export function BacklogSelection({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const value = useMemo<SelectionState>(
    () => ({
      selected,
      toggle: (id, on) =>
        setSelected((s) => {
          const next = new Set(s);
          if (on) next.add(id);
          else next.delete(id);
          return next;
        }),
      setMany: (ids, on) =>
        setSelected((s) => {
          const next = new Set(s);
          for (const id of ids) {
            if (on) next.add(id);
            else next.delete(id);
          }
          return next;
        }),
      clear: () => setSelected(new Set()),
    }),
    [selected],
  );
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function RowCheckbox({ id, title }: { id: string; title: string }) {
  const sel = useSelection();
  if (!sel) return null;
  return (
    <Checkbox
      aria-label={`Seleccionar ${title}`}
      checked={sel.selected.has(id)}
      onCheckedChange={(v) => sel.toggle(id, v === true)}
    />
  );
}

export function SelectAllCheckbox({ ids, label = "Seleccionar todos los visibles" }: { ids: string[]; label?: string }) {
  const sel = useSelection();
  if (!sel || !ids.length) return null;
  const count = ids.filter((id) => sel.selected.has(id)).length;
  const checked = count === 0 ? false : count === ids.length ? true : "indeterminate";
  return <Checkbox aria-label={label} checked={checked} onCheckedChange={(v) => sel.setMany(ids, v === true)} />;
}

/** Barra fija de acciones en lote: aparece cuando hay algo seleccionado. */
export function BulkActionBar({
  programId,
  visibleIds,
  members,
}: {
  programId: string;
  visibleIds: string[];
  members: { id: string; label: string }[];
}) {
  const sel = useSelection();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [owner, setOwner] = useState<string>("");
  if (!sel) return null;
  // Solo cuenta lo que se ve: un filtro nuevo no arrastra selecciones ocultas.
  const ids = visibleIds.filter((id) => sel.selected.has(id));
  if (!ids.length) return null;

  function report(action: BulkAction, results: BulkItemResult[]) {
    const { tone, text } = bulkSummary(action, results);
    if (tone === "success") toast.success(text);
    else if (tone === "mixed") toast.warning(text);
    else toast.error(text);
    sel!.setMany(
      results.filter((r) => r.ok).map((r) => r.id),
      false,
    );
    router.refresh();
  }

  function run(action: BulkAction): Promise<string | void> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const r =
          action === "assigned"
            ? await bulkAssign({ programId, ids, ownerId: owner === "none" ? null : owner })
            : await bulkTransition({ programId, ids, to: action });
        if (!r.ok) {
          toast.error(r.error);
          resolve(r.error);
          return;
        }
        report(action, r.data.results);
        resolve();
      });
    });
  }

  return (
    <div
      role="region"
      aria-label="Acciones en lote"
      className="sticky bottom-0 z-20 -mx-4 mt-3 border-t bg-paper/95 px-4 py-3 shadow-card backdrop-blur lg:-mx-8 lg:px-8"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 inline-flex items-center gap-1.5 text-sm font-medium tabular-nums">
          <ListChecks aria-hidden className="size-4" />
          {ids.length === 1 ? "1 seleccionado" : `${ids.length} seleccionados`}
        </span>
        <Button size="sm" disabled={pending} onClick={() => void run("prioritized")}>
          {pending ? <Spinner /> : null} Priorizar
        </Button>
        <ConfirmAction
          title={ids.length === 1 ? "¿Descartar 1 ejercicio?" : `¿Descartar ${ids.length} ejercicios?`}
          description="Un ejercicio descartado ya no vuelve al backlog. Solo se descartan los que están en Idea, Priorizado o En diseño."
          confirmLabel="Descartar"
          onConfirm={() => run("discarded")}
          disabled={pending}
        >
          <Button size="sm" variant="outline" disabled={pending}>
            <Ban aria-hidden /> Descartar
          </Button>
        </ConfirmAction>
        <div className="flex items-center gap-1">
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger size="sm" className="w-48" aria-label="Asignar a">
              <SelectValue placeholder="Asignar a…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin responsable</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={pending || !owner} onClick={() => void run("assigned")}>
            <UserRoundCog aria-hidden /> Asignar
          </Button>
        </div>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => sel.clear()} disabled={pending}>
          <X aria-hidden /> Quitar selección
        </Button>
      </div>
    </div>
  );
}
