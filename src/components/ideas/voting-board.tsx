"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { authorLabel, MAX_FAVORITES, SCORE_VALUES, type IdeaRow, type IdeaScore } from "@/domain/ideas";
import { cn } from "@/lib/utils";
import { scoreIdea } from "@/server/actions/ideas";
import { IdeaMenu } from "./idea-item";

type Mine = { impact: number | null; ease: number | null; favorite: boolean };

const IMPACT_HINT = ["", "Ni cosquillas", "Algo mueve", "Se nota", "Mueve la aguja", "¡Revienta la meta!"];
const EASE_HINT = ["", "Imposible sin milagro", "Difícil", "Se puede", "Fácil", "Para mañana"];

function Chips({
  label,
  value,
  hints,
  onPick,
  ideaTitle,
}: {
  label: string;
  value: number | null;
  hints: string[];
  onPick: (n: number) => void;
  ideaTitle: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs font-semibold text-soft">{label}</span>
      <div role="radiogroup" aria-label={`${label} de «${ideaTitle}»`} className="flex gap-1">
        {SCORE_VALUES.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            title={hints[n]}
            onClick={() => onPick(n)}
            className={cn(
              "flex size-9 items-center justify-center rounded-full border text-sm font-semibold tabular-nums transition-colors",
              value === n ? "border-transparent bg-ink text-paper" : value != null && n < value ? "bg-gray-1" : "hover:bg-wash",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <span className="hidden min-w-0 truncate text-xs text-soft sm:inline">{value ? hints[value] : ""}</span>
    </div>
  );
}

/**
 * La votación: cada toque guarda al instante. A ciegas: solo se ven los propios
 * puntajes. Máximo 3 «¡Esta!» por aguacero.
 */
export function VotingBoard({ ideas, scores, isBoss }: { ideas: IdeaRow[]; scores: IdeaScore[]; isBoss: boolean }) {
  const router = useRouter();
  const [mine, setMine] = useState<Record<string, Mine>>(() =>
    Object.fromEntries(scores.filter((s) => s.mine).map((s) => [s.idea_id, { impact: s.impact, ease: s.ease, favorite: s.favorite }])),
  );
  const [, start] = useTransition();
  const favLeft = Math.max(0, MAX_FAVORITES - Object.values(mine).filter((m) => m.favorite).length);
  const others = ideas.filter((i) => !i.mine);
  const done = others.filter((i) => mine[i.id]?.impact != null && mine[i.id]?.ease != null).length;

  function save(id: string, patch: Partial<Mine>) {
    const prev = mine[id] ?? { impact: null, ease: null, favorite: false };
    setMine((m) => ({ ...m, [id]: { ...prev, ...patch } }));
    start(async () => {
      const r = await scoreIdea(id, {
        impact: patch.impact ?? undefined,
        ease: patch.ease ?? undefined,
        favorite: patch.favorite,
      });
      if (!r.ok) {
        setMine((m) => ({ ...m, [id]: prev }));
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <div className="sticky top-2 z-10 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-paper/95 px-4 py-3 text-sm shadow-card backdrop-blur">
        <span className="tabular-nums">
          <strong>
            {done} de {others.length}
          </strong>{" "}
          puntuadas {done === others.length && others.length ? "· ¡Juicioso! Ya puede irse a tomar tinto." : ""}
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Star aria-hidden className="size-4" /> Le quedan {favLeft} «¡Esta!»
        </span>
      </div>
      <ul className="stagger grid gap-3 md:grid-cols-2">
        {ideas.map((i) => {
          const m = mine[i.id] ?? { impact: null, ease: null, favorite: false };
          return (
            <li key={i.id} className="pop-in">
              <article className={cn("flex h-full flex-col gap-3 rounded-2xl border bg-paper p-4 shadow-card", m.favorite && "border-highlight")}>
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-pretty font-medium leading-snug">{i.title}</p>
                    {i.detail ? <p className="mt-1 line-clamp-3 text-sm text-soft">{i.detail}</p> : null}
                    <p className="mt-1 text-xs text-soft">{authorLabel(i)}</p>
                  </div>
                  <IdeaMenu idea={i} canEdit={false} canRemove={!i.linked_at && (i.mine || isBoss)} />
                </div>
                {i.mine ? (
                  <p className="mt-auto rounded-xl bg-wash px-3 py-2 text-xs text-soft">
                    Es suya: la puntúan los demás. A la mamá no se le pregunta si el hijo es bonito.
                  </p>
                ) : (
                  <div className="mt-auto space-y-2">
                    <Chips label="Impacto" value={m.impact} hints={IMPACT_HINT} ideaTitle={i.title} onPick={(n) => save(i.id, { impact: n })} />
                    <Chips label="Facilidad" value={m.ease} hints={EASE_HINT} ideaTitle={i.title} onPick={(n) => save(i.id, { ease: n })} />
                    <button
                      type="button"
                      aria-pressed={m.favorite}
                      disabled={!m.favorite && favLeft === 0}
                      onClick={() => save(i.id, { favorite: !m.favorite })}
                      title={!m.favorite && favLeft === 0 ? "Ya usó sus 3. Quítele la estrella a otra." : "Su favorita del aguacero (máximo 3)"}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50",
                        m.favorite ? "border-transparent bg-highlight text-[#111111]" : "hover:bg-wash",
                      )}
                    >
                      <Star aria-hidden className={cn("size-4", m.favorite && "pop-in fill-current")} />
                      {m.favorite ? "¡Esta!" : "¿Esta?"}
                    </button>
                  </div>
                )}
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
