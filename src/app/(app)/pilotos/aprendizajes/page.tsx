import { BookOpenCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ExportCsvButton } from "@/components/app/export-csv-button";
import { EmptyState, PageHeader } from "@/components/app/page";
import { UrlFilters } from "@/components/app/url-filters";
import { PilotLearningCard } from "@/components/pilots/library/learning-card";
import { DateRangeFilter } from "@/components/pilots/portfolio/date-range-filter";
import { Button } from "@/components/ui/button";
import { toCsv } from "@/domain/csv";
import { todayIso } from "@/domain/dates";
import { DECISION_LABEL, VERDICT_LABEL, labelOf } from "@/domain/labels";
import { PILOT_TEST_TYPE_LABEL, VARIABLE_CATEGORY_LABEL } from "@/domain/pilots/labels";
import { filterLearnings, learningDate, parseLibraryFilters } from "@/domain/pilots/library";
import { channelOptions } from "@/domain/pilots/portfolio";
import { PILOT_TEST_TYPES, VARIABLE_CATEGORIES, type PilotTestType, type VariableCategory } from "@/domain/pilots/types";
import { VERDICTS } from "@/domain/types";
import { getPilotContext, isPilotsReady } from "@/server/pilot-auth";
import { listPilotLearnings } from "@/server/queries/pilots";

export const metadata: Metadata = { title: "Aprendizajes de pilotos" };

export default async function PilotLearningsPage({ searchParams }: PageProps<"/pilotos/aprendizajes">) {
  const { actor } = await getPilotContext();
  if (!actor.role || !(await isPilotsReady())) return null;
  const sp = await searchParams;
  const learnings = await listPilotLearnings();
  const filters = parseLibraryFilters(sp);
  const filtered = filterLearnings(learnings, filters);

  const csv = toCsv(filtered, [
    { header: "Piloto", value: (l) => l.pilot_title },
    { header: "Veredicto", value: (l) => labelOf(VERDICT_LABEL, l.verdict, "") },
    { header: "Decisión", value: (l) => labelOf(DECISION_LABEL, l.decision, "") },
    { header: "Tipo de prueba", value: (l) => (l.test_type ? PILOT_TEST_TYPE_LABEL[l.test_type as PilotTestType] : "") },
    { header: "Variable", value: (l) => l.variable_name },
    {
      header: "Categoría",
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
          learnings.length ? (
            <ExportCsvButton
              csv={csv}
              name={["aprendizajes-pilotos", todayIso()]}
              label={filtered.length === learnings.length ? "Exportar a Excel" : "Exportar filtrados"}
            />
          ) : null
        }
      />
      {learnings.length === 0 ? (
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
              { param: "canal", label: "Canal", options: channelOptions(learnings).map((m) => ({ value: m, label: m })) },
              { param: "tipo", label: "Tipo de prueba", options: PILOT_TEST_TYPES.map((t) => ({ value: t, label: PILOT_TEST_TYPE_LABEL[t] })) },
              { param: "resultado", label: "Resultado", options: VERDICTS.map((v) => ({ value: v, label: VERDICT_LABEL[v] })) },
            ]}
          />
          <div className="mb-4">
            <DateRangeFilter legend="Fecha de la decisión" />
          </div>
          <ul className="stagger space-y-3">
            {filtered.map((l) => (
              <PilotLearningCard key={l.pilot_id} item={l} />
            ))}
            {filtered.length === 0 ? (
              <li className="py-8 text-center text-sm text-soft">Ningún aprendizaje coincide con la búsqueda. Ese camino no era: pruebe con otras palabras.</li>
            ) : null}
          </ul>
          <p className="mt-3 text-xs text-soft tabular-nums">
            {filtered.length} de {learnings.length} {learnings.length === 1 ? "aprendizaje" : "aprendizajes"}.
          </p>
        </>
      )}
    </div>
  );
}
