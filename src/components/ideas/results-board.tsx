import { Cross, Medal, Star, Trophy } from "lucide-react";
import { authorLabel, ripLine, type RankedIdea } from "@/domain/ideas";
import { cn } from "@/lib/utils";
import type { LinkedTargets } from "@/server/queries/ideas";
import { DecisionControls, type DecisionProps } from "./decision-controls";

const one = (n: number | null) => (n == null ? "—" : n.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

type Ctx = { canDecide: boolean; isAdmin: boolean; canPilot: boolean; targets: Record<string, LinkedTargets> };

function decisionProps(r: RankedIdea, ctx: Ctx): DecisionProps {
  const i = r.idea;
  return {
    ideaId: i.id,
    ideaTitle: i.title,
    decision: i.decision,
    linked: !!i.linked_at,
    canDecide: ctx.canDecide && !i.linked_at,
    isAdmin: ctx.isAdmin,
    canPilot: ctx.canPilot,
    insightId: i.insight_id,
    program: ctx.targets[i.id]?.program ?? null,
    pilot: ctx.targets[i.id]?.pilot ?? null,
  };
}

function Numbers({ r }: { r: RankedIdea }) {
  if (r.score == null) return <span className="text-xs text-soft">Sin puntaje: nadie se animó.{r.favorites ? ` ★ ${r.favorites}` : ""}</span>;
  return (
    <span className="text-xs text-soft tabular-nums">
      <strong className="text-ink">{one(r.score)}</strong> de 25 · impacto {one(r.impact)} × facilidad {one(r.ease)} · {r.voters}{" "}
      {r.voters === 1 ? "voto" : "votos"}
      {r.favorites ? ` · ★ ${r.favorites}` : ""}
    </span>
  );
}

const PODIUM = [
  { label: "Primer puesto", icon: Trophy, className: "bg-highlight text-[#111111] border-transparent sm:order-2 sm:-mt-3" },
  { label: "Segundo puesto", icon: Medal, className: "bg-paper sm:order-1" },
  { label: "Tercer puesto", icon: Medal, className: "bg-paper sm:order-3" },
];

/** Podio, tabla completa y cementerio de ideas. */
export function ResultsBoard({ ranked, buried, ctx }: { ranked: RankedIdea[]; buried: RankedIdea[]; ctx: Ctx }) {
  const podium = ranked.filter((r) => r.score != null || r.favorites > 0).slice(0, 3);
  const rest = ranked.filter((r) => !podium.includes(r));

  return (
    <div className="space-y-8">
      {podium.length ? (
        <section aria-labelledby="podio">
          <h2 id="podio" className="font-heading text-xl font-extrabold">
            El podio
          </h2>
          <p className="mb-3 text-sm text-soft">Impacto × facilidad, promedio de lo que puntuó la recua. Empata el que tenga más «¡Esta!».</p>
          <ol className="stagger grid gap-3 sm:grid-cols-3 sm:items-end">
            {podium.map((r, idx) => {
              const P = PODIUM[idx];
              return (
                <li key={r.idea.id} className={cn("pop-in flex flex-col gap-2 rounded-2xl border p-4 shadow-card", P.className)}>
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
                    <P.icon aria-hidden className="size-4" /> {P.label}
                  </div>
                  <p className="text-pretty font-heading text-lg leading-snug font-bold">{r.idea.title}</p>
                  <p className={cn("text-xs", idx === 0 ? "text-[#111111]/75" : "text-soft")}>{authorLabel(r.idea)}</p>
                  <div className={cn(idx === 0 && "[&_*]:text-[#111111]")}>
                    <Numbers r={r} />
                  </div>
                  <div className="mt-auto pt-1">
                    <DecisionControls {...decisionProps(r, ctx)} />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {rest.length ? (
        <section aria-labelledby="tabla">
          <h2 id="tabla" className="font-heading text-xl font-extrabold">
            {podium.length ? "El resto de la tabla" : "Las ideas"}
          </h2>
          <ul className="mt-3 divide-y rounded-2xl border bg-paper shadow-card">
            {rest.map((r) => (
              <li key={r.idea.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <span className="w-8 shrink-0 font-heading text-lg font-extrabold tabular-nums text-soft">{r.score == null ? "·" : r.position}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-pretty font-medium leading-snug">{r.idea.title}</p>
                  <p className="text-xs text-soft">{authorLabel(r.idea)}</p>
                  <Numbers r={r} />
                </div>
                <DecisionControls {...decisionProps(r, ctx)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="cementerio" className="rounded-3xl bg-[#111111] p-5 text-[#F6F6F4]">
        <h2 id="cementerio" className="flex items-center gap-2 font-heading text-xl font-extrabold">
          <Cross aria-hidden className="size-5" /> Cementerio de ideas
        </h2>
        {buried.length === 0 ? (
          <p className="mt-1 text-sm text-[#F6F6F4]/70">Vacío. Nadie ha muerto todavía… todavía.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-[#F6F6F4]/70">
              {buried.length === 1 ? "Aquí yace una idea." : `Aquí yacen ${buried.length} ideas.`} Murieron para que otras vivieran. Un minuto de
              silencio.
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {buried.map((r) => (
                <li key={r.idea.id} className="rounded-t-[2rem] rounded-b-xl border border-[#F6F6F4]/20 px-4 pt-4 pb-3 text-center">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F6F6F4]/60">Q. E. P. D.</div>
                  <p className="mt-1 text-pretty font-heading font-bold leading-snug">{r.idea.title}</p>
                  <p className="mt-1 text-xs text-[#F6F6F4]/70 italic">{ripLine(r.idea.id)}</p>
                  <p className="mt-1 text-[11px] text-[#F6F6F4]/50">
                    {authorLabel(r.idea)}
                    {r.score != null ? ` · ${one(r.score)} de 25` : ""}
                    {r.favorites ? (
                      <>
                        {" "}
                        · <Star aria-hidden className="inline size-3" /> {r.favorites}
                      </>
                    ) : null}
                  </p>
                  {ctx.canDecide ? (
                    <div className="mt-2 flex justify-center [&_button]:text-[#F6F6F4] [&_button:hover]:bg-[#F6F6F4]/10">
                      <DecisionControls {...decisionProps(r, ctx)} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
