"use client";

import { ArrowRightLeft, Pencil, Plus, Sparkles } from "lucide-react";
import { Callout } from "@/components/app/page";
import { PilotTestTypeBadge } from "@/components/pilots/pilot-badges";
import { Button } from "@/components/ui/button";
import { VARIABLE_CATEGORY_LABEL } from "@/domain/pilots/labels";
import { VARIABLE_CATEGORIES, type VariableCategory } from "@/domain/pilots/types";
import { cn } from "@/lib/utils";
import { setVariableArchived } from "@/server/actions/pilots";
import type { PilotVariable } from "@/server/queries/pilots";
import { ArchiveButton, CatalogStateBadge } from "./catalog-bits";
import { VariableFormDialog } from "./variable-form-dialog";

/** La matriz de recomendación: variables por categoría con su tipo de prueba. */
export function VariablesCatalog({ variables, isApprover }: { variables: PilotVariable[]; isApprover: boolean }) {
  const known = new Set<string>(VARIABLE_CATEGORIES);
  const categories = [...VARIABLE_CATEGORIES, ...new Set(variables.map((v) => v.category).filter((c) => !known.has(c)))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Callout tone="neutral" icon={Sparkles} className="max-w-2xl">
          Arriero recomienda el tipo de prueba según la variable; se puede cambiar con justificación.
        </Callout>
        {isApprover ? (
          <VariableFormDialog
            trigger={
              <Button>
                <Plus aria-hidden /> Agregar variable
              </Button>
            }
          />
        ) : null}
      </div>

      <div className="stagger space-y-4">
        {categories.map((cat) => {
          const list = variables
            .filter((v) => v.category === cat)
            .sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || a.sort_order - b.sort_order);
          if (!list.length && !isApprover) return null;
          const label = VARIABLE_CATEGORY_LABEL[cat as VariableCategory] ?? cat;
          const activeCount = list.filter((v) => !v.archived_at).length;
          return (
            <section key={cat} className="rounded-2xl border bg-paper shadow-card" aria-labelledby={`cat-${cat}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
                <h2 id={`cat-${cat}`} className="text-base font-bold">
                  {label}
                  <span className="ml-2 text-xs font-normal text-soft tabular-nums">
                    {activeCount} {activeCount === 1 ? "variable" : "variables"}
                  </span>
                </h2>
                {isApprover && known.has(cat) ? (
                  <VariableFormDialog
                    defaultCategory={cat as VariableCategory}
                    trigger={
                      <Button size="sm" variant="ghost">
                        <Plus aria-hidden /> Agregar en {label.toLocaleLowerCase("es-CO")}
                      </Button>
                    }
                  />
                ) : null}
              </div>
              {list.length === 0 ? (
                <p className="px-5 py-4 text-sm text-soft">Aún no hay variables en esta categoría.</p>
              ) : (
                <ul className="divide-y">
                  {list.map((v) => {
                    const archived = !!v.archived_at;
                    return (
                      <li key={v.id} className={cn("flex flex-wrap items-start justify-between gap-3 px-5 py-3", archived && "text-soft")}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 font-medium">
                            {v.name}
                            {archived ? <CatalogStateBadge archived /> : null}
                          </div>
                          {v.description ? <p className="mt-0.5 text-sm text-soft">{v.description}</p> : null}
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-soft">Recomendado:</span>
                            <PilotTestTypeBadge testType={v.recommended_test_type} />
                            {v.alternative_test_type ? (
                              <>
                                <span className="inline-flex items-center gap-1 text-soft">
                                  <ArrowRightLeft aria-hidden className="size-3.5" /> Alternativa:
                                </span>
                                <PilotTestTypeBadge testType={v.alternative_test_type} />
                              </>
                            ) : null}
                          </div>
                        </div>
                        {isApprover ? (
                          <div className="flex gap-1">
                            <VariableFormDialog
                              variable={v}
                              trigger={
                                <Button size="sm" variant="ghost" aria-label={`Editar ${v.name}`}>
                                  <Pencil aria-hidden /> Editar
                                </Button>
                              }
                            />
                            <ArchiveButton archived={archived} name={v.name} onToggle={(a) => setVariableArchived(v.id, a)} />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
