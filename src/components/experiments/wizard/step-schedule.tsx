"use client";

import { Snowflake } from "lucide-react";
import { FormField } from "@/components/app/form";
import { Term } from "@/components/app/info-tip";
import { Callout } from "@/components/app/page";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calendarFitMessage, inferOwnerType, type CalendarFit } from "@/domain/experiment-inference";
import { OWNER_TYPE_LABEL, ROLE_LABEL } from "@/domain/labels";
import { OWNER_TYPES, type OwnerType, type ProgramRole } from "@/domain/types";
import type { WizardData, WizardValues } from "../wizard-values";
import type { SetField, SetValues } from "./shared";

/** Paso 5 · Responsable y fechas. */
export function StepSchedule({
  data,
  v,
  set,
  setV,
  errors,
  fit,
  freeze,
  ownerTypeOpen,
  onOpenOwnerType,
  roleOf,
}: {
  data: WizardData;
  v: WizardValues;
  set: SetField;
  setV: SetValues;
  errors: Record<string, string>;
  fit: CalendarFit;
  freeze: string | null;
  ownerTypeOpen: boolean;
  onOpenOwnerType: () => void;
  roleOf: (uid: string | null) => ProgramRole | null;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          id="owner_id"
          label="Responsable"
          description={data.canScore ? "Quién ejecuta y reporta el ejercicio." : "La agencia queda como responsable de lo que crea."}
        >
          <Select
            value={v.owner_id ?? undefined}
            onValueChange={(uid) => {
              const inferred = inferOwnerType(roleOf(uid));
              setV((prev) => ({
                ...prev,
                owner_id: uid,
                owner_type: ownerTypeOpen ? (prev.owner_type ?? inferred) : inferred,
              }));
            }}
            disabled={!data.canScore}
          >
            <SelectTrigger id="owner_id" className="w-full">
              <SelectValue placeholder="Elija a una persona del programa" />
            </SelectTrigger>
            <SelectContent>
              {data.members
                .filter((m) => m.role !== "viewer")
                .map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.name} · {ROLE_LABEL[m.role]}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </FormField>
        {ownerTypeOpen ? (
          <FormField id="owner_type" label="Tipo de responsable">
            <Select value={v.owner_type ?? undefined} onValueChange={(t) => set("owner_type", t as OwnerType)} disabled={!data.canScore}>
              <SelectTrigger id="owner_type" className="w-full">
                <SelectValue placeholder="Interno, agencia o mixto" />
              </SelectTrigger>
              <SelectContent>
                {OWNER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {OWNER_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        ) : (
          <div className="space-y-1">
            <div className="text-sm font-medium">Tipo de responsable</div>
            <p className="flex h-9 items-center text-sm">
              {v.owner_type ? OWNER_TYPE_LABEL[v.owner_type] : <span className="text-soft">Se deduce al elegir el responsable</span>}
              {data.canScore ? (
                <button type="button" className="ml-2 text-xs text-soft underline underline-offset-2 hover:text-ink" onClick={onOpenOwnerType}>
                  Cambiar
                </button>
              ) : null}
            </p>
            <p className="text-xs text-soft">Sale del rol en el programa (agencia o equipo interno). Cámbielo si es mixto.</p>
          </div>
        )}
        <FormField id="planned_start" label="Inicio planeado">
          <Input id="planned_start" type="date" value={v.planned_start} onChange={(e) => set("planned_start", e.target.value)} />
        </FormField>
        <FormField id="planned_end" label="Fin planeado" error={errors.planned_end}>
          <Input id="planned_end" type="date" value={v.planned_end} onChange={(e) => set("planned_end", e.target.value)} />
        </FormField>
      </div>
      {!v.fits_calendar_override && fit.fits !== null ? (
        <p className="text-xs text-soft" aria-live="polite">
          <Term k="calendarFit">Filtro de calendario</Term>: {calendarFitMessage(fit, data.scoring.calendar_bonus)}
        </p>
      ) : null}
      {freeze ? (
        <Callout icon={Snowflake} title="Cruce con congelamiento">
          {freeze} Si la fecha de inicio cae dentro de un congelamiento, no se podrá pasar a En prueba salvo que el owner lo fuerce con una
          justificación.
        </Callout>
      ) : null}
    </div>
  );
}
