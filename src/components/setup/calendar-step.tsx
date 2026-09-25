"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarClock, Flag, Pencil, Plus, Snowflake } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { DeleteButton } from "@/components/app/delete-button";
import { applyFieldErrors, FormError, FormField, SubmitButton } from "@/components/app/form";
import { EmptyState } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CALENDAR_EVENT_LABEL } from "@/domain/labels";
import { formatDate, formatDateRange } from "@/domain/format";
import { CALENDAR_EVENT_TYPES, type CalendarEvent } from "@/domain/types";
import { calendarEventSchema, type CalendarEventInput } from "@/lib/validation/programs";
import { advanceSetup, saveCalendarEvent } from "@/server/actions/programs";

const ICON = { peak: CalendarClock, freeze: Snowflake, decision: Flag };

export function CalendarStep({
  programId,
  events,
  canEdit,
  showNav = true,
}: {
  programId: string;
  events: CalendarEvent[];
  canEdit: boolean;
  showNav?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const empty: CalendarEventInput = { type: "freeze", name: "", start_date: "", end_date: "" };
  const form = useForm<CalendarEventInput>({ resolver: zodResolver(calendarEventSchema), defaultValues: empty });
  const type = useWatch({ control: form.control, name: "type" });
  const startDate = useWatch({ control: form.control, name: "start_date" });
  const { errors } = form.formState;

  // El punto de decisión es un solo día.
  useEffect(() => {
    if (type === "decision") form.setValue("end_date", startDate);
  }, [type, startDate, form]);

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    const payload = values.type === "decision" ? { ...values, end_date: values.start_date } : values;
    startTransition(async () => {
      const r = await saveCalendarEvent(programId, editing?.id ?? null, payload);
      if (!r.ok) {
        setError(r.error);
        applyFieldErrors(r.fieldErrors, form.setError);
        return;
      }
      toast.success(editing ? "Evento actualizado" : "Evento agregado");
      setEditing(null);
      form.reset(empty);
      router.refresh();
    });
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-soft">
        <strong className="text-ink">Picos</strong>: fechas comerciales fuertes. <strong className="text-ink">Congelamientos</strong>: no se
        lanzan ejercicios (la app advierte al planear y bloquea el paso a En prueba). <strong className="text-ink">Punto de decisión</strong>:
        fecha formal para decidir qué se escala.
      </p>

      {events.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Sin eventos en el calendario"
          description="Agrega los picos comerciales, sus congelamientos y el punto de decisión para que la priorización y el Gantt los tengan en cuenta."
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-paper">
          {events.map((e) => {
            const Icon = ICON[e.type];
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <Icon aria-hidden className="size-4" />
                <span className="font-medium">{e.name}</span>
                <span className="text-xs text-soft">
                  {CALENDAR_EVENT_LABEL[e.type]} ·{" "}
                  {e.type === "decision" ? formatDate(e.start_date) : formatDateRange(e.start_date, e.end_date)}
                </span>
                <span className="flex-1" />
                {canEdit ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(e);
                        form.reset({ type: e.type, name: e.name, start_date: e.start_date, end_date: e.end_date });
                      }}
                    >
                      <Pencil aria-hidden /> Editar
                    </Button>
                    <DeleteButton entity="calendar_event" id={e.id} programId={programId} name={e.name} variant="ghost" />
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        <form onSubmit={onSubmit} noValidate className="rounded-xl border bg-paper p-4">
          <h3 className="mb-3 text-sm font-semibold">{editing ? `Editar “${editing.name}”` : "Nuevo evento"}</h3>
          <FormError message={error} className="mb-3" />
          <div className="grid gap-3 sm:grid-cols-[180px_1fr_160px_160px]">
            <FormField id="ev-type" label="Tipo" error={errors.type?.message}>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="ev-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CALENDAR_EVENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {CALENDAR_EVENT_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField id="ev-name" label="Nombre" error={errors.name?.message}>
              <Input id="ev-name" placeholder="Congelamiento Black Friday" {...form.register("name")} />
            </FormField>
            <FormField id="ev-start" label={type === "decision" ? "Fecha" : "Desde"} error={errors.start_date?.message}>
              <Input id="ev-start" type="date" {...form.register("start_date")} />
            </FormField>
            {type !== "decision" ? (
              <FormField id="ev-end" label="Hasta" error={errors.end_date?.message}>
                <Input id="ev-end" type="date" {...form.register("end_date")} />
              </FormField>
            ) : null}
          </div>
          <div className="mt-3 flex gap-2">
            <SubmitButton pending={pending} variant="outline" size="sm">
              {editing ? null : <Plus aria-hidden />}
              {editing ? "Guardar cambios" : "Agregar evento"}
            </SubmitButton>
            {editing ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(null);
                  form.reset(empty);
                }}
              >
                Cancelar
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}

      {showNav ? (
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => router.push(`/programas/${programId}/configuracion?paso=2`)}>
            Anterior
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await advanceSetup(programId, 3);
                router.push(`/programas/${programId}/configuracion?paso=4`);
              })
            }
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </div>
  );
}
