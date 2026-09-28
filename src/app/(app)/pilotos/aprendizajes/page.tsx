import { BookOpenCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ExportCsvButton } from "@/components/app/export-csv-button";
import { EmptyState, PageHeader } from "@/components/app/page";
import { UrlFilters } from "@/components/app/url-filters";
import { IncludeToggle, UnifiedLearningCard } from "@/components/app/unified-learning";
import { PilotLearningCard } from "@/components/pilots/library/learning-card";
import { DateRangeFilter } from "@/components/pilots/portfolio/date-range-filter";
import { Button } from "@/components/ui/button";
import { toCsv } from "@/domain/csv";
import { todayIso } from "@/domain/dates";
import { DECISION_LABEL, VERDICT_LABEL, labelOf } from "@/domain/labels";
import { PILOT_TEST_TYPE_LABEL, VARIABLE_CATEGORY_LABEL } from "@/domain/pilots/labels";
import { isOn } from "@/domain/learning-search";
import { experimentAsLibraryItem, filterLearnings, learningDate, parseLibraryFilters } from "@/domain/pilots/library";
import { channelOptions } from "@/domain/pilots/portfolio";
import { PILOT_TEST_TYPES, VARIABLE_CATEGORIES, type PilotTestType, type VariableCategory } from "@/domain/pilots/types";
import { VERDICTS } from "@/domain/types";
import { getPilotContext, isPilotsReady } from "@/server/pilot-auth";
import { listAllLearnings } from "@/server/queries/learnings";
import { listPilotLearnings } from "@/server/queries/pilots";

export const metadata: Metadata = { title: "Aprendizajes de pilotos" };

export default async function PilotLearningsPage({ searchParams }: PageProps<"/pilotos/aprendizajes">) {
  const { actor } = await getPilotContext();
  if (!actor.role || !(await isPilotsReady())) return null;
  const sp = await searchParams;
  const withExperiments = isOn(sp.ejercicios);
  const [learnings, experimentRows] = await Promise.all([
    listPilotLearnings(),
    withExperiments ? listAllLearnings({ source: "experiment" }) : Promise.resolve([]),
  ]);
  const experiments = experimentRows.map(experimentAsLibraryItem);
  const filters = parseLibraryFilters(sp);
  const filteredPilots = filterLearnings(learnings, filters);
  const filteredExperiments = filterLearnings(experiments, filters);
  // Todo junto, del más reciente al más viejo.
  const filtered = [
    ...filteredPilots.map((l) => ({ kind: "pilot" as const, l })),
    ...filteredExperiments.map((l) => ({ kind: "experiment" as const, l })),
  ].sort((a, b) => learningDate(b.l).localeCompare(learningDate(a.l)));
  const total = learnings.length + experiments.length;

  const csv = toCsv(filtered.map((x) => x.l), [
    { header: "Origen", value: (l) => ("source" in l ? "Ejercicio" : "Piloto") },
    { header: "Piloto o ejercicio", value: (l) => l.pilot_title },
    { header: "Programa", value: (l) => ("source" in l ? l.program_name : "") },
    { header: "Veredicto", value: (l) => labelOf(VERDICT_LABEL, l.verdict, "") },
    { header: "Decisión", value: (l) => labelOf(DECISION_LABEL, l.decision, "") },
    { header: "Tipo de prueba", value: (l) => (l.test_type ? PILOT_TEST_TYPE_LABEL[l.test_type as PilotTestType] : "") },
    { header: "Variable", value: (l) => l.variable_name },
    {
      header: "Categoría o palanca",
      value: (l) => (l.variable_category ? (VARIABLE_CATEGORY_LABEL[l.variable_category as VariableCategory] ?? l.variable_category) : ""),
    },
    { header: "Canal", value: (l) => l.media_names.join(", ") },
    { header: "Aprendizaje", value: (l) => l.text },
    { header: "Fecha", value: (l) => learningDate(l) },
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Pilotos de medios"
        title="Aprendizajes de pilotos"
        description="Lo que dejó cada piloto decidido: qué se probó, en qué canal y qué resultó. Antes de diseñar un piloto nuevo, busque aquí si alguien ya recorrió ese camino."
        actions={
          total ? (
            <ExportCsvButton
              csv={csv}
              name={["aprendizajes-pilotos", todayIso()]}
              label={filtered.length === total ? "Exportar a Excel" : "Exportar filtrados"}
            />
          ) : null
        }
      />
      <div className="mb-4">
        <IncludeToggle pathname="/pilotos/aprendizajes" params={sp} param="ejercicios" label="Incluir ejercicios de los programas" />
      </div>
      {total === 0 ? (
        <EmptyState
          art="tinto"
          icon={BookOpenCheck}
          title="Todavía no hay aprendizajes de pilotos"
          description="Cada piloto decidido deja un aprendizaje. Aquí los va a encontrar para buscarlos y reutilizarlos. ¡Eso es oro en el carriel!"
          action={
            <Button asChild variant="outline">
              <Link href="/pilotos?estado=in_reading">Ver pilotos en lectura</Link>
            </Button>
          }
        />
      ) : (
        <>
          <UrlFilters
            search={{ param: "q", placeholder: "Buscar en los aprendizajes (sin tildes también sirve)" }}
            filters={[
              { param: "variable", label: "Variable", options: VARIABLE_CATEGORIES.map((c) => ({ value: c, label: VARIABLE_CATEGORY_LABEL[c] })) },
              { param: "canal", label: "Canal", options: channelOptions([...learnings, ...experiments]).map((m) => ({ value: m, label: m })) },
              { param: "tipo", label: "Tipo de prueba", options: PILOT_TEST_TYPES.map((t) => ({ value: t, label: PILOT_TEST_TYPE_LABEL[t] })) },
              { param: "resultado", label: "Resultado", options: VERDICTS.map((v) => ({ value: v, label: VERDICT_LABEL[v] })) },
            ]}
          />
          <div className="mb-4">
            <DateRangeFilter legend="Fecha de la decisión" />
          </div>
          <ul className="stagger space-y-3">
            {filtered.map((x) =>
              x.kind === "pilot" ? (
                <PilotLearningCard key={`p-${x.l.pilot_id}`} item={x.l} />
              ) : (
                <UnifiedLearningCard
                  key={`e-${x.l.id}`}
                  item={{
                    source: "experiment",
                    id: x.l.id,
                    text: x.l.text,
                    created_at: x.l.created_at,
                    item_id: x.l.item_id,
                    item_title: x.l.pilot_title,
                    program_id: x.l.program_id,
                    program_name: x.l.program_name,
                    line_name: x.l.line_name,
                    verdict: x.l.verdict,
                    decision: x.l.decision,
                    lever: x.l.variable_category,
                    channel: x.l.media_names.join(", ") || null,
                    decided_at: x.l.decided_at,
                  }}
                />
              ),
            )}
            {filtered.length === 0 ? (
              <li className="py-8 text-center text-sm text-soft">Ningún aprendizaje coincide con la búsqueda. Ese camino no era: pruebe con otras palabras.</li>
            ) : null}
          </ul>
          <p className="mt-3 text-xs text-soft tabular-nums">
            {filtered.length} de {total} {total === 1 ? "aprendizaje" : "aprendizajes"}
            {withExperiments ? ` (${experiments.length} de ejercicios de los programas)` : ""}.
          </p>
        </>
      )}
    </div>
  );
}
