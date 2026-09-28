import { BadgeCheck, Sprout } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/domain/format";
import { INSIGHT_STAGE_LABEL, INSIGHT_STATUS_LABEL, SOURCE_LABEL, type InsightRow } from "@/domain/insights";
import { cn } from "@/lib/utils";
import { VoteButton } from "./insight-actions";

export function StatusChip({ status }: { status: InsightRow["status"] }) {
  const Icon = status === "planted" ? Sprout : status === "validated" ? BadgeCheck : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        status === "planted" ? "bg-highlight text-[#111111]" : status === "validated" ? "bg-ink text-paper" : status === "archived" ? "border text-soft" : "bg-gray-1",
      )}
    >
      {Icon ? <Icon aria-hidden className="size-3" /> : null}
      {INSIGHT_STATUS_LABEL[status]}
    </span>
  );
}

export function InsightCard({ insight, meId }: { insight: InsightRow; meId: string }) {
  const i = insight;
  return (
    <li className="pop-in">
      <article className="lift group relative flex h-full flex-col gap-3 rounded-2xl border bg-paper p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip status={i.status} />
          <span className="rounded-full bg-wash px-2 py-0.5 text-[11px] font-medium">{SOURCE_LABEL[i.source]}</span>
          {i.line_hint ? <span className="rounded-full bg-wash px-2 py-0.5 text-[11px] font-medium">{i.line_hint}</span> : null}
          {i.stage ? <span className="rounded-full bg-wash px-2 py-0.5 text-[11px] font-medium">{INSIGHT_STAGE_LABEL[i.stage]}</span> : null}
        </div>
        <h2 className="text-balance font-heading text-lg leading-snug font-bold">
          <Link href={`/insights/${i.id}`} className="after:absolute after:inset-0 hover:underline">
            {i.title}
          </Link>
        </h2>
        {i.detail ? <p className="line-clamp-2 text-sm text-soft">{i.detail}</p> : null}
        {i.tags.length ? (
          <div className="flex flex-wrap gap-1">
            {i.tags.map((t) => (
              <span key={t} className="text-xs text-soft">
                #{t}
              </span>
            ))}
          </div>
        ) : null}
        <div className="relative z-10 mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-xs text-soft">
            {i.author_name} · {formatDate(i.created_at.slice(0, 10))}
          </span>
          <VoteButton id={i.id} votes={i.votes} voted={i.voted_by_me} mine={i.created_by === meId} />
        </div>
      </article>
    </li>
  );
}
