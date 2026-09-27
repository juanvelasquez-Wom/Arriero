"use client";

import { GitMerge } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Callout } from "@/components/app/page";
import { FormError, FormField } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { mergeMedia } from "@/server/actions/pilots";
import type { MediaChannel } from "@/server/queries/pilots";

/** Fusionar un medio duplicado en otro (solo aprobadores). */
export function MergeMediaDialog({ media }: { media: MediaChannel[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [into, setInto] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const active = media.filter((m) => !m.archived_at && !m.merged_into_id);
  const fromName = active.find((m) => m.id === from)?.name;
  const intoName = active.find((m) => m.id === into)?.name;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setFrom("");
      setInto("");
      setError(undefined);
    }
  }

  function submit() {
    if (!from || !into) {
      setError("Elija el duplicado y el medio que se queda.");
      return;
    }
    if (from === into) {
      setError("Elija dos medios distintos.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const r = await mergeMedia(from, into);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(r.message ?? "Medios fusionados.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={active.length < 2}>
          <GitMerge aria-hidden /> Fusionar duplicado
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fusionar un medio duplicado</DialogTitle>
          <DialogDescription>
            Los pilotos y las métricas propias del duplicado pasan al medio que se queda. El duplicado queda archivado como «fusionado».
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4">
          <FormError message={error} />
          <FormField id="merge-from" label="Duplicado (se archiva)" required>
            <Select value={from || undefined} onValueChange={setFrom}>
              <SelectTrigger id="merge-from" className="w-full">
                <SelectValue placeholder="Elija el duplicado" />
              </SelectTrigger>
              <SelectContent>
                {active.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="merge-into" label="Medio que se queda" required>
            <Select value={into || undefined} onValueChange={setInto}>
              <SelectTrigger id="merge-into" className="w-full">
                <SelectValue placeholder="Elija el destino" />
              </SelectTrigger>
              <SelectContent>
                {active
                  .filter((m) => m.id !== from)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FormField>
          {fromName && intoName ? (
            <Callout tone="neutral" icon={GitMerge}>
              Todo lo de «{fromName}» queda en «{intoName}». No se puede deshacer desde aquí.
            </Callout>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? <Spinner /> : null}
            Fusionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
