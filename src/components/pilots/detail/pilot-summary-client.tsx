"use client";

import { CircleCheck, CircleDashed, CircleX, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { todayIso } from "@/domain/dates";
import { IMPACT_LABEL } from "@/domain/labels";
import { CHECKLIST_STATUS_LABEL } from "@/domain/pilots/labels";
import type { ChecklistStatus } from "@/domain/pilots/types";
import { IMPACT_LEVELS, type ImpactLevel } from "@/domain/types";
import { cn } from "@/lib/utils";
import { logIncident, setChecklistStatus } from "@/server/actions/pilots";

const STATUS_ICON = { pending: CircleDashed, ok: CircleCheck, failed: CircleX } as const;

/** Verificar un evento de la lista de chequeo: Por verificar / Dispara bien / No dispara. */
export function ChecklistStatusControl({
  pilotId,
  itemId,
  status,
  evidence,
}: {
  pilotId: string;
  itemId: string;
  status: ChecklistStatus;
  evidence: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState(evidence ?? "");

  const save = (next: ChecklistStatus) =>
    start(async () => {
      const r = await setChecklistStatus(pilotId, itemId, { status: next, evidence: note });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      router.refresh();
    });

  return (
    <div className="mt-2 space-y-2">
      <div role="group" aria-label="Estado del evento" className="flex flex-wrap gap-1.5">
        {(Object.keys(STATUS_ICON) as ChecklistStatus[]).map((s) => {
          const Icon = STATUS_ICON[s];
          const active = s === status;
          return (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => save(s)}
              aria-pressed={active}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                active ? (s === "ok" ? "border-highlight bg-highlight text-[#1f1f1f]" : "border-ink bg-ink text-paper") : "border-line bg-paper text-soft hover:text-ink",
              )}
            >
              <Icon aria-hidden className="size-3.5" />
              {CHECKLIST_STATUS_LABEL[s]}
            </button>
          );
        })}
        {pending ? <Spinner /> : null}
      </div>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (evidence ?? "") && save(status)}
        placeholder="Evidencia: dónde lo verificó (Events Manager, DebugView, vista previa de GTM…)"
        aria-label="Evidencia de la verificación"
        className="h-9 text-sm"
      />
    </div>
  );
}

/** Registrar un incidente durante la ejecución. */
export function IncidentForm({ pilotId, minDate }: { pilotId: string; minDate: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [impact, setImpact] = useState<ImpactLevel>("low");

  if (!open) {
    return (
      <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Registrar incidente
      </Button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-xl border bg-wash/60 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(undefined);
          const r = await logIncident(pilotId, { occurred_on: date, description, expected_impact: impact });
          if (!r.ok) return setError(r.error);
          toast.success(r.message);
          setOpen(false);
          setDescription("");
          router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="incident-date">Fecha</Label>
          <Input id="incident-date" type="date" value={date} min={minDate ?? undefined} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="incident-impact">Impacto esperado en la lectura</Label>
          <Select value={impact} onValueChange={(v) => setImpact(v as ImpactLevel)}>
            <SelectTrigger id="incident-impact" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMPACT_LEVELS.map((i) => (
                <SelectItem key={i} value={i}>
                  {IMPACT_LABEL[i]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="incident-description">¿Qué pasó?</Label>
        <Textarea
          id="incident-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Ej.: Meta pausó la variante medio día por revisión de política."
        />
      </div>
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11" disabled={pending || description.trim().length < 5}>
          {pending ? <Spinner /> : null} Guardar incidente
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
