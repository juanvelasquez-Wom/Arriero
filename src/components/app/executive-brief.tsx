import { ArrowRight, Megaphone, Minus, TrendingDown, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { BrandIcon, type BrandIconName } from "@/components/brand/icons";
import { DecisionBadge } from "@/components/app/status-badge";
import { PilotStatusBadge } from "@/components/pilots/pilot-badges";
import type { BriefKey, BriefTone, ExecutiveBrief, GrowthDecisionsTrend } from "@/domain/executive";
import { formatDate, formatNumber, formatPercent, formatShortDate, formatSignedPercent } from "@/domain/format";
import { PILOT_STATUSES, type PilotStatus } from "@/domain/pilots/types";
import { DECISIONS, type Decision } from "@/domain/types";
import type { ReportPeriodKey } from "@/domain/report";
import { cn } from "@/lib/utils";

const ART: Record<BriefKey, BrandIconName> = {
  growing: "cafe-crecimiento",
  falling: "embudo",
  running: "mula-cargada",
  results: "diana",
  learned: "tinto",
  value: "portatil",
  decide: "arriero",
  next: "mapa",
  risks: "camino",
};

// Punto de estado: forma + color, nunca solo color (el texto dice el resto).
const DOT: Record<BriefTone, string> = {
  good: "bg-emerald-600 dark:bg-emerald-400",
  bad: "bg-red-600 dark:bg-red-400",
  attention: "bg-highlight",
  neutral: "bg-gray-3",
};

/** El resumen ejecutivo en preguntas de comité, para la semana o el mes. */
export function ExecutiveBriefView({ brief, periodKey }: { brief: ExecutiveBrief; periodKey: ReportPeriodKey }) {
  const needsAttention = (k: BriefKey) => (k === "falling" || k === "decide" || k === "risks") && brief.sections.find((s) => s.key === k)!.items.length > 0;
  return (
    <section aria-labelledby="resumen-titulo" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="resumen-titulo" className="text-2xl font-extrabold">
            El resumen en nueve preguntas
          </h2>
          <p className="text-sm text-soft">
            {brief.period.label} ({formatDate(brief.period.start)} – {formatDate(brief.period.end)}) ·{" "}
            {brief.programs.map((p) => p.name).join(", ")}
            {brief.includesDemo ? " · con datos de ejemplo" : ""}
          </p>
        </div>
        <nav aria-label="Periodo del resumen" className="flex gap-1 rounded-full border bg-paper p-1">
          {(
            [
              ["semana", "Esta semana"],
              ["mes", "Este mes"],
            ] as const
          ).map(([k, label]) => (
            <Link
              key={k}
              href={`/direccion?periodo=${k}`}
              aria-current={periodKey === k ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-medium",
                periodKey === k ? "bg-highlight text-[#111111]" : "text-soft hover:bg-wash hover:text-ink",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="stagger grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {brief.sections.map((s) => {
          return (
            <article
              key={s.key}
              className={cn("rounded-2xl border bg-paper p-4 shadow-card", needsAttention(s.key) && "border-highlight")}
            >
              <h3 className="flex items-center gap-2 text-base font-bold">
                <BrandIcon name={ART[s.key]} className="w-9 shrink-0" />
                {s.question}
                {s.items.length ? (
                  <span className="ml-auto rounded-full bg-wash px-2 py-0.5 text-xs font-semibold tabular-nums">{s.items.length}</span>
                ) : null}
              </h3>
              {s.items.length === 0 ? (
                <p className="mt-2 text-sm text-soft">{s.empty}</p>
              ) : (
                <ul className="mt-2 space-y-2.5">
                  {s.items.slice(0, 5).map((it, idx) => (
                    <li key={idx} className="flex gap-2 text-sm">
                      <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[it.tone])} />
                      <div className="min-w-0">
                        {it.href ? (
                          <Link href={it.href} className="font-medium hover:underline">
                            {it.text}
                          </Link>
                        ) : (
                          <span className="font-medium">{it.text}</span>
                        )}
                        {it.detail ? <div className="text-xs text-soft">{it.detail}</div> : null}
                        {it.action && it.href ? (
                          <Link href={it.href} className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-4">
                            {it.action} <ArrowRight aria-hidden className="size-3" />
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  ))}
                  {s.items.length > 5 ? <li className="text-xs text-soft">Y {s.items.length - 5} más.</li> : null}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// North Star de Arriero y Pilotos de medios (dirección)
// -----------------------------------------------------------------------------

const TREND_TEXT: Record<NonNullable<GrowthDecisionsTrend["trend"]>, { icon: typeof TrendingUp; text: string }> = {
  up: { icon: TrendingUp, text: "Sube frente a las 4 semanas anteriores" },
  down: { icon: TrendingDown, text: "Baja frente a las 4 semanas anteriores" },
  flat: { icon: Minus, text: "Igual que las 4 semanas anteriores" },
};

/** Barras semanales simples (gris; la semana actual en tinta). Siempre con el número a la vista. */
function WeekBars({ rows, label }: { rows: { week_start: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol aria-label={label} className="mt-3 flex h-24 items-end gap-1.5">
      {rows.map((r, i) => (
        <li key={r.week_start} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`Semana del ${formatDate(r.week_start)}: ${r.value}`}>
          <span className="text-[11px] font-semibold tabular-nums">{r.value}</span>
          <span
            aria-hidden
            className={cn("w-full rounded-t-sm", i === rows.length - 1 ? "bg-ink" : "bg-gray-3")}
            style={{ height: `${Math.max(4, (r.value / max) * 56)}px` }}
          />
          <span className="text-[10px] text-soft tabular-nums">{formatShortDate(r.week_start)}</span>
        </li>
      ))}
    </ol>
  );
}

export interface ArrieroNorthStarProps {
  decisions: GrowthDecisionsTrend;
  sustained: { held: number; notHeld: number; missing: number; share: number | null; scaled: number } | null;
  /** Solo para admins: personas activas por semana. Null si no aplica o no hay datos. */
  wau: { week_start: string; users: number }[] | null;
}

/** "North Star de Arriero": ¿el método está produciendo decisiones con evidencia? */
export function ArrieroNorthStar({ decisions, sustained, wau }: ArrieroNorthStarProps) {
  const trend = decisions.trend ? TREND_TEXT[decisions.trend] : null;
  const TrendIcon = trend?.icon;
  const current = decisions.weeks.at(-1);
  const fromExperiments = decisions.weeks.reduce((a, w) => a + w.experiments, 0);
  const fromPilots = decisions.weeks.reduce((a, w) => a + w.pilots, 0);
  return (
    <section aria-labelledby="north-star-arriero" className="rounded-2xl border bg-paper p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-soft">North Star de Arriero</p>
          <h2 id="north-star-arriero" className="text-xl font-extrabold">
            Decisiones de growth con evidencia por semana
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-soft" data-explain>
            Cuenta los ejercicios decididos con resultados en todas las variantes y aprendizaje escrito, más los pilotos de medios decididos. Si esto no
            se mueve, el método no está dando fruto.
          </p>
        </div>
        <div className="text-right">
          <div className="font-heading text-3xl font-extrabold tabular-nums">{current?.total ?? 0}</div>
          <div className="text-xs text-soft">esta semana · {formatNumber(Math.round(decisions.average * 10) / 10)} en promedio</div>
        </div>
      </div>
      <WeekBars rows={decisions.weeks.map((w) => ({ week_start: w.week_start, value: w.total }))} label="Decisiones con evidencia por semana, últimas 8 semanas" />
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-soft">
        {trend && TrendIcon ? (
          <span className="inline-flex items-center gap-1 font-medium text-ink">
            <TrendIcon aria-hidden className="size-3.5" /> {trend.text}
          </span>
        ) : (
          <span>Todavía no hay decisiones con evidencia en las últimas 8 semanas.</span>
        )}
        <span className="tabular-nums">
          {fromExperiments} de ejercicios · {fromPilots} de pilotos
        </span>
      </div>

      {(sustained && sustained.scaled > 0) || wau ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {sustained && sustained.scaled > 0 ? (
            <div className="rounded-xl border bg-wash/60 px-3 py-2">
              <div className="text-[11px] text-soft">Escalados que sostienen el lift</div>
              <div className="text-lg font-bold tabular-nums">{formatPercent(sustained.share)}</div>
              <div className="text-[11px] text-soft tabular-nums">
                {sustained.share == null
                  ? `${sustained.scaled} escalado${sustained.scaled === 1 ? "" : "s"}, todavía sin datos para leer después de escalar`
                  : `${sustained.held} de ${sustained.held + sustained.notHeld} con lectura${sustained.missing ? ` · ${sustained.missing} sin datos aún` : ""}`}
              </div>
            </div>
          ) : null}
          {wau ? (
            <div className="rounded-xl border bg-wash/60 px-3 py-2">
              <div className="flex items-center gap-1 text-[11px] text-soft">
                <Users aria-hidden className="size-3" /> Personas activas por semana (solo admins)
              </div>
              <div className="text-lg font-bold tabular-nums">{wau.at(-1)?.users ?? 0}</div>
              <div className="text-[11px] text-soft tabular-nums">Últimas 8 semanas: {wau.map((w) => w.users).join(" · ")}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export interface DirectionPilotItem {
  id: string;
  title: string;
  status: string;
  decision: string | null;
  decided_at: string | null;
  result: { probability: number | null; liftPct: number | null } | null;
  resultArmName: string | null;
}

function PilotResult({ p }: { p: DirectionPilotItem }) {
  if (!p.result) return <span className="text-xs text-soft">Sin lectura todavía</span>;
  const parts = [
    p.resultArmName ? `${p.resultArmName}:` : null,
    p.result.liftPct != null ? `${formatSignedPercent(p.result.liftPct / 100)} frente al control` : null,
    p.result.probability != null ? `· ${formatPercent(p.result.probability)} de probabilidad de ganar` : null,
  ].filter(Boolean);
  return <span className="text-xs tabular-nums">{parts.join(" ")}</span>;
}

const asDecision = (v: string | null) => ((DECISIONS as readonly string[]).includes(v ?? "") ? (v as Decision) : null);

/** Pilotos de medios activos y decididos en los últimos 30 días, para que dirección vea todas las pruebas. */
export function DirectionPilotsSection({ active, decided, hasMore }: { active: DirectionPilotItem[]; decided: DirectionPilotItem[]; hasMore: boolean }) {
  const row = (p: DirectionPilotItem) => (
    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <Link href={`/pilotos/${p.id}`} className="font-medium hover:underline">
          {p.title}
        </Link>
        <div>
          <PilotResult p={p} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {p.status === "decided" ? (
          <>
            <DecisionBadge decision={asDecision(p.decision)} />
            {p.decided_at ? <span className="text-xs text-soft tabular-nums">{formatDate(p.decided_at.slice(0, 10))}</span> : null}
          </>
        ) : (PILOT_STATUSES as readonly string[]).includes(p.status) ? (
          <PilotStatusBadge status={p.status as PilotStatus} />
        ) : null}
      </div>
    </li>
  );
  return (
    <section aria-labelledby="pilotos-direccion" className="rounded-2xl border bg-paper p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="pilotos-direccion" className="flex items-center gap-2 text-xl font-extrabold">
            <Megaphone aria-hidden className="size-5" /> Pilotos de medios
          </h2>
          <p className="text-sm text-soft">Las pruebas en medios también cuentan: lo que está corriendo y lo que se decidió en los últimos 30 días.</p>
        </div>
        <Link href="/pilotos" className="inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-4">
          Ver portafolio <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      {active.length === 0 && decided.length === 0 ? (
        <p className="mt-3 text-sm text-soft">No hay pilotos activos ni decididos en los últimos 30 días. La mula de medios está quieta.</p>
      ) : (
        <div className="mt-3 grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-bold">Activos ({active.length})</h3>
            {active.length ? <ul className="divide-y">{active.map(row)}</ul> : <p className="text-sm text-soft">Ninguno corriendo ahora.</p>}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-bold">Decididos en los últimos 30 días ({decided.length})</h3>
            {decided.length ? <ul className="divide-y">{decided.map(row)}</ul> : <p className="text-sm text-soft">Ninguno decidido en el último mes.</p>}
          </div>
        </div>
      )}
      {hasMore ? <p className="mt-3 text-xs text-soft">Se muestran 10. El resto está en el portafolio de pilotos.</p> : null}
    </section>
  );
}
