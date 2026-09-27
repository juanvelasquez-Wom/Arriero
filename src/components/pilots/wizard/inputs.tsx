"use client";

import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { parseDecimal, toInputValue } from "@/domain/metric-tree";
import { cn } from "@/lib/utils";

const sameNumber = (a: number | null | undefined, b: number | null | undefined) =>
  (a == null && b == null) || (a != null && b != null && (a === b || (Number.isNaN(a) && Number.isNaN(b))));

const fromScaled = (value: number | null | undefined, scale: number) =>
  value == null || Number.isNaN(value) ? value : Math.round(value * scale * 1e6) / 1e6;

/**
 * Número escrito en es-CO ("1.250.000", "12,5"). Guarda el texto mientras se
 * escribe y entrega el número (o NaN si no es un número, null si está vacío).
 * `scale` convierte lo que se ve en lo que se guarda: con 100, "12,5" → 0,125.
 */
export function NumberInput({
  value,
  onChange,
  scale = 1,
  suffix,
  prefix,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type" | "prefix"> & {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  scale?: number;
  suffix?: string;
  prefix?: string;
}) {
  const [state, setState] = useState(() => ({ text: toInputValue(fromScaled(value, scale)), value }));
  // Si el valor cambia desde afuera (p. ej. "Repartir parejo"), se muestra el nuevo.
  if (!sameNumber(state.value, value)) {
    setState({ text: value == null || Number.isNaN(value) ? state.text : toInputValue(fromScaled(value, scale)), value });
  }
  return (
    <div className={cn("relative", className)}>
      {prefix ? <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-soft">{prefix}</span> : null}
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn("tabular-nums", prefix && "pl-7", suffix && "pr-8")}
        value={state.text}
        onChange={(e) => {
          const text = e.target.value;
          const parsed = parseDecimal(text);
          const next = parsed == null || Number.isNaN(parsed) ? parsed : Math.round((parsed / scale) * 1e9) / 1e9;
          setState({ text, value: next });
          onChange(next);
        }}
      />
      {suffix ? <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-soft">{suffix}</span> : null}
    </div>
  );
}

/** Lista de palabras (ciudades): se escribe y se agrega con Enter o coma. */
export function ChipInput({
  id,
  value,
  onChange,
  placeholder = "Escriba y presione Enter",
  label,
  invalid,
}: {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  /** Para lectores de pantalla: "Ciudades de Ciudades de prueba". */
  label: string;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const parts = raw
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const seen = new Set(value.map((v) => v.toLocaleLowerCase("es-CO")));
    const next = [...value];
    for (const p of parts) {
      if (!seen.has(p.toLocaleLowerCase("es-CO"))) {
        next.push(p);
        seen.add(p.toLocaleLowerCase("es-CO"));
      }
    }
    onChange(next);
    setDraft("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  return (
    <div
      className={cn(
        "flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border bg-paper px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        invalid && "border-destructive",
      )}
    >
      <ul className="contents" aria-label={label}>
        {value.map((c) => (
          <li key={c} className="pop-in inline-flex h-7 items-center gap-1 rounded-full border border-line bg-wash pl-2.5 pr-1 text-xs font-medium">
            {c}
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded-full text-soft hover:bg-gray-1 hover:text-ink"
              aria-label={`Quitar ${c}`}
              onClick={() => onChange(value.filter((x) => x !== c))}
            >
              <X aria-hidden className="size-3" />
            </button>
          </li>
        ))}
      </ul>
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        placeholder={value.length ? "" : placeholder}
        aria-label={label}
        className="h-8 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-soft"
      />
    </div>
  );
}
