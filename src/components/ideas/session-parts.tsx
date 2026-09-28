import { Check, CloudRain, Gavel, Star } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/domain/format";
import { IDEA_PHASES, isOverdue, type IdeaPhase, type IdeaSessionRow } from "@/domain/ideas";
import { cn } from "@/lib/utils";

const PHASE_ICON = { open: CloudRain, voting: Star, closed: Gavel } as const;

/** Pastilla de la fase: amarillo solo mientras llueve o se vota (exige atención). */
export function PhaseChip({ phase }: { phase: IdeaPhase }) {
  const Icon = PHASE_ICON[phase];
  const p = IDEA_PHASES.find((x) => x.key === phase)!;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        phase === "closed" ? "bg-gray-1" : "bg-highlight text-[#111111]",
      )}
    >
      <Icon aria-hidden className="size-3" />
      {p.short}
    </span>
  );
}

/** Los tres pasos del aguacero, con el actual resaltado. */
export function PhaseStepper({ phase }: { phase: IdeaPhase }) {
  const current = IDEA_PHASES.findIndex((p) => p.key === phase);
  return (
    <ol aria-label="Fases del aguacero" className="grid grid-cols-3 gap-1.5">
      {IDEA_PHASES.map((p, i) => {
        const Icon = PHASE_ICON[p.key];
        const on = i === current;
        const done = i < current;
        return (
          <li
            key={p.key}
            aria-current={on ? "step" : undefined}
            className={cn(
              "flex min-w-0 items-center gap-1.5 rounded-xl border px-2 py-2 text-xs sm:px-3 sm:text-sm",
              on ? "border-transparent bg-highlight font-semibold text-[#111111]" : done ? "bg-wash text-ink" : "text-soft",
            )}
          >
            {done ? <Check aria-hidden className="size-4 shrink-0" /> : <Icon aria-hidden className="size-4 shrink-0" />}
            <span className="truncate">{p.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function SessionCard({ s, today }: { s: IdeaSessionRow; today: string }) {
  const late = s.phase !== "closed" && isOverdue(s.deadline, today);
  return (
    <li className="pop-in">
      <article className="lift group relative flex h-full flex-col gap-3 rounded-2xl border bg-paper p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-1.5">
          <PhaseChip phase={s.phase} />
          {s.line_hint ? <span className="rounded-full bg-wash px-2 py-0.5 text-[11px] font-medium">{s.line_hint}</span> : null}
          {s.deadline ? (
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", late ? "bg-ink text-paper" : "bg-wash")}>
              {late ? "Se venció el " : "Hasta el "}
              {formatDate(s.deadline)}
            </span>
          ) : null}
        </div>
        <h2 className="text-balance font-heading text-lg leading-snug font-bold">
          <Link href={`/ideas/${s.id}`} className="after:absolute after:inset-0 hover:underline">
            {s.title}
          </Link>
        </h2>
        {s.context ? <p className="line-clamp-2 text-sm text-soft">{s.context}</p> : null}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-soft">
          <span>
            {s.mine ? "Suyo" : s.owner_name} · {formatDate(s.created_at.slice(0, 10))}
          </span>
          <span className="tabular-nums">
            {s.idea_count} {s.idea_count === 1 ? "idea" : "ideas"}
            {s.phase === "closed" ? ` · ${s.chosen_count} elegidas · ${s.buried_count} enterradas` : ""}
          </span>
        </div>
      </article>
    </li>
  );
}
