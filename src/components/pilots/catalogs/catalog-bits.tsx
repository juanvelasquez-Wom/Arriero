"use client";

import { Archive, ArchiveRestore, CircleCheck, GitMerge } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ActionResult } from "@/lib/action-result";

/** Archivar o devolver al catálogo (reversible, sin confirmación). */
export function ArchiveButton({
  archived,
  name,
  onToggle,
}: {
  archived: boolean;
  name: string;
  onToggle: (archive: boolean) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label={`${archived ? "Restaurar" : "Archivar"} ${name}`}
      onClick={() =>
        startTransition(async () => {
          const r = await onToggle(!archived);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success(r.message ?? "Listo.");
          router.refresh();
        })
      }
    >
      {pending ? <Spinner /> : archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
      {archived ? "Restaurar" : "Archivar"}
    </Button>
  );
}

/** Estado de un elemento del catálogo: activo, archivado o fusionado en otro. */
export function CatalogStateBadge({ archived, mergedInto }: { archived: boolean; mergedInto?: string | null }) {
  if (mergedInto) {
    return (
      <span className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-gray-4 px-2 text-xs text-soft">
        <GitMerge aria-hidden className="size-3.5" /> Fusionado en {mergedInto}
      </span>
    );
  }
  if (archived) {
    return (
      <span className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-gray-3 px-2 text-xs text-soft">
        <Archive aria-hidden className="size-3.5" /> Archivado
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full border border-line bg-paper px-2 text-xs">
      <CircleCheck aria-hidden className="size-3.5 text-soft" /> Activo
    </span>
  );
}

export const NONE = "__none__";
