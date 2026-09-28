import { BookOpenCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ExportCsvButton } from "@/components/app/export-csv-button";
import { Term } from "@/components/app/info-tip";
import { EmptyState, PageHeader } from "@/components/app/page";
import { DecisionBadge, VerdictBadge } from "@/components/app/status-badge";
import { IncludeToggle, leverLabel, UnifiedLearningCard } from "@/components/app/unified-learning";
import { UrlFilters } from "@/components/app/url-filters";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toCsv } from "@/domain/csv";
import { todayIso } from "@/domain/dates";
import { formatDate } from "@/domain/format";
import { DECISION_LABEL, VERDICT_LABEL, labelOf } from "@/domain/labels";
import { isOn, matchesTaxonomy, taxonomyOptions } from "@/domain/learning-search";
import { can } from "@/domain/permissions";
import { VERDICTS, type Decision, type Verdict } from "@/domain/types";
import { getProgramContext } from "@/server/auth";
import { getPilotContext } from "@/server/pilot-auth";
import { listAllLearnings } from "@/server/queries/learnings";
import { listLines } from "@/server/queries/programs";
import { listLearnings } from "@/server/queries/structure";

export const metadata: Metadata = { title: "Aprendizajes" };

export default async function LearningsPage({ params, searchParams }: PageProps<"/programas/[programId]/aprendizajes">) {
  const { programId } = await params;
  const sp = await searchParams;
  const ctx = await getProgramContext(programId);
  const { actor: pilotActor } = await getPilotContext();
  // Pilotos de medios: solo para quien tiene rol en Pilotos (RLS igual lo filtra).
  const canSeePilots = !!pilotActor.role;
  const withPilots = canSeePilots && isOn(sp.pilotos);
  const [learnings, lines, unified, pilotRows] = await Promise.all([
    listLearnings(programId),
    listLines(programId),
    listAllLearnings({ programId, source: "experiment" }),
    withPilots ? listAllLearnings({ source: "pilot" }) : Promise.resolve([]),
  ]);
  // Palanca y canal (taxonomía común) de cada aprendizaje, desde la vista unificada.
  const taxonomy = new Map(unified.map((u) => [u.id, { lever: u.lever, channel: u.channel }]));
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const f = { linea: get("linea"), veredicto: get("veredicto"), etapa: get("etapa"), q: get("q"), palanca: get("palanca"), canal: get("canal") };
  const filtered = learnings.filter(
    (l) =>
      (!f.linea || l.line_id === f.linea || l.applies_to_line_ids.includes(f.linea)) &&
      (!f.veredicto || l.verdict === f.veredicto) &&
      (!f.etapa || l.stage_name === f.etapa) &&
      matchesTaxonomy(taxonomy.get(l.id) ?? {}, f) &&
      (!f.q || `${l.text} ${l.experiment_title} ${l.suggested_hypothesis ?? ""}`.toLowerCase().includes(f.q.toLowerCase())),
  );
  // Los de pilotos no tienen línea ni etapa del programa: con esos filtros no aparecen.
  const filteredPilots = pilotRows.filter(
    (l) =>
      !f.linea &&
      !f.etapa &&
      (!f.veredicto || l.verdict === f.veredicto) &&
      matchesTaxonomy(l, f) &&
      (!f.q || `${l.text} ${l.item_title}`.toLowerCase().includes(f.q.toLowerCase())),
  );
  const options = taxonomyOptions([...unified, ...pilotRows]);
  const stageNames = [...new Set(learnings.map((l) => l.stage_name).filter((s): s is string => !!s))];
  const lineName = (id: string) => lines.find((l) => l.id === id)?.name ?? "—";
  const base = `/programas/${programId}`;
  const csv = toCsv(filtered, [
    { header: "Ejercicio", value: (l) => l.experiment_title },
    { header: "Línea", value: (l) => l.line_name },
    { header: "Etapa", value: (l) => l.stage_name },
    { header: "Veredicto", value: (l) => labelOf(VERDICT_LABEL, l.verdict as Verdict | null, "") },
    { header: "Decisión", value: (l) => labelOf(DECISION_LABEL, l.decision as Decision | null, "") },
    { header: "Palanca", value: (l) => leverLabel(taxonomy.get(l.id)?.lever) },
    { header: "Canal", value: (l) => taxonomy.get(l.id)?.channel ?? "" },
    { header: "Aprendizaje", value: (l) => l.text },
    { header: "Aplica también a", value: (l) => l.applies_to_line_ids.map(lineName).join(", ") },
    { header: "Hipótesis derivada", value: (l) => l.suggested_hypothesis },
    { header: "Fecha", value: (l) => l.created_at.slice(0, 10) },
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Aprendizajes"
        description="Lo que dejó cada ejercicio cerrado. Lo que se aprende en una línea puede volverse hipótesis en las otras."
        actions={
          learnings.length ? (
            <ExportCsvButton csv={csv} name={["aprendizajes", todayIso()]} label={filtered.length === learnings.length ? "Exportar a Excel" : "Exportar filtrados"} />
          ) : null
        }
      />
      {canSeePilots ? (
        <div className="mb-4">
          <IncludeToggle pathname={`${base}/aprendizajes`} params={sp} param="pilotos" label="Incluir pilotos de medios" />
        </div>
      ) : null}
      {learnings.length === 0 && !withPilots ? (
        <EmptyState art="tinto"
          icon={BookOpenCheck}
          title="Todavía no hay aprendizajes"
          description="Cada ejercicio decidido deja un aprendizaje. Aquí los va a encontrar para buscarlos y reutilizarlos. ¡Eso es oro en el carriel!"
          action={
            <Button asChild variant="outline">
              <Link href={`${base}/tableros/kanban`}>Ver ejercicios en curso</Link>
            </Button>
          }
        />
      ) : (
        <>
          <UrlFilters
            search={{ param: "q", placeholder: "Buscar en los aprendizajes" }}
            filters={[
              { param: "linea", label: "Línea", options: lines.map((l) => ({ value: l.id, label: l.name })) },
              { param: "veredicto", label: "Veredicto", options: VERDICTS.map((v) => ({ value: v, label: VERDICT_LABEL[v] })) },
              { param: "etapa", label: "Etapa", options: stageNames.map((s) => ({ value: s, label: s })) },
              ...(options.levers.length
                ? [{ param: "palanca", label: "Palanca", options: options.levers.map((v) => ({ value: v, label: leverLabel(v) ?? v })) }]
                : []),
              ...(options.channels.length ? [{ param: "canal", label: "Canal", options: options.channels.map((v) => ({ value: v, label: v })) }] : []),
            ]}
          />
          <ul className="space-y-3">
            {filtered.map((l) => {
              const otherLines = lines.filter((x) => x.id !== l.line_id);
              return (
                <li key={l.id} id={l.id} className="lift scroll-mt-20 rounded-2xl border bg-paper p-4 shadow-card">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link href={`${base}/ejercicios/${l.experiment_id}?tab=aprendizaje`} className="font-heading font-bold hover:underline">
                        {l.experiment_title}
                      </Link>
                      <div className="text-xs text-soft">
                        {l.line_name}
                        {l.stage_name ? ` · ${l.stage_name}` : ""} · {formatDate(l.created_at.slice(0, 10))}
                        {leverLabel(taxonomy.get(l.id)?.lever) ? ` · ${leverLabel(taxonomy.get(l.id)?.lever)}` : ""}
                        {taxonomy.get(l.id)?.channel ? ` · ${taxonomy.get(l.id)?.channel}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <VerdictBadge verdict={l.verdict as Verdict | null} />
                      <DecisionBadge decision={l.decision as Decision | null} />
                    </div>
                  </div>
                  <p className="mt-3 text-sm whitespace-pre-line">{l.text}</p>
                  {l.applies_to_line_ids.length ? (
                    <p className="mt-2 text-xs">
                      <span className="text-soft">Aplica también a: </span>
                      {l.applies_to_line_ids.map(lineName).join(", ")}
                    </p>
                  ) : null}
                  {l.suggested_hypothesis ? (
                    <p className="mt-1 text-xs">
                      <span className="text-soft">
                        <Term k="hypothesis">Hipótesis derivada</Term>:{" "}
                      </span>
                      {l.suggested_hypothesis}
                    </p>
                  ) : null}
                  {can.createExperiment(ctx.actor) && otherLines.length ? (
                    <div className="mt-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline">
                            <Sparkles aria-hidden /> Crear ejercicio en otra línea
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuLabel>¿En qué línea?</DropdownMenuLabel>
                          {otherLines.map((x) => (
                            <DropdownMenuItem key={x.id} asChild>
                              <Link href={`${base}/ejercicios/nuevo?aprendizaje=${l.id}&linea=${x.id}`}>
                                {x.name}
                                {l.applies_to_line_ids.includes(x.id) ? " · sugerida" : ""}
                              </Link>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : null}
                </li>
              );
            })}
            {filtered.length === 0 && filteredPilots.length === 0 ? (
              <li className="py-8 text-center text-sm text-soft">Ningún aprendizaje coincide con los filtros. Ese camino no era: pruebe con otros.</li>
            ) : null}
          </ul>
          {withPilots ? (
            <section aria-labelledby="aprendizajes-pilotos" className="mt-8">
              <h2 id="aprendizajes-pilotos" className="mb-1 text-lg font-bold">
                De los pilotos de medios
              </h2>
              <p className="mb-3 text-sm text-soft">
                Lo que dejaron los pilotos decididos. No son de este programa, pero lo que funcionó en medios puede volverse hipótesis aquí.
              </p>
              {filteredPilots.length ? (
                <ul className="space-y-3">
                  {filteredPilots.map((l) => (
                    <UnifiedLearningCard key={l.id} item={l} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-soft">
                  {pilotRows.length ? "Ningún aprendizaje de pilotos coincide con los filtros." : "Todavía no hay aprendizajes de pilotos."}
                </p>
              )}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
