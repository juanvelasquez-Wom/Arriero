"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { FormError, FormField, SubmitButton } from "@/components/app/form";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/server/actions/auth";
import { recoverSchema, type RecoverInput } from "@/lib/validation/auth";

export function RecoverForm() {
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState<string>();
  const [pending, startTransition] = useTransition();
  const form = useForm<RecoverInput>({ resolver: zodResolver(recoverSchema), defaultValues: { email: "" } });

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    startTransition(async () => {
      const result = await requestPasswordReset(values);
      if (!result.ok) setError(result.error);
      else setSent(result.message);
    });
  });

  if (sent) {
    return (
      <div className="mt-5 space-y-4">
        <p role="status" className="rounded-md border bg-wash px-3 py-2 text-sm">
          {sent}
        </p>
        <Link href="/login" className="text-sm underline underline-offset-4">
          Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-5" noValidate>
      <FieldGroup>
        <FormError message={error} />
        <FormField id="email" label="Correo" error={form.formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" autoFocus {...form.register("email")} />
        </FormField>
        <SubmitButton pending={pending} className="w-full" size="lg">
          Enviar enlace
        </SubmitButton>
        <Link href="/login" className="text-sm text-soft underline underline-offset-4 hover:text-ink">
          Volver a iniciar sesión
        </Link>
      </FieldGroup>
    </form>
  );
}
