"use client";

import { Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { savePilotLinks } from "@/server/actions/pilots";
import type { LinkOptions, PilotMember } from "@/server/queries/pilots";

export interface PilotLinksValue {
  owner_id: string | null;
  program_id: string | null;
  experiment_id: string | null;
  tree_metric_id: string | null;
}

const NONE = "none";

export function sameLinks(a: PilotLinksValue, b: PilotLinksValue) {
  return a.owner_id === b.owner_id && a.program_id === b.program_id && a.experiment_id === b.experiment_id && a.tree_metric_id === b.tree_metric_id;
}

/** Personas que pueden ser responsables: creadores, aprobadores y admins. */
export function ownerCandidates(members: PilotMember[]) {
  return members.filter((m) => m.is_admin || m.role === "approver" || m.role === "creator");
}

/**
 * Responsable y vínculos opcionales con Arriero (programa, ejercicio y métrica
 * del árbol). Solo aparecen los programas que la persona ya puede ver.
 */
export function LinksFields({
  idPrefix,
  value,
  onChange,
  options,
  members,
  showOwner = true,
}: {
  idPrefix: string;
  value: PilotLinksValue;
  onChange: (value: PilotLinksValue) => void;
  options: LinkOptions;
  members: PilotMember[];
  showOwner?: boolean;
}) {
  const owners = ownerCandidates(members);
  const experiments = options.experiments.filter((e) => !value.program_id || e.program_id === value.program_id);
  const metrics = options.metrics.filter((m) => !value.program_id || m.program_id === value.program_id);
  const metricsByLine = [...new Set(metrics.map((m) => m.line_name))].map((line) => ({ line, items: metrics.filter((m) => m.line_name === line) }));
  const programName = (id: string) => options.programs.find((p) => p.id === id)?.name ?? "";

  const setProgram = (program_id: string | null) => {
    const keepExperiment = value.experiment_id && options.experiments.find((e) => e.id === value.experiment_id)?.program_id === program_id;
    const keepMetric = value.tree_metric_id && options.metrics.find((m) => m.id === value.tree_metric_id)?.program_id === program_id;
    onChange({
      ...value,
      program_id,
      experiment_id: keepExperiment ? value.experiment_id : null,
      tree_metric_id: keepMetric ? value.tree_metric_id : null,
    });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {showOwner ? (
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-owner`}>Responsable</Label>
          <Select value={value.owner_id ?? NONE} onValueChange={(v) => onChange({ ...value, owner_id: v === NONE ? null : v })}>
            <SelectTrigger id={`${idPrefix}-owner`} className="min-h-11 w-full">
              <SelectValue placeholder="Elija quién responde por el piloto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sin responsable</SelectItem>
              {owners.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-program`}>Programa</Label>
        <Select value={value.program_id ?? NONE} onValueChange={(v) => setProgram(v === NONE ? null : v)}>
          <SelectTrigger id={`${idPrefix}-program`} className="min-h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sin programa</SelectItem>
            {options.programs.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-experiment`}>Ejercicio</Label>
        <Select
          value={value.experiment_id ?? NONE}
          onValueChange={(v) => {
            const e = options.experiments.find((x) => x.id === v);
            onChange({ ...value, experiment_id: v === NONE ? null : v, program_id: e ? e.program_id : value.program_id });
          }}
        >
          <SelectTrigger id={`${idPrefix}-experiment`} className="min-h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sin ejercicio</SelectItem>
            {experiments.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.title}
                {!value.program_id ? <span className="text-soft"> · {programName(e.program_id)}</span> : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-metric`}>Métrica del árbol</Label>
        <Select
          value={value.tree_metric_id ?? NONE}
          onValueChange={(v) => {
            const m = options.metrics.find((x) => x.id === v);
            onChange({ ...value, tree_metric_id: v === NONE ? null : v, program_id: m ? m.program_id : value.program_id });
          }}
        >
          <SelectTrigger id={`${idPrefix}-metric`} className="min-h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sin métrica del árbol</SelectItem>
            {metricsByLine.map((g) => (
              <SelectGroup key={g.line || "sin-linea"}>
                <SelectLabel>{g.line || "Sin línea"}</SelectLabel>
                {g.items.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** Vínculos editables fuera del asistente (ficha del piloto). */
export function LinksEditor({
  pilotId,
  initial,
  options,
  members,
  onDone,
}: {
  pilotId: string;
  initial: PilotLinksValue;
  options: LinkOptions;
  members: PilotMember[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const dirty = !sameLinks(value, initial);

  return (
    <div className="space-y-4">
      <FormError message={error} />
      <LinksFields idPrefix={`links-${pilotId}`} value={value} onChange={setValue} options={options} members={members} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!dirty || pending}
          className="min-h-11"
          onClick={() =>
            startTransition(async () => {
              setError(undefined);
              const r = await savePilotLinks(pilotId, value);
              if (!r.ok) {
                setError(r.error);
                return;
              }
              toast.success(r.message ?? "Vínculos guardados.");
              onDone?.();
              router.refresh();
            })
          }
        >
          {pending ? <Spinner /> : <Link2 aria-hidden />}
          Guardar vínculos
        </Button>
        {onDone ? (
          <Button type="button" variant="ghost" className="min-h-11" onClick={onDone}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
