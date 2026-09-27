import { Ban, BookOpen, Link2, ListChecks, Lock, Radio, Ruler, Scale, TriangleAlert, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Callout, Section } from "@/components/app/page";
import { DecisionBadge, ImpactBadge, VerdictBadge } from "@/components/app/status-badge";
import { PilotTestTypeBadge } from "@/components/pilots/pilot-badges";
import { PilotTerm } from "@/components/pilots/pilot-term";
import { LinksEditor } from "@/components/pilots/wizard/links-fields";
import { formatDate, formatDateRange } from "@/domain/format";
import { canEditChecklist, canLogIncident, canWritePilots, hypothesisSentence, type PilotActor } from "@/domain/pilots/flow";
import {
  CHECKLIST_PLATFORM_LABEL,
  CHECKLIST_STATUS_LABEL,
  METRIC_CALC_LABEL,
  PILOT_TERMS,
  PILOT_TEST_TYPE_SETUP,
  PLATFORM_METRIC_WARNING,
} from "@/domain/pilots/labels";
import { pctText } from "@/domain/pilots/numbers";
import { rulesInWords } from "@/domain/pilots/reading";
import { DEFAULT_DECISION_RULES } from "@/domain/pilots/types";
import { formatCop } from "@/domain/value";
import type { LinkOptions, PilotCatalogs, PilotDetail, PilotMember } from "@/server/queries/pilots";
import { ChecklistStatusControl, IncidentForm } from "./pilot-summary-client";

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-xs font-medium text-soft">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

export interface PilotSummaryTabProps {
  detail: PilotDetail;
  catalogs: PilotCatalogs;
  actor: PilotActor;
  overlaps: { otherId: string; otherTitle: string; text: string }[];
  linkOptions: LinkOptions;
  members: PilotMember[];
}

export function PilotSummaryTab({ detail, catalogs, actor, overlaps, linkOptions, members }: PilotSummaryTabProps) {
  const { pilot: p, arms, media, guardrails, checklist, incidents, learning, people } = detail;
  const metric = new Map(catalogs.metrics.map((m) => [m.id, m]));
  const primary = p.primary_metric_id ? metric.get(p.primary_metric_id) : undefined;
  const variable = catalogs.variables.find((v) => v.id === p.variable_id);
  const power = p.power_result;
  const rules = p.decision_rules ?? DEFAULT_DECISION_RULES;
  const program = linkOptions.programs.find((x) => x.id === p.program_id);
  const experiment = linkOptions.experiments.find((x) => x.id === p.experiment_id);
  const treeMetric = linkOptions.metrics.find((x) => x.id === p.tree_metric_id);
  const editChecklist = canEditChecklist(actor, p.status) && !p.deleted_at;
  const pending = checklist.filter((c) => c.status !== "ok").length;

  return (
    <div className="stagger space-y-6">
      {p.status === "decided" ? (
        <Section title="Decisión firmada">
          <div className="flex flex-wrap items-center gap-2">
            <VerdictBadge verdict={p.verdict} />
            <DecisionBadge decision={p.decision} />
            <span className="text-xs text-soft">
              {p.decided_by ? people[p.decided_by] : ""} · {formatDate(p.decided_at?.slice(0, 10))}
            </span>
          </div>
          {p.decision_justification ? <p className="mt-2 text-sm">{p.decision_justification}</p> : null}
          {learning ? (
            <div className="mt-3 rounded-xl border border-highlight bg-highlight/10 p-3 text-sm">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                <BookOpen aria-hidden className="size-3.5" /> Aprendizaje
              </div>
              {learning.text}
            </div>
          ) : null}
        </Section>
      ) : null}

      {p.status === "cancelled" && p.cancel_reason ? (
        <Callout tone="neutral" icon={Ban} title="Piloto cancelado">
          {p.cancel_reason}
        </Callout>
      ) : null}

      {p.design_locked_at ? (
        <Callout tone="neutral" icon={Lock} title={`${PILOT_TERMS.designLock.label} desde el ${formatDate(p.design_locked_at.slice(0, 10))}`}>
          {PILOT_TERMS.designLock.simple}
        </Callout>
      ) : null}

      {overlaps.length ? (
        <Callout icon={TriangleAlert} title="Ojo: este piloto se cruza con otros">
          <ul className="space-y-1">
            {overlaps.map((o) => (
              <li key={o.otherId}>
                <Link href={`/pilotos/${o.otherId}`} className="font-medium underline underline-offset-4">
                  {o.otherTitle}
                </Link>{" "}
                · {o.text}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">Si corren al tiempo sobre lo mismo, se contaminan: ajuste fechas, audiencias o ciudades.</p>
        </Callout>
      ) : null}

      <Section title="Problema e hipótesis">
        <dl className="divide-y">
          <Row label="Problema">{p.problem ?? "—"}</Row>
          {p.problem_evidence ? <Row label="Evidencia">{p.problem_evidence}</Row> : null}
          <Row label="Hipótesis">
            <span className="font-medium">
              {hypothesisSentence({
                change: p.hypothesis_change,
                scope: p.hypothesis_scope,
                metric: p.hypothesis_metric,
                expectedPct: p.hypothesis_expected_pct,
                reason: p.hypothesis_reason,
              })}
            </span>
          </Row>
        </dl>
      </Section>

      <Section title="Qué se prueba y cómo">
        <dl className="divide-y">
          <Row label="Variable">{variable?.name ?? "—"}</Row>
          <Row label="Tipo de prueba">
            <PilotTestTypeBadge testType={p.test_type} />
            {p.test_type ? <p className="mt-1 text-xs text-soft">{PILOT_TEST_TYPE_SETUP[p.test_type]}</p> : null}
            {p.design_justification ? <p className="mt-1 text-xs">Por qué este tipo: {p.design_justification}</p> : null}
          </Row>
          <Row label="Grupos">
            <ul className="space-y-1">
              {arms.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium">{a.name}</span>
                  {a.is_control ? <span className="rounded-full border border-line px-2 text-[11px] font-semibold text-soft">Control</span> : null}
                  {a.split_pct != null ? <span className="text-xs text-soft tabular-nums">{pctText(a.split_pct)}</span> : null}
                  {a.cities.length ? <span className="text-xs text-soft">{a.cities.join(", ")}</span> : null}
                </li>
              ))}
              {!arms.length ? <li className="text-soft">Sin grupos todavía.</li> : null}
            </ul>
          </Row>
          <Row
            label={
              <span className="inline-flex items-center gap-1">
                <Radio aria-hidden className="size-3.5" /> Medios
              </span>
            }
          >
            <ul className="space-y-1.5">
              {media.map((m) => (
                <li key={m.id}>
                  <span className="font-medium">{m.media_name}</span>
                  <span className="text-xs text-soft">
                    {[m.account && `cuenta ${m.account}`, m.campaign && `campaña ${m.campaign}`, m.audience && `audiencia ${m.audience}`, m.destination && `destino ${m.destination}`]
                      .filter(Boolean)
                      .map((x) => ` · ${x}`)
                      .join("")}
                    {m.cities.length ? ` · ${m.cities.join(", ")}` : ""}
                  </span>
                </li>
              ))}
              {!media.length ? <li className="text-soft">Sin medios todavía.</li> : null}
            </ul>
          </Row>
          <Row label="Fechas">
            {formatDateRange(p.planned_start, p.planned_end)} (planeadas)
            {p.actual_start ? <div className="text-xs text-soft">Reales: {formatDateRange(p.actual_start, p.actual_end)}</div> : null}
          </Row>
          <Row label="Presupuesto">{p.planned_budget_cop != null ? formatCop(p.planned_budget_cop) : "—"}</Row>
        </dl>
      </Section>

      <Section
        title={
          <span className="inline-flex items-center gap-1.5">
            <Ruler aria-hidden className="size-4" /> Métricas y potencia
          </span>
        }
      >
        <dl className="divide-y">
          <Row label="Métrica principal">
            {primary ? (
              <>
                <span className="font-medium">{primary.name}</span> <span className="text-xs text-soft">· {METRIC_CALC_LABEL[primary.calc]}</span>
                {primary.scope === "platform" ? <p className="mt-1 text-xs font-medium">{PLATFORM_METRIC_WARNING}</p> : null}
              </>
            ) : (
              "—"
            )}
          </Row>
          <Row label={<PilotTerm k="guardrail" />}>
            <ul className="space-y-1">
              {guardrails.map((g) => (
                <li key={g.id}>
                  {metric.get(g.metric_id)?.name ?? "Métrica"} no empeora más de <span className="tabular-nums">{pctText(g.limit_pct)}</span>
                </li>
              ))}
              {!guardrails.length ? <li className="text-soft">Sin guardrails todavía.</li> : null}
            </ul>
          </Row>
          <Row label={<PilotTerm k="power" />}>
            {power ? (
              <div className="space-y-1">
                <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
                  <span>
                    <PilotTerm k="mde">MDE</PilotTerm>: <strong>{power.mde_pct != null ? pctText(power.mde_pct) : "—"}</strong>
                  </span>
                  <span>
                    Días necesarios: <strong>{power.days_needed ?? "—"}</strong>
                  </span>
                  {power.budget_days != null ? (
                    <span>
                      Días que alcanza el presupuesto: <strong>{power.budget_days}</strong>
                    </span>
                  ) : null}
                </div>
                {power.warnings.map((w) => (
                  <p key={w} className="flex gap-1.5 text-xs">
                    <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" /> {w}
                  </p>
                ))}
              </div>
            ) : (
              <span className="text-soft">Sin calcular todavía.</span>
            )}
          </Row>
        </dl>
      </Section>

      <Section
        title={
          <span className="inline-flex items-center gap-1.5">
            <Scale aria-hidden className="size-4" /> <PilotTerm k="decisionRules" />
          </span>
        }
        description={p.decision_rules ? "Registradas antes de lanzar." : "Todavía no se han registrado: se usan las de por defecto."}
      >
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {rulesInWords(rules).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Section>

      <Section
        title={
          <span className="inline-flex items-center gap-1.5">
            <ListChecks aria-hidden className="size-4" /> <PilotTerm k="checklist" />
          </span>
        }
        description={checklist.length ? (pending ? `${pending} evento(s) por verificar antes de lanzar.` : "Todos los eventos disparan bien.") : undefined}
      >
        {checklist.length ? (
          <ul className="divide-y">
            {checklist.map((c) => (
              <li key={c.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-wash px-2 py-0.5 text-xs font-semibold">{CHECKLIST_PLATFORM_LABEL[c.platform]}</span>
                  <span className="font-medium">{c.event_name}</span>
                  {!editChecklist ? <span className="text-xs text-soft">· {CHECKLIST_STATUS_LABEL[c.status]}</span> : null}
                </div>
                {c.description ? <p className="mt-0.5 text-xs text-soft">{c.description}</p> : null}
                {editChecklist ? (
                  <ChecklistStatusControl pilotId={p.id} itemId={c.id} status={c.status} evidence={c.evidence} />
                ) : c.evidence || c.checked_by ? (
                  <p className="mt-0.5 text-xs text-soft">
                    {c.evidence}
                    {c.checked_by ? ` · ${people[c.checked_by] ?? ""} ${c.checked_at ? formatDate(c.checked_at.slice(0, 10)) : ""}` : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-soft">Todavía no hay eventos en la lista. Se arma en el paso «Medición y envío» del diseño.</p>
        )}
      </Section>

      <Section title="Incidentes" description="Lo que pasó durante la ejecución y puede mover la lectura.">
        {incidents.length ? (
          <ul className="mb-3 divide-y">
            {incidents.map((i) => (
              <li key={i.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:gap-4">
                <span className="w-28 shrink-0 text-xs text-soft tabular-nums">{formatDate(i.occurred_on)}</span>
                <div className="min-w-0 flex-1 text-sm">
                  {i.description}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-soft">
                    <ImpactBadge impact={i.expected_impact} /> {i.created_by ? `· ${people[i.created_by] ?? ""}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-soft">Sin incidentes. Así da gusto.</p>
        )}
        {canLogIncident(actor, p.status) && !p.deleted_at ? <IncidentForm pilotId={p.id} minDate={p.actual_start ?? p.planned_start} /> : null}
      </Section>

      <Section
        title={
          <span className="inline-flex items-center gap-1.5">
            <Link2 aria-hidden className="size-4" /> Responsable y vínculos
          </span>
        }
        description="Opcionales: el programa, el ejercicio y la métrica del árbol de Arriero con los que se relaciona."
      >
        {canWritePilots(actor) && !p.deleted_at ? (
          <LinksEditor
            pilotId={p.id}
            initial={{ owner_id: p.owner_id, program_id: p.program_id, experiment_id: p.experiment_id, tree_metric_id: p.tree_metric_id }}
            options={linkOptions}
            members={members}
          />
        ) : (
          <dl className="divide-y">
            <Row
              label={
                <span className="inline-flex items-center gap-1">
                  <Users aria-hidden className="size-3.5" /> Responsable
                </span>
              }
            >
              {p.owner_id ? (people[p.owner_id] ?? "—") : "—"}
            </Row>
            <Row label="Programa">{program?.name ?? "—"}</Row>
            <Row label="Ejercicio">
              {experiment ? (
                <Link href={`/programas/${experiment.program_id}/ejercicios/${experiment.id}`} className="underline underline-offset-4">
                  {experiment.title}
                </Link>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Métrica del árbol">{treeMetric ? `${treeMetric.name}${treeMetric.line_name ? ` · ${treeMetric.line_name}` : ""}` : "—"}</Row>
          </dl>
        )}
      </Section>
    </div>
  );
}
