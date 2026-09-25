"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** Campo de formulario: etiqueta + control + ayuda + error, accesible. */
export function FormField({
  id,
  label,
  description,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Field data-invalid={!!error || undefined} className={className}>
      <FieldLabel htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden className="text-soft">
            *
          </span>
        ) : null}
      </FieldLabel>
      {children}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  );
}

export function SubmitButton({
  pending,
  children,
  className,
  variant,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { pending?: boolean }) {
  return (
    <Button type="submit" disabled={pending || disabled} className={className} variant={variant} {...props}>
      {pending ? <Spinner /> : null}
      {children}
    </Button>
  );
}

/** Mensaje de error general de un formulario. */
export function FormError({ message, className }: { message?: string | null; className?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn("rounded-md border border-ink/20 bg-wash px-3 py-2 text-sm text-ink", className)}
    >
      {message}
    </div>
  );
}

/** Aplica los fieldErrors de una server action a react-hook-form. */
export function applyFieldErrors(
  fieldErrors: Record<string, string[]> | undefined,
  setError: (name: never, error: { type: string; message: string }) => void,
) {
  if (!fieldErrors) return;
  for (const [name, messages] of Object.entries(fieldErrors)) {
    setError(name as never, { type: "server", message: messages[0] });
  }
}
