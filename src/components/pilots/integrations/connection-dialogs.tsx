"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FlaskConical, KeyRound, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { ConfirmAction } from "@/components/app/confirm-action";
import { applyFieldErrors, FormError, FormField, SubmitButton } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  integrationConnectionSchema,
  integrationTokenSchema,
  type IntegrationConnectionInput,
  type IntegrationTokenInput,
} from "@/lib/validation/pilots";
import {
  createIntegrationConnection,
  deleteIntegrationConnection,
  setIntegrationToken,
  testIntegrationConnection,
} from "@/server/actions/pilot-integrations";

const TOKEN_HELP = "Solo lectura: permiso ads_read. El token va directo a la bóveda del servidor; nadie lo vuelve a ver.";

/** Conectar una cuenta publicitaria de Meta (aprobadores). */
export function NewConnectionDialog({ trigger }: { trigger: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const defaults: IntegrationConnectionInput = { account_label: "", account_ref: "act_", token: "", expires_at: "" };
  const form = useForm<IntegrationConnectionInput, unknown, z.output<typeof integrationConnectionSchema>>({
    resolver: zodResolver(integrationConnectionSchema),
    defaultValues: defaults,
  });
  const { errors } = form.formState;

  function onOpenChange(next: boolean) {
    setOpen(next);
    setError(undefined);
    // El token no se queda en memoria del formulario al cerrar.
    form.reset(defaults);
  }

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    startTransition(async () => {
      const r = await createIntegrationConnection(values);
      if (!r.ok) {
        setError(r.error);
        applyFieldErrors(r.fieldErrors, form.setError);
        form.setValue("token", "");
        return;
      }
      toast.success(r.message ?? "Cuenta conectada.");
      onOpenChange(false);
      router.refresh();
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar una cuenta de Meta</DialogTitle>
          <DialogDescription>
            Arriero solo lee reportes: nunca crea, pausa ni edita campañas. Genere el token en Meta for Developers con el permiso ads_read.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate autoComplete="off">
          <FieldGroup className="gap-4">
            <FormError message={error} />
            <FormField id="conn-label" label="Nombre de la cuenta" required error={errors.account_label?.message}>
              <Input id="conn-label" autoFocus placeholder="Ej. WOM Pospago" aria-invalid={!!errors.account_label} {...form.register("account_label")} />
            </FormField>
            <FormField
              id="conn-account"
              label="Id de la cuenta publicitaria"
              required
              description="Empieza por act_. Está en el Administrador de anuncios, arriba a la izquierda."
              error={errors.account_ref?.message}
            >
              <Input id="conn-account" inputMode="text" placeholder="act_1234567890" aria-invalid={!!errors.account_ref} {...form.register("account_ref")} />
            </FormField>
            <FormField id="conn-token" label="Token de acceso" description={TOKEN_HELP} error={errors.token?.message}>
              <Input
                id="conn-token"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                placeholder="Péguelo aquí (lo puede poner después)"
                aria-invalid={!!errors.token}
                {...form.register("token")}
              />
            </FormField>
            <FormField id="conn-expires" label="Vence el" description="Opcional. Si lo sabe, Arriero le avisa cuando se venza." error={errors.expires_at?.message}>
              <Input id="conn-expires" type="date" {...form.register("expires_at")} />
            </FormField>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <SubmitButton pending={pending}>Conectar</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Pegar o cambiar el token de una conexión (aprobadores). */
export function TokenDialog({ connectionId, label }: { connectionId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const defaults: IntegrationTokenInput = { token: "", expires_at: "" };
  const form = useForm<IntegrationTokenInput, unknown, z.output<typeof integrationTokenSchema>>({
    resolver: zodResolver(integrationTokenSchema),
    defaultValues: defaults,
  });
  const { errors } = form.formState;

  function onOpenChange(next: boolean) {
    setOpen(next);
    setError(undefined);
    form.reset(defaults);
  }

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    startTransition(async () => {
      const r = await setIntegrationToken(connectionId, values);
      if (!r.ok) {
        setError(r.error);
        applyFieldErrors(r.fieldErrors, form.setError);
        form.setValue("token", "");
        return;
      }
      toast.success(r.message ?? "Token guardado.");
      onOpenChange(false);
      router.refresh();
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <KeyRound aria-hidden /> Token
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Token de «{label}»</DialogTitle>
          <DialogDescription>Pegue un token nuevo cuando el anterior venza o falle. El anterior se reemplaza.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate autoComplete="off">
          <FieldGroup className="gap-4">
            <FormError message={error} />
            <FormField id={`tok-${connectionId}`} label="Token de acceso" required description={TOKEN_HELP} error={errors.token?.message}>
              <Input
                id={`tok-${connectionId}`}
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                autoFocus
                aria-invalid={!!errors.token}
                {...form.register("token")}
              />
            </FormField>
            <FormField id={`exp-${connectionId}`} label="Vence el" description="Opcional." error={errors.expires_at?.message}>
              <Input id={`exp-${connectionId}`} type="date" {...form.register("expires_at")} />
            </FormField>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <SubmitButton pending={pending}>Guardar token</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Probar conexión": una extracción pequeña de ayer. */
export function TestConnectionButton({ connectionId, disabled }: { connectionId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending || disabled}
      onClick={() =>
        startTransition(async () => {
          const r = await testIntegrationConnection(connectionId);
          if (r.ok) toast.success(r.message ?? "¡Conexión buena!");
          else toast.error(r.error);
          router.refresh();
        })
      }
    >
      {pending ? <Spinner /> : <FlaskConical aria-hidden />}
      {pending ? "Probando…" : "Probar conexión"}
    </Button>
  );
}

export function DeleteConnectionButton({ connectionId, label }: { connectionId: string; label: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      title={`¿Borrar la conexión «${label}»?`}
      description="Se deja de traer datos de esa cuenta. Lo que ya se trajo se queda en los pilotos con su origen."
      confirmLabel="Borrar conexión"
      onConfirm={async () => {
        const r = await deleteIntegrationConnection(connectionId);
        if (!r.ok) return r.error;
        toast.success(r.message ?? "Conexión borrada.");
        router.refresh();
      }}
    >
      <Button type="button" variant="ghost" size="sm" aria-label={`Borrar la conexión ${label}`}>
        <Trash2 aria-hidden />
      </Button>
    </ConfirmAction>
  );
}
