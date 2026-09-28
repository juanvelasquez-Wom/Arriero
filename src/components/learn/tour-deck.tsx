"use client";

import { Award, ArrowUpRight, GraduationCap, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { BrandIcon } from "@/components/brand/icons";
import { celebrate } from "@/components/brand/celebrate";
import { Button } from "@/components/ui/button";
import { TOUR_STEPS } from "@/domain/learn-content";
import { CertificateQuiz } from "./certificate-quiz";
import { DeckDots, DeckNav, DeckProgressBar, scrollDeckTop, SwipeCard, useDeckProgress } from "./deck-shell";
import { TourMockView } from "./tour-mocks";

const STORAGE_KEY = "arriero:guia";

export function TourDeck({ userName }: { userName: string }) {
  const [quiz, setQuiz] = useState(false);
  const total = TOUR_STEPS.length;
  const [progress, save] = useDeckProgress(STORAGE_KEY, total);
  const { index, finished } = progress;

  const go = useCallback(
    (i: number) => {
      save({ index: Math.min(Math.max(i, 0), total - 1), finished: false });
      scrollDeckTop();
    },
    [save, total],
  );
  const next = useCallback(() => {
    if (finished) return;
    if (index >= total - 1) {
      save({ index, finished: true });
      scrollDeckTop();
      celebrate("¡Listo pues! Ya conoce el camino", "Ahora sí: a ensillar la mula.");
      return;
    }
    go(index + 1);
  }, [finished, index, total, save, go]);
  const prev = useCallback(() => {
    if (finished) {
      save({ index: total - 1, finished: false });
      return;
    }
    go(index - 1);
  }, [finished, index, total, save, go]);

  if (finished && quiz) {
    return <CertificateQuiz kind="arriero" defaultName={userName} onExit={() => setQuiz(false)} />;
  }

  if (finished) {
    return (
      <div>
        <DeckProgressBar index={total - 1} total={total} finished label="Cómo se usa el Arriero" />
        <div className="slide-in rounded-3xl border bg-paper p-6 text-center shadow-card sm:p-10">
          <BrandIcon name="mula-sombrero" className="float-soft mx-auto w-32" />
          <h2 className="mt-4 text-3xl font-extrabold">Ya se sabe el camino</h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-soft">
            Programa, líneas, carga semanal, oportunidades de mejora, ejercicios, tableros, pilotos y dirección. Lo demás se aprende andando.
          </p>
          <div className="mx-auto mt-6 max-w-md rounded-2xl bg-highlight p-4 text-left text-[#111111]">
            <div className="flex items-center gap-3">
              <Award className="size-8 shrink-0" aria-hidden />
              <div>
                <div className="font-heading text-lg font-extrabold leading-tight">¿Y el cartón qué?</div>
                <p className="text-sm text-[#111111]/80">10 preguntas sobre la herramienta. Con 7 buenas se gana su cartón de Arriero de la Herramienta. Para colgarlo en el cubículo.</p>
              </div>
            </div>
            <Button size="lg" className="mt-3 h-12 w-full bg-[#111111] text-[#F6F6F4] hover:bg-[#111111]/90" onClick={() => setQuiz(true)}>
              Presentar el examen
            </Button>
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="h-12 text-base">
              <Link href="/">Hágale pues</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12">
              <Link href="/aprender">
                <GraduationCap className="size-5" aria-hidden /> Repasar growth
              </Link>
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="mt-4 h-10" onClick={() => save({ index: 0, finished: false })}>
            <RotateCcw className="size-4" aria-hidden /> Ver el recorrido otra vez
          </Button>
        </div>
      </div>
    );
  }

  const step = TOUR_STEPS[index];
  return (
    <div>
      <DeckProgressBar index={index} total={total} finished={false} label="Cómo se usa el Arriero" />
      <SwipeCard cardKey={step.id} onNext={next} onPrev={prev}>
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-soft">Paso {index + 1}</div>
        <h2 className="mt-1 text-3xl leading-tight font-extrabold sm:text-4xl">{step.title}</h2>
        <div className="mt-3 space-y-2 text-[15px] leading-relaxed sm:text-base">
          {step.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <div className="mt-5">
          <TourMockView mock={step.mock} />
        </div>
        <ul className="mt-5 space-y-2">
          {step.points.map((p) => (
            <li key={p} className="flex gap-2 text-sm">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink" aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-col gap-1.5 sm:flex-row sm:items-center">
          <Button asChild variant="outline" size="lg" className="h-12">
            <Link href={step.href}>
              {step.hrefLabel} <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </Button>
          {step.scope === "program" ? (
            <span className="text-xs text-soft sm:ml-2">Esto vive dentro de cada programa: entre a uno desde Mis programas.</span>
          ) : null}
        </div>
      </SwipeCard>
      <DeckNav index={index} total={total} onPrev={prev} onNext={next} lastLabel="Terminar el recorrido" />
      <DeckDots index={index} total={total} onGo={go} labels={TOUR_STEPS.map((s) => s.title)} />
      <p className="mt-2 text-center text-xs text-soft">Deslice la tarjeta o use las flechas del teclado.</p>
    </div>
  );
}
