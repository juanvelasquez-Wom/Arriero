"use client";

import { Check, Plus, Trash2, Waypoints } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DeleteButton } from "@/components/app/delete-button";
import { FormError } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TELCO_TEMPLATES } from "@/domain/growth-templates";
import { cn } from "@/lib/utils";
import { saveLinesStep } from "@/server/actions/setup";
import { StepFooter } from "../step-footer";

const norm = (s: string) => s.trim().toLowerCase();

export function StepLines({
  programId,
  existing,
  prevHref,
  advanceHref,
  canDelete,
  readOnly,
}: {
  programId: string;
  existing: { id: string; name: string }[];
  prevHref: string;
  /** La página calcula el siguiente paso con las líneas ya creadas. */
  advanceHref: string;
  canDelete: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const existingNames = new Set(existing.map((l) => norm(l.name)));
  const [selected, setSelected] = useState<string[]>(existing.length ? [] : TELCO_TEMPLATES.map((t) => t.name));
  const [custom, setCustom] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const toCreate = [...selected, ...custom].filter((n) => !existingNames.has(norm(n)));

  function toggle(name: string) {
    setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));
  }

  function next() {
    if (readOnly) {
      router.push(advanceHref);
      return;
    }
    if (!existing.length && !toCreate.length) {
      setError("Elija o escriba al menos una línea de negocio. Sin línea no hay camino.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const r = await saveLinesStep(programId, { create: toCreate });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(advanceHref);
    });
  }

  return (
    <div className="space-y-5">
      {existing.length ? (
        <div className="rounded-2xl border bg-paper shadow-card p-5">
          <h2 className="mb-3 text-lg font-bold">Líneas del programa</h2>
          <ul className="divide-y rounded-lg border">
            {existing.map((l) => (
              <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Waypoints className="size-4" aria-hidden />
                <span className="flex-1 font-medium">{l.name}</span>
                {canDelete && !readOnly ? <DeleteButton entity="line" id={l.id} programId={programId} name={l.name} variant="ghost" iconOnly /> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!readOnly ? (
        <div className="rounded-2xl border bg-paper shadow-card p-5">
          <h2 className="text-lg font-bold">{existing.length ? "Agregar más líneas" : "Elija sus líneas de negocio"}</h2>
          <p className="mt-1 text-sm text-soft">
            Las plantillas de telecomunicaciones traen métrica norte, árbol y embudo sugeridos. En los siguientes pasos los revisa línea por
            línea.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {TELCO_TEMPLATES.map((t) => {
              const created = existingNames.has(norm(t.name));
              const on = created || selected.includes(t.name);
              return (
                <button
                  key={t.key}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={created}
                  onClick={() => toggle(t.name)}
                  className={cn(
                    "lift flex gap-3 rounded-2xl border bg-paper p-4 text-left shadow-card transition-colors hover:border-ink/40",
                    on && "border-ink bg-wash ring-1 ring-ink",
                    created && "cursor-default opacity-70",
                  )}
                >
                  <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border", on && "border-ink bg-ink text-paper")} aria-hidden>
                    {on ? <Check className="size-3.5" /> : null}
                  </span>
                  <span>
                    <span className="block font-medium">
                      {t.name} {created ? <span className="text-xs font-normal text-soft">· ya está en el programa</span> : null}
                    </span>
                    <span className="block text-sm text-soft">{t.summary}</span>
                    <span className="mt-1 block text-xs">
                      Norte sugerida: <strong>{t.northStar.name}</strong>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-5">
            <div className="text-sm font-medium">¿Otra línea que no está en la lista?</div>
            {custom.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {custom.map((c) => (
                  <li key={c} className="flex items-center gap-2">
                    <Waypoints className="size-4" aria-hidden /> {c}
                    <Button size="icon-xs" variant="ghost" aria-label={`Quitar ${c}`} onClick={() => setCustom((x) => x.filter((y) => y !== c))}>
                      <Trash2 aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = draft.trim();
                if (n.length >= 2 && !custom.some((c) => norm(c) === norm(n))) setCustom([...custom, n]);
                setDraft("");
              }}
            >
              <Input aria-label="Nombre de la línea" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ej.: Hogar fibra" />
              <Button type="submit" variant="outline" disabled={draft.trim().length < 2}>
                <Plus aria-hidden /> Agregar
              </Button>
            </form>
          </div>
        </div>
      ) : null}

      <FormError message={error} />
      <StepFooter
        prevHref={prevHref}
        pending={pending}
        onNext={next}
        nextLabel={toCreate.length ? `Cree ${toCreate.length} línea(s) y siga` : "Siga"}
      />
    </div>
  );
}
