import Link from "next/link";
import type { JourneyStage } from "@/domain/journey";
import { cn } from "@/lib/utils";
import { Mule } from "./logo";

/** "El camino del arriero": las 7 etapas con su conteo. La mula va en la etapa más avanzada con algo. */
export function JourneyStrip({ programId, stages, note }: { programId: string; stages: JourneyStage[]; note?: string }) {
  const furthest = stages.reduce((acc, s, i) => (s.count > 0 ? i : acc), 0);
  return (
    <section aria-labelledby="camino-titulo" className="rise rounded-2xl border bg-paper p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="camino-titulo" className="text-lg font-extrabold">
          El camino del arriero
        </h2>
        <p className="text-xs text-soft">Del dato al camino: dónde está la carga de este programa.</p>
      </div>
      <ol className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pt-7 pb-1">
        {stages.map((s, i) => (
          <li key={s.key} className="relative min-w-[128px] flex-1 snap-start">
            {i === furthest ? (
              <Mule className="mule-walk absolute -top-7 left-1/2 w-9 -translate-x-1/2" />
            ) : null}
            <Link
              href={`/programas/${programId}${s.path}`}
              className={cn(
                "lift flex h-full flex-col rounded-xl border px-3 py-3",
                s.attention ? "border-highlight bg-highlight/20" : "bg-wash/60",
                s.count === 0 && "opacity-70",
              )}
            >
              <span className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.06em] text-soft uppercase">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full text-[9px] text-paper",
                    s.attention ? "bg-[#111111] text-highlight" : "bg-ink",
                  )}
                >
                  {i + 1}
                </span>
                {s.label}
              </span>
              <span className="mt-1 font-heading text-3xl font-extrabold tabular-nums">{s.count}</span>
              <span className="text-xs text-soft">{s.what}</span>
            </Link>
            {i < stages.length - 1 ? (
              <span aria-hidden className="absolute top-1/2 -right-2 z-10 hidden h-px w-2 bg-line md:block" />
            ) : null}
          </li>
        ))}
      </ol>
      {note ? <p className="mt-3 text-xs font-medium text-soft tabular-nums">{note}</p> : null}
    </section>
  );
}
