"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { applyFieldErrors, FormError, FormField, SubmitButton } from "@/components/app/form";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn } from "@/server/actions/auth";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>(initialError);
  const [pending, startTransition] = useTransition();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", next },
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    startTransition(async () => {
      const result = await signIn(values);
      if (!result.ok) {
        setError(result.error);
        applyFieldErrors(result.fieldErrors, form.setError);
        return;
      }
      router.replace(result.data.next);
      router.refresh();
    });
  });

  const { errors } = form.formState;
  return (
    <form onSubmit={onSubmit} className="mt-5" noValidate>
      <FieldGroup>
        <FormError message={error} />
        <FormField id="email" label="Correo" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" autoFocus {...form.register("email")} aria-invalid={!!errors.email} />
        </FormField>
        <FormField id="password" label="Contraseña" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register("password")}
            aria-invalid={!!errors.password}
          />
        </FormField>
        <SubmitButton pending={pending} className="w-full" size="lg">
          Entrar
        </SubmitButton>
        <Link href="/recuperar" className="text-sm text-soft underline underline-offset-4 hover:text-ink">
          Olvidé mi contraseña
        </Link>
      </FieldGroup>
    </form>
  );
}
