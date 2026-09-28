"use client";

import { History } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { StatusBadge, VerdictBadge } from "@/components/app/status-badge";
import { similarLearnings } from "@/domain/learning-search";
import { findSimilar, hasEnoughText, similarExperimentMessage, snippet } from "@/domain/similarity";
import type { WizardData } from "../wizard-values";

/**
 * "Esto se parece a…": hasta 3 ejercicios y 3 aprendizajes del programa parecidos al
 * borrador, para no repetir lo que ya se probó (o para partir de lo aprendido).
 */
export function SimilarBox({
  data,
  draftText,
  excludeExperimentId,
  excludeLearningId,
}: {
  data: WizardData;
  draftText: string;
  excludeExperimentId?: string;
  excludeLearningId: string | null;
}) {
  const enough = hasEnoughText(draftText);
  const experiments = useMemo(
    () =>
      enough
        ? findSimilar(
            draftText,
            data.similar.experiments.filter((e) => e.id !== excludeExperimentId),
            (e) => e.text,
          )
        : [],
    [enough, draftText, data.similar.experiments, excludeExperimentId],
  );
  const learnings = useMemo(
    () =>
      enough
        ? findSimilar(
            draftText,
            data.similar.learnings.filter((l) => l.id !== excludeLearningId && l.experiment_id !== excludeExperimentId),
            (l) => [l.experiment_title, l.text].join(" "),
          )
        : [],
    [enough, draftText, data.similar.learnings, excludeLearningId, excludeExperimentId],
  );
  // Biblioteca unificada: lo que ya se aprendió en Pilotos (con sinónimos telco).
  const pilots = useMemo(
    () => (enough ? similarLearnings(draftText, data.similar.pilotLearnings ?? [], { limit: 3 }) : []),
    [enough, draftText, data.similar.pilotLearnings],
  );
  if (!experiments.length && !learnings.length && !pilots.length) return null;
  const base = `/programas/${data.programId}/ejercicios`;

  return (
    <section aria-label="Ejercicios y aprendizajes parecidos" className="rounded-xl border bg-wash px-3.5 py-3 text-sm">
      <div className="mb-2 flex items-center gap-1.5 font-medium">
        <History className="size-4" aria-hidden /> Esto se parece a…
      </div>
      <ul className="space-y-2.5">
        {experiments.map(({ item: e }) => (
          <li key={e.id}>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`${base}/${e.id}`} className="font-medium underline-offset-2 hover:underline" target="_blank">
                {e.title}
              </Link>
              <StatusBadge status={e.status} />
              {e.verdict ? <VerdictBadge verdict={e.verdict} /> : null}
            </div>
            <p className="text-xs text-soft">
              {similarExperimentMessage({ lineName: e.line_name, date: e.date, status: e.status, verdict: e.verdict })}
            </p>
          </li>
        ))}
        {learnings.map(({ item: l }) => (
          <li key={l.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-soft">Aprendizaje de</span>
              <Link href={`${base}/${l.experiment_id}`} className="font-medium underline-offset-2 hover:underline" target="_blank">
                {l.experiment_title}
              </Link>
              {l.line_name ? <span className="text-xs text-soft">· {l.line_name}</span> : null}
            </div>
            <p className="text-xs text-soft">“{snippet(l.text)}” Aprovéchelo: lo que ya se aprendió no hay que volverlo a pagar.</p>
          </li>
        ))}
        {pilots.map(({ item: l }) => (
          <li key={`pilot-${l.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-soft">Esto ya se aprendió en el piloto</span>
              <Link href={l.href} className="font-medium underline-offset-2 hover:underline" target="_blank">
                {l.item_title}
              </Link>
              {l.channel ? <span className="text-xs text-soft">· {l.channel}</span> : null}
            </div>
            <p className="text-xs text-soft">“{snippet(l.text)}”</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
