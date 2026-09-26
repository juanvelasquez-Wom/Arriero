"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Callout } from "@/components/app/page";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Confirmación genérica para acciones irreversibles. `onConfirm` devuelve un
 * mensaje de error (string) si falla; en ese caso el diálogo queda abierto.
 */
export function ConfirmAction({
  title,
  description,
  confirmLabel = "Confirmar",
  onConfirm,
  children,
  extra,
  disabled,
}: {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<string | void>;
  children: ReactNode;
  extra?: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(undefined);
      }}
    >
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {extra}
        {error ? <Callout title="¡Uy, qué pena! No se pudo completar">{error}</Callout> : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button
            disabled={pending || disabled}
            className="bg-ink text-paper hover:bg-ink/85"
            onClick={() =>
              startTransition(async () => {
                const err = await onConfirm();
                if (err) setError(err);
                else setOpen(false);
              })
            }
          >
            {pending ? <Spinner /> : null}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
