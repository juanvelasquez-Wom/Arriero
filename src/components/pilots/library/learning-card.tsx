import { CalendarDays, Radio, Shapes } from "lucide-react";
import Link from "next/link";
import { DecisionBadge, DemoBadge, VerdictBadge } from "@/components/app/status-badge";
import { PilotTestTypeBadge } from "@/components/pilots/pilot-badges";
import { formatDate } from "@/domain/format";
import { VARIABLE_CATEGORY_LABEL } from "@/domain/pilots/labels";
import { learningDate } from "@/domain/pilots/library";
import type { VariableCategory } from "@/domain/pilots/types";
import type { PilotLearningItem } from "@/server/queries/pilots";

/** Tarjeta de un aprendizaje de piloto (mismo estilo que los aprendizajes de ejercicios). */
export function PilotLearningCard({ item }: { item: PilotLearningItem }) {
  const category = item.variable_category ? (VARIABLE_CATEGORY_LABEL[item.variable_category as VariableCategory] ?? item.variable_category) : null;
  return (
    <li className="lift rounded-2xl border bg-paper p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/pilotos/${item.pilot_id}`} className="font-heading font-bold hover:underline">
              {item.pilot_title}
            </Link>
            {item.is_example ? <DemoBadge /> : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-soft">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <CalendarDays aria-hidden className="size-3.5" />
              {formatDate(learningDate(item))}
            </span>
            {item.media_names.length ? (
              <span className="inline-flex items-center gap-1">
                <Radio aria-hidden className="size-3.5" />
                {item.media_names.join(", ")}
              </span>
            ) : null}
            {item.variable_name ? (
              <span className="inline-flex items-center gap-1">
                <Shapes aria-hidden className="size-3.5" />
                {item.variable_name}
                {category ? ` · ${category}` : ""}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <VerdictBadge verdict={item.verdict} />
          <DecisionBadge decision={item.decision} />
        </div>
      </div>
      <p className="mt-3 text-sm whitespace-pre-line">{item.text}</p>
      <PilotTestTypeBadge testType={item.test_type} className="mt-3" />
    </li>
  );
}
