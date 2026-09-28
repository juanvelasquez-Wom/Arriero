import { CalendarDays, Check, FlaskConical, Megaphone, Radio, Shapes } from "lucide-react";
import Link from "next/link";
import { DecisionBadge, VerdictBadge } from "@/components/app/status-badge";
import { formatDate } from "@/domain/format";
import { isOn, learningHref } from "@/domain/learning-search";
import { VARIABLE_CATEGORY_LABEL } from "@/domain/pilots/labels";
import { DECISIONS, VERDICTS, type Decision, type Verdict } from "@/domain/types";
import { cn } from "@/lib/utils";

type Params = Record<string, string | string[] | undefined>;

/** Nombre visible de una palanca (categoría de variable de pilotos o texto libre). */
export function leverLabel(lever: string | null | undefined): string | null {
  if (!lever) return null;
  return (VARIABLE_CATEGORY_LABEL as Record<string, string>)[lever] ?? lever;
}

/**
 * Interruptor en la URL (p. ej. "Incluir pilotos de medios"): un enlace que prende o
 * apaga el parámetro y deja los demás filtros como están.
 */
export function IncludeToggle({ pathname, params, param, label }: { pathname: string; params: Params; param: string; label: string }) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === param || v == null) continue;
    for (const one of Array.isArray(v) ? v : [v]) next.append(k, one);
  }
  const on = isOn(params[param]);
  if (!on) next.set(param, "1");
  const qs = next.toString();
  return (
    <Link
      href={qs ? `${pathname}?${qs}` : pathname}
      role="switch"
      aria-checked={on}
      scroll={false}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        on ? "border-ink bg-ink text-paper" : "bg-paper text-ink hover:bg-wash",
      )}
    >
      <span aria-hidden className={cn("grid size-4 place-items-center rounded-sm border", on ? "border-paper" : "border-soft")}>
        {on ? <Check className="size-3" /> : null}
      </span>
      {label}
    </Link>
  );
}

export interface UnifiedLearningCardItem {
  source: "experiment" | "pilot";
  id: string;
  text: string;
  created_at: string;
  item_id: string;
  item_title: string;
  program_id: string | null;
  program_name: string | null;
  line_name: string | null;
  verdict: string | null;
  decision: string | null;
  lever: string | null;
  channel: string | null;
  decided_at: string | null;
}

const asVerdict = (v: string | null) => ((VERDICTS as readonly string[]).includes(v ?? "") ? (v as Verdict) : null);
const asDecision = (v: string | null) => ((DECISIONS as readonly string[]).includes(v ?? "") ? (v as Decision) : null);

/** Tarjeta de un aprendizaje de la biblioteca unificada, con su origen (ejercicio o piloto) a la vista. */
export function UnifiedLearningCard({ item }: { item: UnifiedLearningCardItem }) {
  const pilot = item.source === "pilot";
  const SourceIcon = pilot ? Megaphone : FlaskConical;
  const lever = leverLabel(item.lever);
  const where = pilot ? "Piloto de medios" : [item.program_name, item.line_name].filter(Boolean).join(" · ") || "Ejercicio";
  return (
    <li className="lift rounded-2xl border bg-paper p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={learningHref(item)} className="font-heading font-bold hover:underline">
            {item.item_title}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-soft">
            <span className="inline-flex items-center gap-1 font-medium text-ink">
              <SourceIcon aria-hidden className="size-3.5" />
              {where}
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <CalendarDays aria-hidden className="size-3.5" />
              {formatDate((item.decided_at ?? item.created_at).slice(0, 10))}
            </span>
            {item.channel ? (
              <span className="inline-flex items-center gap-1">
                <Radio aria-hidden className="size-3.5" />
                {item.channel}
              </span>
            ) : null}
            {lever ? (
              <span className="inline-flex items-center gap-1">
                <Shapes aria-hidden className="size-3.5" />
                {lever}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <VerdictBadge verdict={asVerdict(item.verdict)} />
          <DecisionBadge decision={asDecision(item.decision)} />
        </div>
      </div>
      <p className="mt-3 text-sm whitespace-pre-line">{item.text}</p>
    </li>
  );
}
