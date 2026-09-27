import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { BrandIcon, type BrandIconName } from "@/components/brand/icons";
import type { BriefKey, BriefTone, ExecutiveBrief } from "@/domain/executive";
import { formatDate } from "@/domain/format";
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
