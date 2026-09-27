"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyFieldErrors, FormError, FormField, SubmitButton } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { mediaSchema, type MediaInput } from "@/lib/validation/pilots";
import { createMedia, updateMedia } from "@/server/actions/pilots";
import type { MediaChannel } from "@/server/queries/pilots";

/** Crear (creadores y aprobadores) o editar (aprobadores) un medio del catálogo. */
export function MediaFormDialog({ media, trigger }: { media?: MediaChannel; trigger: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const idp = `media-${media?.id ?? "new"}`;
  const defaults = (): MediaInput => ({ name: media?.name ?? "", kind: media?.kind ?? "", provider: media?.provider ?? "" });
  const form = useForm<MediaInput, unknown, z.output<typeof mediaSchema>>({ resolver: zodResolver(mediaSchema), defaultValues: defaults() });
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
      const r = media ? await updateMedia(media.id, values) : await createMedia(values);
      if (!r.ok) {
        setError(r.error);
        applyFieldErrors(r.fieldErrors, form.setError);
        return;
      }
      toast.success(r.message ?? "¡Eso! Guardado");
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{media ? `Editar «${media.name}»` : "Agregar medio"}</DialogTitle>
          <DialogDescription>
            Un medio es donde corre la pauta: Meta Ads, Google Ads, TikTok, una red programática… Si ya existe con otro nombre, mejor fusiónelo que duplicarlo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup className="gap-4">
            <FormError message={error} />
            <FormField id={`${idp}-name`} label="Nombre" required error={errors.name?.message}>
              <Input id={`${idp}-name`} autoFocus placeholder="Ej. Meta Ads" aria-invalid={!!errors.name} {...form.register("name")} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id={`${idp}-kind`} label="Tipo" description="Social, búsqueda, video, programática…" error={errors.kind?.message}>
                <Input id={`${idp}-kind`} placeholder="Ej. Social" {...form.register("kind")} />
              </FormField>
              <FormField id={`${idp}-provider`} label="Proveedor" error={errors.provider?.message}>
                <Input id={`${idp}-provider`} placeholder="Ej. Meta" {...form.register("provider")} />
              </FormField>
            </div>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton pending={pending}>{media ? "Guardar" : "Agregar medio"}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
