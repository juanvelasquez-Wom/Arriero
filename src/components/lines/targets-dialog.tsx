"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/app/form";
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
import { Spinner } from "@/components/ui/spinner";
import { formatDateRange, formatMetricValue } from "@/domain/format";
import { parseDecimal, toInputValue } from "@/domain/metric-tree";
import { setMetricTargets } from "@/server/actions/metrics";

export interface HorizonOption {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

/** Objetivo de la métrica en cada horizonte del programa. Vacío = sin objetivo. */
export function TargetsDialog({
  programId,
  metric,
  horizons,
  trigger,
}: {
  programId: string;
  metric: { id: string; name: string; unit: string | null; baseline: number | null; targets: { horizon_id: string; target: number }[] };
  horizons: HorizonOption[];
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(undefined);
      setFieldErrors({});
      setValues(
        Object.fromEntries(
          horizons.map((h) => [h.id, toInputValue(metric.targets.find((t) => t.horizon_id === h.id)?.target)]),
        ),
      );
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const h of horizons) {
      const n = parseDecimal(values[h.id]);
      if (n != null && Number.isNaN(n)) errs[h.id] = "Escriba un número (p. ej. 1234,5).";
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setError(undefined);
    startTransition(async () => {
      const result = await setMetricTargets(programId, {
        metric_id: metric.id,
        targets: horizons.map((h) => ({ horizon_id: h.id, target: values[h.id] ?? "" })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(result.message ?? "Objetivos guardados");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Objetivos · {metric.name}</DialogTitle>
          <DialogDescription>
            A dónde debe llegar la métrica al final de cada horizonte. Línea base:{" "}
            <span className="tabular-nums">{formatMetricValue(metric.baseline, metric.unit)}</span>.
          </DialogDescription>
        </DialogHeader>
        {horizons.length === 0 ? (
          <p className="text-sm text-soft">
            El programa no tiene horizontes. Un owner los define en la configuración del programa.
          </p>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <FieldGroup className="gap-4">
              <FormError message={error} />
              {horizons.map((h) => (
                <FormField
                  key={h.id}
                  id={`target-${metric.id}-${h.id}`}
                  label={h.name}
                  description={`${formatDateRange(h.start_date, h.end_date)}${metric.unit ? ` · en ${metric.unit}` : ""}`}
                  error={fieldErrors[h.id]}
                >
                  <Input
                    id={`target-${metric.id}-${h.id}`}
                    inputMode="decimal"
                    className="tabular-nums"
                    placeholder="Sin objetivo"
                    value={values[h.id] ?? ""}
                    aria-invalid={!!fieldErrors[h.id]}
                    onChange={(e) => setValues((v) => ({ ...v, [h.id]: e.target.value }))}
                  />
                </FormField>
              ))}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? <Spinner /> : null}
                  Guardar objetivos
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
