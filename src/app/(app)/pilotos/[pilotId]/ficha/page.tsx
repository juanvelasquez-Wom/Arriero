import { ArrowLeft, CircleCheck, CircleHelp, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PrintButton } from "@/components/app/report-actions";
import { DecisionBadge, VerdictBadge } from "@/components/app/status-badge";
import { PilotStatusBadge, PilotTestTypeBadge } from "@/components/pilots/pilot-badges";
import { Button } from "@/components/ui/button";
import { todayIso } from "@/domain/dates";
import { formatDate, formatDateRange, formatSignedPercent } from "@/domain/format";
import { hypothesisSentence } from "@/domain/pilots/flow";
import { pctText } from "@/domain/pilots/numbers";
import { executedSpend, pilotGranularity, resultSentence } from "@/domain/pilots/reading";
import { formatProbability } from "@/domain/stats";
import { formatCop } from "@/domain/value";
import { cn } from "@/lib/utils";
import { getPilotContext, isPilotsReady } from "@/server/pilot-auth";
import { analyzePilotDetail } from "@/server/pilot-reading";
import { loadPilotCatalogs, loadPilotDetail } from "@/server/queries/pilots";

export const metadata: Metadata = { title: "Ficha para gerencia" };

// Una sola hoja al imprimir: sin header, navegación ni botones, fondo blanco y letra compacta.
const PRINT_CSS = `@media print {
  @page { size: A4; margin: 12mm; }
  header, nav, aside, [data-print-hide] { display: none !important; }
  html, body, main { background: #fff !important; }
  main { padding: 0 !important; max-width: none !important; }
  .ficha { border: 0 !important; box-shadow: none !important; padding: 0 !important; font-size: 10.5px; line-height: 1.35; }
  .ficha h1 { font-size: 20px; }
  .ficha h2 { font-size: 11px; }
  .ficha .ficha-block { break-inside: avoid; padding: 8px 10px !important; }
  .ficha * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

function Block({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("ficha-block rounded-xl border bg-paper p-4", className)}>
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-soft">{title}</h2>
      <div className="mt-1.5 text-sm">{children}</div>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-soft">{label}</div>
      <div className="font-heading text-lg font-extrabold tabular-nums">{value}</div>
    </div>
  );
}

export default async function PilotSheetPage({ params }: PageProps<"/pilotos/[pilotId]/ficha">) {
  const { actor } = await getPilotContext();
  if (!actor.role || !(await isPilotsReady())) return null;
  const { pilotId } = await params;
  const [detail, catalogs] = await Promise.all([loadPilotDetail(pilotId), loadPilotCatalogs()]);
  if (!detail) notFound();

  const { pilot } = detail;
  const today = todayIso();
  const analysis = analyzePilotDetail(detail, catalogs);
  const metricById = new Map(catalogs.metrics.map((m) => [m.id, m]));
  const primaryMetric = pilot.primary_metric_id ? (metricById.get(pilot.primary_metric_id) ?? null) : null;
  const sentence = resultSentence({ analysis, testType: pilot.test_type, metric: primaryMetric, arms: detail.arms });
  const primary = analysis?.primary ?? null;
  const best = primary?.comparisons.find((c) => c.armId === primary.bestArmId) ?? primary?.comparisons[0] ?? null;
  const spent = executedSpend(detail.measurements, catalogs.metrics, pilot.actual_start, pilotGranularity(pilot));
  const budget = pilot.planned_budget_cop;
  const usedPct = budget && spent != null && budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : null;
  const signed = (pct: number | null | undefined) => (pct == null ? "—" : formatSignedPercent(pct / 100));
  const hypothesis = hypothesisSentence({
    change: pilot.hypothesis_change,
    scope: pilot.hypothesis_scope,
    metric: pilot.hypothesis_metric,
    expectedPct: pilot.hypothesis_expected_pct,
    reason: pilot.hypothesis_reason,
  });

  return (
    <div className="mx-auto max-w-4xl">
      <style>{PRINT_CSS}</style>
      <div data-print-hide className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost">
          <Link href={`/pilotos/${pilot.id}`}>
            <ArrowLeft aria-hidden /> Volver al piloto
          </Link>
        </Button>
        <PrintButton label="Guardar como PDF" variant="default" />
      </div>

      <article className="ficha rise rounded-2xl border bg-wash p-5 shadow-card sm:p-7">
        <div className="flex flex-col gap-2 border-b pb-4">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-soft">Ficha para gerencia · Pilotos de medios</div>
          <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">{pilot.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <PilotStatusBadge status={pilot.status} />
            <PilotTestTypeBadge testType={pilot.test_type} />
            <span className="text-xs text-soft tabular-nums">
              {formatDateRange(pilot.actual_start ?? pilot.planned_start, pilot.actual_end ?? pilot.planned_end)}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Block title="Oportunidad de mejora">
            <p className="whitespace-pre-line">{pilot.problem?.trim() || "Sin oportunidad de mejora escrita."}</p>
          </Block>
          <Block title="Hipótesis">
            <p>{hypothesis}</p>
          </Block>

          <Block title="Diseño">
            <p className="font-medium">
              {detail.arms.length} {detail.arms.length === 1 ? "grupo" : "grupos"}:
            </p>
            <ul className="mt-0.5 space-y-0.5">
              {detail.arms.map((a) => (
                <li key={a.id} className="tabular-nums">
                  {a.name}
                  {a.is_control ? <span className="text-soft"> (control)</span> : null}
                  {a.split_pct != null ? <span className="text-soft"> · {pctText(a.split_pct)}</span> : null}
                  {a.cities.length ? <span className="text-soft"> · {a.cities.join(", ")}</span> : null}
                </li>
              ))}
            </ul>
            {detail.media.length ? (
              <p className="mt-1.5">
                <span className="text-soft">Medios: </span>
                {[...new Set(detail.media.map((m) => (m.campaign ? `${m.media_name} (${m.campaign})` : m.media_name)))].join(", ")}
              </p>
            ) : null}
          </Block>

          <Block title="Periodo e inversión">
            <p className="tabular-nums">
              <span className="text-soft">Planeado: </span>
              {formatDateRange(pilot.planned_start, pilot.planned_end)}
            </p>
            {pilot.actual_start ? (
              <p className="tabular-nums">
                <span className="text-soft">Real: </span>
                {formatDateRange(pilot.actual_start, pilot.actual_end)}
                {pilot.actual_end ? "" : " (sigue corriendo)"}
              </p>
            ) : null}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Figure label="Inversión planeada" value={formatCop(budget)} />
              <Figure label="Inversión ejecutada" value={formatCop(spent)} />
            </div>
            {usedPct != null ? (
              <div className="mt-1.5" aria-hidden>
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-1">
                  <div className="h-full rounded-full bg-gray-4" style={{ width: `${usedPct}%` }} />
                </div>
              </div>
            ) : null}
            {usedPct != null ? <p className="mt-0.5 text-xs text-soft tabular-nums">Se ha ejecutado {usedPct} % del presupuesto.</p> : null}
          </Block>

          <Block title={primaryMetric ? `Resultado · ${primaryMetric.name}` : "Resultado"} className="sm:col-span-2">
            <p className="text-[15px] font-medium">{sentence}</p>
            {best ? (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Figure label="Diferencia vs. control" value={signed(best.liftPct)} />
                <Figure
                  label="Rango probable (90 %)"
                  value={best.lowPct != null && best.highPct != null ? `${signed(best.lowPct)} a ${signed(best.highPct)}` : "—"}
                />
                <Figure label="Probabilidad de ganar" value={formatProbability(best.probabilityBetter)} />
              </div>
            ) : null}
            {analysis?.evidence === "weak" ? (
              <p className="mt-2 text-xs text-soft">Evidencia débil: sirve para orientar, no para escalar del todo sin confirmar.</p>
            ) : null}
            {analysis?.guardrails.length ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {analysis.guardrails.map((g) => {
                  const m = metricById.get(g.metricId);
                  const Icon = g.broken == null ? CircleHelp : g.broken ? ShieldAlert : CircleCheck;
                  return (
                    <li
                      key={g.guardrailId}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums",
                        g.broken ? "border-gray-4 bg-gray-4 text-paper" : "border-line bg-paper",
                      )}
                    >
                      <Icon aria-hidden className="size-3.5" />
                      {m?.name ?? "Guardrail"}: {g.broken == null ? "sin datos" : g.broken ? "se rompió" : "se cumple"}
                      {g.changePct != null ? ` (${signed(g.changePct)}; límite ${pctText(g.limitPct)})` : ""}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </Block>

          <Block title="Decisión y aprendizaje" className="sm:col-span-2">
            {pilot.status === "decided" ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <VerdictBadge verdict={pilot.verdict} />
                  <DecisionBadge decision={pilot.decision} />
                  <span className="text-xs text-soft">
                    {pilot.decided_by ? `Firmó ${detail.people[pilot.decided_by] ?? "un aprobador"}` : "Firmada"}
                    {pilot.decided_at ? ` el ${formatDate(pilot.decided_at.slice(0, 10))}` : ""}
                  </span>
                </div>
                {pilot.decision_justification ? <p className="mt-1.5 whitespace-pre-line">{pilot.decision_justification}</p> : null}
                {detail.learning ? (
                  <p className="mt-1.5 whitespace-pre-line">
                    <span className="font-semibold">Aprendizaje: </span>
                    {detail.learning.text}
                  </p>
                ) : null}
              </>
            ) : pilot.status === "cancelled" ? (
              <p>
                Cancelado{pilot.cancel_reason ? `: ${pilot.cancel_reason}` : "."}
              </p>
            ) : (
              <p>
                <span className="font-semibold">Pendiente de decisión.</span>
                {analysis?.suggestion.decision ? (
                  <span className="text-soft"> Con los datos de hoy, Arriero sugiere </span>
                ) : null}
                {analysis?.suggestion.decision ? <DecisionBadge decision={analysis.suggestion.decision} /> : null}
              </p>
            )}
          </Block>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-soft">
          <span>Arriero · Pilotos de medios</span>
          <span className="tabular-nums">Generada el {formatDate(today)}</span>
        </div>
      </article>
    </div>
  );
}
