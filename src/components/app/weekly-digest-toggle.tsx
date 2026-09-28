"use client";

import { Mail } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { setWeeklyDigest } from "@/server/actions/preferences";

/** Opción del menú de usuario: recibir (o no) el resumen semanal por correo. */
export function WeeklyDigestToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [pending, startTransition] = useTransition();

  function onChange(next: boolean) {
    setEnabled(next);
    startTransition(async () => {
      const r = await setWeeklyDigest(next);
      if (!r.ok) {
        setEnabled(!next);
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "Listo");
    });
  }

  return (
    <DropdownMenuCheckboxItem
      checked={enabled}
      disabled={pending}
      onCheckedChange={(v) => onChange(v === true)}
      onSelect={(e) => e.preventDefault()}
    >
      <Mail className="size-4" aria-hidden /> Recibir el resumen semanal por correo
    </DropdownMenuCheckboxItem>
  );
}
