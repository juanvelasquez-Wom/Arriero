"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VARIABLE_CATEGORY_LABEL } from "@/domain/pilots/labels";
import { VARIABLE_CATEGORIES } from "@/domain/pilots/types";

const NONE = "__none__";

/** Etiqueta visible de una palanca guardada (clave de la categoría de variable de Pilotos). */
export function leverLabel(lever: string | null | undefined): string | null {
  if (!lever) return null;
  return (VARIABLE_CATEGORY_LABEL as Record<string, string>)[lever] ?? lever;
}

/**
 * Taxonomía común con Pilotos: palanca (categoría de variable) y canal. Opcional;
 * sirve para encontrar el aprendizaje en la biblioteca.
 */
export function LearningTaxonomyFields({
  lever,
  onLever,
  channel,
  onChannel,
  idPrefix,
}: {
  lever: string;
  onLever: (v: string) => void;
  channel: string;
  onChannel: (v: string) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-lever`}>Palanca (opcional)</Label>
        <Select value={lever || NONE} onValueChange={(v) => onLever(v === NONE ? "" : v)}>
          <SelectTrigger id={`${idPrefix}-lever`} className="w-full">
            <SelectValue placeholder="Qué se movió" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sin palanca</SelectItem>
            {VARIABLE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {VARIABLE_CATEGORY_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-channel`}>Canal (opcional)</Label>
        <Input
          id={`${idPrefix}-channel`}
          maxLength={80}
          placeholder="WhatsApp, landing, tienda…"
          value={channel}
          onChange={(e) => onChannel(e.target.value)}
        />
      </div>
    </div>
  );
}
