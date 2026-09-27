"use client";

import { ChevronDown, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PilotStatusBadge } from "@/components/pilots/pilot-badges";
import { formatDateTime } from "@/domain/format";
import type { PilotStatus } from "@/domain/pilots/types";
import { cn } from "@/lib/utils";
import { restorePilot } from "@/server/actions/pilots";

export interface DeletedPilotItem {
  id: string;
  title: string;
  status: PilotStatus;
  deleted_at: string;
}

/** Pilotos borrados (solo aprobadores): plegable con "Restaurar". */
export function DeletedPilots({ items }: { items: DeletedPilotItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function restore(item: DeletedPilotItem) {
    setBusy(item.id);
    startTransition(async () => {
      const r = await restorePilot(item.id);
      setBusy(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`«${item.title}» volvió al portafolio.`);
      router.refresh();
    });
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-10">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="-ml-2">
          <ChevronDown aria-hidden className={cn("transition-transform", open && "rotate-180")} />
          Pilotos borrados ({items.length})
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="mt-1 text-xs text-soft">Solo los ve un aprobador. Al restaurarlos vuelven con todo lo que tenían.</p>
        <ul className="mt-3 divide-y rounded-2xl border bg-paper shadow-card">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="font-semibold">{item.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-soft">
                  <PilotStatusBadge status={item.status} className="h-5 px-1.5 text-[11px]" />
                  Borrado {formatDateTime(item.deleted_at)}
                </div>
              </div>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => restore(item)}>
                <RotateCcw aria-hidden className={cn(busy === item.id && "animate-spin")} /> Restaurar
              </Button>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
