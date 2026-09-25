"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { applyFieldErrors, FormError, FormField, SubmitButton } from "@/components/app/form";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updatePassword } from "@/server/actions/auth";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";

export function ResetForm({ askName, defaultName }: { askName: boolean; defaultName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { name: defaultName, password: "", confirm: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    startTransition(async () => {
      const result = await updatePassword(askName ? values : { ...values, name: undefined });
      if (!result.ok) {
        setError(result.error);
        applyFieldErrors(result.fieldErrors, form.setError);
        return;
      }
      router.replace(result.data.next);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="mt-5" noValidate>
      <FieldGroup>
        <FormError message={error} />
        {askName ? (
          <FormField id="name" label="Tu nombre" error={errors.name?.message}>
            <Input id="name" autoComplete="name" {...form.register("name")} />
          </FormField>
        ) : null}
        <FormField id="password" label="Contraseña nueva" description="Mínimo 8 caracteres." error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
        </FormField>
        <FormField id="confirm" label="Repite la contraseña" error={errors.confirm?.message}>
          <Input id="confirm" type="password" autoComplete="new-password" {...form.register("confirm")} />
        </FormField>
        <SubmitButton pending={pending} className="w-full" size="lg">
          Guardar y entrar
        </SubmitButton>
      </FieldGroup>
    </form>
  );
}
