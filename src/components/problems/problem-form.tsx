"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Paperclip, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { uploadAttachments } from "@/components/app/attachments";
import { applyFieldErrors, FormError, FormField, SubmitButton } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CONTROL_LABEL, IMPACT_LABEL, PROBLEM_STATUS_LABEL } from "@/domain/labels";
import { CONTROL_LEVELS, IMPACT_LEVELS, PROBLEM_STATUSES } from "@/domain/types";
import { ATTACHMENT_ACCEPT, validateAttachment } from "@/lib/validation/problems";
import { problemSchema, type ProblemInput } from "@/lib/validation/problems";
import { createProblem, updateProblem } from "@/server/actions/problems";

interface Option {
  id: string;
  name: string;
}

export function ProblemForm({
  programId,
  lines,
  stages,
  problemId,
  defaults,
  defaultLineId,
  onDone,
}: {
  programId: string;
  lines: Option[];
  stages: (Option & { line_id: string })[];
  problemId?: string;
  defaults?: ProblemInput;
  defaultLineId?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const initialLine =
    (defaults && stages.find((s) => s.id === defaults.stage_id)?.line_id) ?? defaultLineId ?? lines[0]?.id ?? "";
  const [lineId, setLineId] = useState(initialLine);
  const form = useForm<ProblemInput>({
    resolver: zodResolver(problemSchema),
    defaultValues: defaults ?? {
      stage_id: "",
      channel: "",
      title: "",
      evidence: "",
      root_cause: "",
      impact: "medium",
      control: "ours",
      status: "to_validate",
    },
  });
  const { errors } = form.formState;
  const lineStages = stages.filter((s) => s.line_id === lineId);

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    startTransition(async () => {
      if (problemId) {
        const r = await updateProblem(programId, problemId, values);
        if (!r.ok) {
          setError(r.error);
          applyFieldErrors(r.fieldErrors, form.setError);
          return;
        }
        toast.success("Problema actualizado");
        onDone?.();
        router.refresh();
        return;
      }
      const r = await createProblem(programId, values);
      if (!r.ok) {
        setError(r.error);
        applyFieldErrors(r.fieldErrors, form.setError);
        return;
      }
      if (files.length) {
        const up = await uploadAttachments(programId, "problem", r.data.id, files);
        for (const e of up.errors) toast.error(e);
      }
      toast.success("Problema creado");
      router.push(`/programas/${programId}/problemas/${r.data.id}`);
    });
  });

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: File[] = [];
    for (const f of Array.from(list)) {
      const invalid = validateAttachment(f);
      if (invalid) toast.error(invalid);
      else next.push(f);
    }
    setFiles((prev) => [...prev, ...next]);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="line" label="Línea" required>
            <Select
              value={lineId}
              onValueChange={(v) => {
                setLineId(v);
                form.setValue("stage_id", "");
              }}
              disabled={!!problemId}
            >
              <SelectTrigger id="line" className="w-full">
                <SelectValue placeholder="Elige la línea" />
              </SelectTrigger>
              <SelectContent>
                {lines.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="stage_id" label="Etapa del embudo" required error={errors.stage_id?.message}>
            <Controller
              control={form.control}
              name="stage_id"
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger id="stage_id" className="w-full" aria-invalid={!!errors.stage_id}>
                    <SelectValue placeholder="Dónde se pierde valor" />
                  </SelectTrigger>
                  <SelectContent>
                    {lineStages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField id="channel" label="Canal" error={errors.channel?.message}>
            <Input id="channel" placeholder="WhatsApp, eCommerce…" {...form.register("channel")} />
          </FormField>
        </div>

        <FormField id="title" label="Problema" required description="Qué pasa, en una frase." error={errors.title?.message}>
          <Input id="title" placeholder="El costo por conversación subió 35% en seis semanas." {...form.register("title")} />
        </FormField>
        <FormField
          id="evidence"
          label="Evidencia"
          required
          description="Datos que muestran el problema. Nada de nice to try."
          error={errors.evidence?.message}
        >
          <Textarea id="evidence" rows={3} {...form.register("evidence")} />
        </FormField>
        <FormField id="root_cause" label="Causa raíz hipotética" error={errors.root_cause?.message}>
          <Textarea id="root_cause" rows={2} {...form.register("root_cause")} />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["impact", "Impacto estimado", IMPACT_LEVELS, IMPACT_LABEL],
              ["control", "Control", CONTROL_LEVELS, CONTROL_LABEL],
              ["status", "Estado", PROBLEM_STATUSES, PROBLEM_STATUS_LABEL],
            ] as const
          ).map(([name, label, values, labels]) => (
            <FormField key={name} id={name} label={label}>
              <Controller
                control={form.control}
                name={name}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id={name} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {values.map((v) => (
                        <SelectItem key={v} value={v}>
                          {(labels as Record<string, string>)[v]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
          ))}
        </div>

        {!problemId ? (
          <div>
            <div className="text-sm font-medium">Adjuntos</div>
            <p className="text-xs text-soft">PDF, imágenes, CSV o XLSX · máximo 20 MB por archivo.</p>
            {files.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                    <Paperclip className="size-3.5" aria-hidden /> {f.name}
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Quitar ${f.name}`}
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="sr-only"
              onChange={(e) => addFiles(e.target.files)}
              aria-label="Elegir archivos"
            />
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => fileInput.current?.click()}>
              <Paperclip aria-hidden /> Agregar archivos
            </Button>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          {onDone ? (
            <Button type="button" variant="outline" onClick={onDone}>
              Cancelar
            </Button>
          ) : null}
          <SubmitButton pending={pending}>{problemId ? "Guardar cambios" : "Crear problema"}</SubmitButton>
        </div>
      </FieldGroup>
    </form>
  );
}
