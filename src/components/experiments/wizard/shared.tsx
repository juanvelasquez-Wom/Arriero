"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { WizardValues } from "../wizard-values";

export type SetValues = React.Dispatch<React.SetStateAction<WizardValues>>;
export type SetField = <K extends keyof WizardValues>(k: K, value: WizardValues[K]) => void;

/** Convierte "12,5" o "12.5" en número; null si está vacío o no es número. */
export function parseDecimal(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

const show = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

/**
 * Campo decimal que acepta coma: guarda el texto mientras se escribe ("4,")
 * y entrega el número. Si el valor cambia desde afuera, muestra el nuevo.
 */
export function DecimalInput({
  value,
  onValueChange,
  ...rest
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number | null;
  onValueChange: (n: number | null) => void;
}) {
  const [text, setText] = useState(show(value));
  const parsed = parseDecimal(text);
  const shown = parsed === value || (parsed == null && value == null) ? text : show(value);
  return (
    <Input
      inputMode="decimal"
      {...rest}
      value={shown}
      onChange={(e) => {
        setText(e.target.value);
        onValueChange(parseDecimal(e.target.value));
      }}
    />
  );
}
