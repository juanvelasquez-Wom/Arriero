"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, Link2, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { DeleteButton } from "@/components/app/delete-button";
import { applyFieldErrors, FormError, FormField, SubmitButton } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { stageSchema, type StageInput, type StageValues } from "@/lib/validation/structure";
import { createStage, moveStage, updateStage } from "@/server/actions/stages";
import type { Option } from "./metric-form-dialog";

export interface EditorStage {
  id: string;
  name: string;
  description: string | null;
  metric_id: string | null;
}

/** Lista editable de etapas del embudo (orden, nombre, descripción y métrica). */
export function StageEditor({
  programId,
  lineId,
  stages,
  metricOptions,
  canEdit,
  canDelete,
}: {
  programId: string;
  lineId: string;
  stages: EditorStage[];
  metricOptions: Option[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const metricName = new Map(metricOptions.map((m) => [m.id, m.label]));
  return (
    <div className="space-y-3">
      {stages.length ? (
        <ol className="divide-y rounded-xl border">
          {stages.map((s, i) => (
            <StageRow
              key={s.id}
              stage={s}
              index={i}
              count={stages.length}
              programId={programId}
              lineId={lineId}
              metricOptions={metricOptions}
              metricLabel={s.metric_id ? metricName.get(s.metric_id) : undefined}
              reassignOptions={stages.filter((x) => x.id !== s.id).map((x) => ({ id: x.id, label: x.name }))}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          ))}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-soft">
          Sin etapas. Agregue las etapas del recorrido del cliente en esta línea (p. ej. Adquisición, Activación, Conversión, y
          Recuperación y recurrencia).
        </p>
      )}
      {canEdit ? (
        <StageFormDialog
          programId={programId}
          lineId={lineId}
          metricOptions={metricOptions}
          trigger={
            <Button variant="outline" size="sm">
              <Plus aria-hidden /> Agregar etapa
            </Button>
          }
        />
      ) : null}
    </div>
  );
}

function StageRow({
  stage,
  index,
  count,
  programId,
  lineId,
  metricOptions,
  metricLabel,
  reassignOptions,
  canEdit,
  canDelete,
}: {
  stage: EditorStage;
  index: number;
  count: number;
  programId: string;
  lineId: string;
  metricOptions: Option[];
  metricLabel?: string;
  reassignOptions: Option[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function move(direction: "up" | "down") {
    startTransition(async () => {
      const r = await moveStage(programId, { id: stage.id, direction });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-start gap-3 px-3 py-2.5">
      <span
        aria-hidden
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-gray-1 text-xs font-semibold tabular-nums"
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">
          <span className="sr-only">Etapa {index + 1}: </span>
          {stage.name}
        </div>
        <p className="text-xs text-soft">{stage.description ?? "Sin descripción de qué significa en esta línea."}</p>
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-soft">
          <Link2 aria-hidden className="size-3" />
          {metricLabel ?? "Sin métrica vinculada"}
        </p>
      </div>
      {canEdit ? (
        <div className="flex shrink-0 items-center gap-0.5">
          {pending ? <Spinner className="mr-1" /> : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Subir ${stage.name}`}
            title="Subir"
            disabled={index === 0 || pending}
            onClick={() => move("up")}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Bajar ${stage.name}`}
            title="Bajar"
            disabled={index === count - 1 || pending}
            onClick={() => move("down")}
          >
            <ArrowDown aria-hidden />
          </Button>
          <StageFormDialog
            programId={programId}
            lineId={lineId}
            stage={stage}
            metricOptions={metricOptions}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`Editar ${stage.name}`} title="Editar">
                <Pencil aria-hidden />
              </Button>
            }
          />
          {canDelete ? (
            <DeleteButton
              entity="stage"
              id={stage.id}
              programId={programId}
              name={stage.name}
              reassignOptions={reassignOptions}
              variant="ghost"
              iconOnly
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function StageFormDialog({
  programId,
  lineId,
  stage,
  metricOptions,
  trigger,
}: {
  programId: string;
  lineId: string;
  stage?: EditorStage;
  metricOptions: Option[];
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const idp = `stage-${stage?.id ?? "new"}`;
  const defaults = (): StageInput => ({
    line_id: lineId,
    name: stage?.name ?? "",
    description: stage?.description ?? "",
    metric_id: stage?.metric_id ?? "none",
  });
  const form = useForm<StageInput, unknown, StageValues>({ resolver: zodResolver(stageSchema), defaultValues: defaults() });
  const { errors } = form.formState;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(undefined);
      form.reset(defaults());
    }
  }

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    startTransition(async () => {
      const input = { ...values, line_id: lineId };
      const result = stage ? await updateStage(programId, stage.id, input) : await createStage(programId, input);
      if (!result.ok) {
        setError(result.error);
        applyFieldErrors(result.fieldErrors, form.setError);
        return;
      }
      toast.success(result.message ?? "¡Eso! Guardado");
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{stage ? `Editar etapa “${stage.name}”` : "Nueva etapa del embudo"}</DialogTitle>
          <DialogDescription>
            Las etapas ordenan el recorrido del cliente. Cada oportunidad de mejora se ubica en una etapa.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup className="gap-4">
            <FormError message={error} />
            <FormField id={`${idp}-name`} label="Nombre" required error={errors.name?.message}>
              <Input
                id={`${idp}-name`}
                autoFocus
                placeholder="Ej. Activación"
                aria-invalid={!!errors.name}
                {...form.register("name")}
              />
            </FormField>
            <FormField
              id={`${idp}-description`}
              label="Qué significa en esta línea"
              description="Ej. El cliente inició el chat y dejó sus datos."
              error={errors.description?.message}
            >
              <Textarea id={`${idp}-description`} rows={3} {...form.register("description")} />
            </FormField>
            <FormField
              id={`${idp}-metric`}
              label="Métrica vinculada"
              description="La métrica del árbol que mide esta etapa."
              error={errors.metric_id?.message}
            >
              <Controller
                control={form.control}
                name="metric_id"
                render={({ field }) => (
                  <Select value={field.value || "none"} onValueChange={field.onChange}>
                    <SelectTrigger id={`${idp}-metric`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin métrica vinculada</SelectItem>
                      {metricOptions.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <SubmitButton pending={pending}>{stage ? "Guardar cambios" : "Crear etapa"}</SubmitButton>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
