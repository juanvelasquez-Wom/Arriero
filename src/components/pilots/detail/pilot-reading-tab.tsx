import { CircleCheck, CircleHelp, Gavel, Info, MapPin, ScanSearch, ShieldAlert, Sigma, TriangleAlert, Trophy, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Callout, EmptyState, Section } from "@/components/app/page";
import { DecisionBadge, VerdictBadge } from "@/components/app/status-badge";
import { WeakEvidenceBadge, PilotTestTypeBadge } from "@/components/pilots/pilot-badges";
import { PilotTerm } from "@/components/pilots/pilot-term";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime, formatNumber, formatPercent, formatSignedPercent } from "@/domain/format";
import { isPilotApprover, type PilotActor } from "@/domain/pilots/flow";
import { WEAK_EVIDENCE_LABEL as WEAK_EVIDENCE_TEXT } from "@/domain/pilots/analysis";
import { pctText } from "@/domain/pilots/numbers";
import {
  buildAnalysisInput,
  formatPilotValue,
  needsPrePeriod,
  primarySeries,
  resultSentence,
  rulesInWords,
  winnerArmId,
} from "@/domain/pilots/reading";
import { DEFAULT_DECISION_RULES } from "@/domain/pilots/types";
import { confidenceBand, formatProbability } from "@/domain/stats";
import { formatCop } from "@/domain/value";
import { cn } from "@/lib/utils";
import { analyzePilotDetail } from "@/server/pilot-reading";
import type { PilotCatalogs, PilotDetail } from "@/server/queries/pilots";
import { PilotReadingChart } from "./pilot-reading-chart";

const signedPct = (pct: number | null | undefined) => (pct == null ? "—" : formatSignedPercent(pct / 100));

function Figure({ label, value, hint, strong }: { label: ReactNode; value: ReactNode; hint?: ReactNode; strong?: boolean }) {
  return (
    <div>
      <div className="text-xs text-soft">{label}</div>
      <div className={cn("mt-0.5 tabular-nums", strong ? "font-heading text-xl font-extrabold" : "font-semibold")}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-soft">{hint}</div> : null}
    </div>
  );
}

function Band({ probability }: { probability: number | null }) {
  const band = confidenceBand(probability);
  if (!band) return <span className="text-xs text-soft">Sin probabilidad</span>;
  const Icon = band.level === "unknown" ? CircleHelp : band.leaning === "better" ? CircleCheck : TriangleAlert;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <Icon aria-hidden className="size-3.5" />
      {band.label}
    </span>
  );
}

export function PilotReadingTab({ detail, catalogs, actor }: { detail: PilotDetail; catalogs: PilotCatalogs; actor: PilotActor }) {
  const { pilot } = detail;
  const analysis = analyzePilotDetail(detail, catalogs);
  const input = buildAnalysisInput(
    { pilot, arms: detail.arms, guardrails: detail.guardrails, measurements: detail.measurements },
    catalogs.metrics,
  );
  const metricById = new Map(catalogs.metrics.map((m) => [m.id, m]));
  const primaryMetric = pilot.primary_metric_id ? (metricById.get(pilot.primary_metric_id) ?? null) : null;
  const decided = pilot.status === "decided";
  const rules = pilot.decision_rules ?? DEFAULT_DECISION_RULES;

  if (!analysis || !input || !primaryMetric) {
    return (
      <EmptyState
        art="mapa"
        icon={ScanSearch}
        title="Todavía no hay qué leer"
        description="Para leer el piloto hace falta el tipo de prueba, la métrica principal y los grupos. Complételos en el asistente."
      />
    );
  }

  const winnerId = winnerArmId(analysis, pilot.verdict);
  const series = primarySeries(input);
  const startPeriod = needsPrePeriod(pilot.test_type) && input.postStart ? (series.find((p) => p.period >= input.postStart!)?.period ?? null) : null;
  const primary = analysis.primary;
  const comparisonOf = (armId: string) => primary?.comparisons.find((c) => c.armId === armId) ?? null;
  const variants = detail.arms.filter((a) => !a.is_control);
  const showBest = !!primary?.probabilityBest && variants.length > 1;
  const warnings = analysis.warnings.filter((w) => w !== WEAK_EVIDENCE_TEXT);
  const sentence = resultSentence({ analysis, testType: pilot.test_type, metric: primaryMetric, arms: detail.arms });

  const evidence =
    analysis.evidence === "probabilistic" ? (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 text-xs font-medium">
        <Sigma aria-hidden className="size-3.5" /> Comparación bayesiana
      </span>
    ) : analysis.evidence === "placebo" ? (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 text-xs font-medium">
        <MapPin aria-hidden className="size-3.5" /> Geo con <PilotTerm k="placebo">prueba placebo</PilotTerm>
      </span>
    ) : (
      <WeakEvidenceBadge />
    );

  return (
    <div className="space-y-5">
      {/* Tipo de evidencia y resultado en una frase */}
      <Section>
        <div className="flex flex-wrap items-center gap-2">
          <PilotTestTypeBadge testType={pilot.test_type} />
          {analysis.evidence !== "weak" || pilot.test_type !== "pre_post" ? evidence : null}
        </div>
        {analysis.evidence === "weak" ? (
          <p className="mt-2 text-sm text-soft">
            {pilot.test_type === "pre_post"
              ? WEAK_EVIDENCE_TEXT
              : "Sin prueba placebo (hacen falta al menos 2 ciudades de control con datos): la evidencia es débil. Úsela con cuidado."}
          </p>
        ) : null}
        <p className="mt-3 text-[15px] font-medium">{sentence}</p>
        <p className="mt-1 text-xs text-soft">
          Métrica principal: {primaryMetric.name}. Todos los números salen del motor de Arriero, con los datos cargados; nada lo calcula la IA.
        </p>
      </Section>

      {decided ? (
        <Section title="Decisión firmada">
          <div className="flex flex-wrap items-center gap-2">
            <VerdictBadge verdict={pilot.verdict} />
            <DecisionBadge decision={pilot.decision} />
            <span className="text-xs text-soft">
              {pilot.decided_by ? `${detail.people[pilot.decided_by] ?? "Aprobador"} · ` : ""}
              {formatDateTime(pilot.decided_at)}
            </span>
          </div>
          {pilot.decision_justification ? (
            <div className="mt-3">
              <div className="text-xs font-medium text-soft">Justificación</div>
              <p className="mt-0.5 text-sm whitespace-pre-line">{pilot.decision_justification}</p>
            </div>
          ) : null}
          {detail.learning ? (
            <div className="mt-3">
              <div className="text-xs font-medium text-soft">Aprendizaje</div>
              <p className="mt-0.5 text-sm whitespace-pre-line">{detail.learning.text}</p>
            </div>
          ) : null}
        </Section>
      ) : null}

      {warnings.length ? (
        <div className="space-y-2">
          {warnings.map((w) => (
            <Callout key={w} icon={TriangleAlert}>
              {w}
            </Callout>
          ))}
        </div>
      ) : null}

      {!analysis.ready ? (
        <EmptyState
          art="mula-datos"
          icon={ScanSearch}
          title="Faltan datos para leer el resultado"
          description={
            warnings.length
              ? "Revise los avisos de arriba: cuando estén los datos, la lectura aparece sola."
              : "Cargue los datos de cada grupo en la pestaña Datos; la lectura aparece sola."
          }
        />
      ) : null}

      {/* Resultado por grupo */}
      {primary ? (
        <Section
          title={`Resultado · ${primaryMetric.name}`}
          description={pilot.test_type === "holdout" ? "Grupo expuesto frente al holdout." : "Cada grupo frente al control."}
        >
          <ul className="stagger grid gap-3 sm:grid-cols-2">
            {detail.arms.map((arm) => {
              const value = primary.perArm.find((p) => p.armId === arm.id)?.value ?? null;
              const c = comparisonOf(arm.id);
              const isWinner = arm.id === winnerId;
              const best = primary.probabilityBest?.[arm.id] ?? null;
              return (
                <li
                  key={arm.id}
                  className={cn("rounded-xl border p-4", isWinner ? "border-highlight bg-highlight/10" : arm.is_control ? "bg-wash" : "bg-paper")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold">{arm.name}</div>
                    {isWinner ? (
                      <span className="pop-in inline-flex h-6 items-center gap-1 rounded-full bg-highlight px-2.5 text-xs font-semibold text-[#1f1f1f]">
                        <Trophy aria-hidden className="size-3.5" /> Mejor grupo
                      </span>
                    ) : arm.is_control ? (
                      <span className="inline-flex h-6 items-center gap-1 rounded-full border border-line px-2.5 text-xs font-medium">
                        <Users aria-hidden className="size-3.5" /> {pilot.test_type === "holdout" ? "Holdout" : "Control"}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Figure label={primaryMetric.name} value={formatPilotValue(primaryMetric, value)} strong />
                    {c ? <Figure label={<PilotTerm k="lift">Diferencia vs. control</PilotTerm>} value={signedPct(c.liftPct)} strong /> : null}
                    {c && c.lowPct != null && c.highPct != null ? (
                      <Figure label={<PilotTerm k="credibleInterval">Rango probable (90 %)</PilotTerm>} value={`${signedPct(c.lowPct)} a ${signedPct(c.highPct)}`} />
                    ) : null}
                    {c ? (
                      <Figure
                        label={<PilotTerm k="probabilityToWin">Probabilidad de ganar</PilotTerm>}
                        value={formatProbability(c.probabilityBetter)}
                        hint={<Band probability={c.probabilityBetter} />}
                      />
                    ) : null}
                  </div>
                  {showBest && best != null ? (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-soft">
                        <PilotTerm k="probabilityBest">Probabilidad de ser la mejor</PilotTerm>
                        <span className="font-semibold text-ink tabular-nums">{formatProbability(best)}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-1" aria-hidden>
                        <div
                          className={cn("fill-in h-full rounded-full", isWinner ? "bg-highlight" : "bg-gray-4")}
                          style={{ width: `${Math.max(2, Math.round(best * 100))}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {/* Guardrails */}
      {analysis.guardrails.length ? (
        <Section title={<PilotTerm k="guardrail">Guardrails</PilotTerm>} description="Lo que no se podía dañar mientras se probaba.">
          <ul className="divide-y">
            {analysis.guardrails.map((g) => {
              const metric = metricById.get(g.metricId);
              const Icon = g.broken == null ? CircleHelp : g.broken ? ShieldAlert : CircleCheck;
              const status = g.broken == null ? "Sin datos" : g.broken ? "Se rompió" : "Se cumple";
              return (
                <li key={g.guardrailId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="font-medium">{metric?.name ?? "Métrica"}</div>
                    <div className="text-xs text-soft tabular-nums">
                      Cambio: {signedPct(g.changePct)} · Límite: {metric?.direction === "down" ? "no sube" : "no baja"} más de {pctText(g.limitPct)}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold",
                      g.broken ? "border-gray-4 bg-gray-4 text-paper" : "border-line bg-paper",
                    )}
                  >
                    <Icon aria-hidden className="size-3.5" /> {status}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {/* Geo */}
      {analysis.geo ? (
        <Section title="Lectura por geografía" description="Promedios por periodo, antes y después del inicio.">
          {analysis.geo.did ? (
            <div className="overflow-x-auto">
              <Table className="tabular-nums">
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <PilotTerm k="did">Diferencias en diferencias</PilotTerm>
                    </TableHead>
                    <TableHead className="text-right">Antes</TableHead>
                    <TableHead className="text-right">Después</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Prueba</TableCell>
                    <TableCell className="text-right">{formatPilotValue(primaryMetric, analysis.geo.did.pre_test)}</TableCell>
                    <TableCell className="text-right">{formatPilotValue(primaryMetric, analysis.geo.did.post_test)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Control</TableCell>
                    <TableCell className="text-right">{formatPilotValue(primaryMetric, analysis.geo.did.pre_control)}</TableCell>
                    <TableCell className="text-right">{formatPilotValue(primaryMetric, analysis.geo.did.post_control)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Figure label="Efecto por periodo" value={formatPilotValue(primaryMetric, analysis.geo.did.effect)} strong />
                <Figure label="Efecto relativo" value={formatSignedPercent(analysis.geo.did.relative)} strong />
                <Figure label="Periodos antes" value={analysis.geo.did.pre_periods} />
                <Figure label="Periodos después" value={analysis.geo.did.post_periods} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-soft">Faltan periodos antes o después del inicio para comparar.</p>
          )}

          {analysis.geo.placebo ? (
            <div className="mt-5">
              <h3 className="text-sm font-bold">
                <PilotTerm k="placebo">Prueba placebo</PilotTerm>
              </h3>
              <p className="mt-0.5 text-sm">
                {analysis.geo.placebo.placebo_confidence == null
                  ? "No se pudo comparar el efecto con los placebos."
                  : `El efecto real es más grande que ${formatPercent(analysis.geo.placebo.placebo_confidence)} de los placebos.`}
              </p>
              <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
                {analysis.geo.placebo.effects.map((e) => (
                  <li key={e.label} className="flex justify-between gap-2 rounded-lg bg-wash px-3 py-1.5 tabular-nums">
                    <span>{e.label}</span>
                    <span className="font-medium">{formatSignedPercent(e.relative)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {analysis.geo.synthetic ? (
            <div className="mt-5">
              <h3 className="text-sm font-bold">
                <PilotTerm k="syntheticControl">Control sintético</PilotTerm>
              </h3>
              <p className="mt-0.5 text-sm tabular-nums">
                Efecto: {formatPilotValue(primaryMetric, analysis.geo.synthetic.effect)} por periodo ({formatSignedPercent(analysis.geo.synthetic.relative)}).
              </p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {analysis.geo.synthetic.weights
                  .filter((w) => w.weight >= 0.005)
                  .sort((a, b) => b.weight - a.weight)
                  .map((w) => (
                    <li key={w.label} className="grid grid-cols-[minmax(0,8rem)_1fr_3.5rem] items-center gap-2 tabular-nums">
                      <span className="truncate">{w.label}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-gray-1" aria-hidden>
                        <span className="fill-in block h-full rounded-full bg-gray-4" style={{ width: `${Math.round(w.weight * 100)}%` }} />
                      </span>
                      <span className="text-right font-medium">{formatPercent(w.weight)}</span>
                    </li>
                  ))}
              </ul>
              <p className="mt-1 text-xs text-soft">Peso de cada ciudad de control en la mezcla que imita a las de prueba antes del inicio.</p>
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* Holdout */}
      {analysis.holdout ? (
        <Section title={<PilotTerm k="holdout">Lectura del holdout</PilotTerm>} description="Lo que la campaña aporta de verdad frente a quien no la vio.">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Figure label="Tasa del expuesto" value={formatPercent(analysis.holdout.rate_exposed)} strong />
            <Figure label="Tasa del holdout" value={formatPercent(analysis.holdout.rate_holdout)} strong />
            <Figure label={<PilotTerm k="lift">Lift incremental</PilotTerm>} value={formatSignedPercent(analysis.holdout.lift)} strong />
            <Figure label="Conversiones incrementales" value={formatNumber(Math.round(analysis.holdout.incremental_conversions))} />
            <Figure
              label={<PilotTerm k="incremental">Costo por resultado incremental</PilotTerm>}
              value={formatCop(analysis.holdout.cost_per_incremental)}
              hint={analysis.holdout.cost_per_incremental == null ? "Falta la inversión o no hubo incremento." : undefined}
            />
            <Figure
              label={<PilotTerm k="probabilityToWin">Probabilidad de ganar</PilotTerm>}
              value={formatProbability(analysis.holdout.probability_better)}
              hint={<Band probability={analysis.holdout.probability_better} />}
            />
          </div>
        </Section>
      ) : null}

      {/* Serie en el tiempo */}
      {series.length ? (
        <Section
          title={`${primaryMetric.name} por periodo`}
          description={startPeriod ? "La línea punteada marca el inicio del cambio." : "Cada línea es un grupo; el control va punteado."}
        >
          <PilotReadingChart
            points={series}
            arms={detail.arms.map((a) => ({ id: a.id, name: a.name, is_control: a.is_control }))}
            metric={{ calc: primaryMetric.calc, unit: primaryMetric.unit, name: primaryMetric.name }}
            startPeriod={startPeriod}
            winnerId={winnerId}
            caption={`${primaryMetric.name} por periodo y grupo`}
          />
        </Section>
      ) : null}

      {/* Sugerencia */}
      <Section title="Qué hacer">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Arriero sugiere:</span>
          {analysis.suggestion.decision ? <DecisionBadge decision={analysis.suggestion.decision} /> : <span className="text-sm text-soft">Todavía nada</span>}
        </div>
        <ul className="mt-2 space-y-1 text-sm">
          {analysis.suggestion.reasons.map((r) => (
            <li key={r} className="flex items-start gap-1.5">
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-soft" />
              {r}
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-xl bg-wash px-4 py-3">
          <div className="text-xs font-semibold">Reglas de decisión registradas antes de lanzar</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
            {rulesInWords(rules).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-soft">
          <Gavel aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {decided
            ? `Decidido el ${formatDate(pilot.decided_at?.slice(0, 10) ?? null)}.`
            : isPilotApprover(actor)
              ? "Es solo una sugerencia: usted, como aprobador, firma la decisión con su justificación y el aprendizaje."
              : "Es solo una sugerencia: la decisión la firma un aprobador, con su justificación y el aprendizaje."}
        </p>
      </Section>
    </div>
  );
}
