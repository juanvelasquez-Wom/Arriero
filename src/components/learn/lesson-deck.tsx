"use client";

import { BookOpen, Home, PlayCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { BrandIcon, type BrandIconName } from "@/components/brand/icons";
import { celebrate } from "@/components/brand/celebrate";
import { Button } from "@/components/ui/button";
import { LESSONS } from "@/domain/learn-content";
import { DeckDots, DeckNav, DeckProgressBar, scrollDeckTop, SwipeCard, useDeckProgress } from "./deck-shell";
import { LessonInteractionView } from "./interactions";

const STORAGE_KEY = "arriero:aprender";

const ART: Record<string, BrandIconName> = {
  growth: "cafe-crecimiento",
  norte: "montana-cima",
  arbol: "portatil",
  embudo: "embudo",
  problema: "mula-datos",
  ejercicio: "carriel-experimentos",
  ice: "diana",
  calendario: "mapa",
  decision: "camino",
  aprendizaje: "sombrero",
  piloto: "celular-ruta",
};

export function LessonDeck() {
  const total = LESSONS.length;
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
      celebrate("¡Eso! Ya habla growth", "La mula llegó con la carga. Ahora a ponerlo en práctica.");
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

  if (finished) {
    return (
      <div>
        <DeckProgressBar index={total - 1} total={total} finished label="Aprender growth" />
        <div className="slide-in rounded-3xl border bg-paper p-6 text-center shadow-card sm:p-10">
          <BrandIcon name="montana-cima" className="float-soft mx-auto w-32" />
          <h2 className="mt-4 text-3xl font-extrabold">¡Coronó la montaña!</h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-soft">
            Ya sabe lo esencial: norte, árbol, embudo, problemas con evidencia, ejercicios con hipótesis, ICE, calendario, veredicto,
            aprendizaje y pilotos. Menos carreta, más crecimiento.
          </p>
          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            <Button asChild size="lg" className="h-12">
              <Link href="/programas">
                <PlayCircle className="size-5" aria-hidden /> Ver el programa de ejemplo
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12">
              <Link href="/guia">
                <BookOpen className="size-5" aria-hidden /> Cómo se usa el Arriero
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12">
              <Link href="/">
                <Home className="size-5" aria-hidden /> Volver al inicio
              </Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-soft">El programa de ejemplo aparece en Mis programas. Si no está, un admin lo carga con un clic.</p>
          <Button variant="ghost" size="sm" className="mt-4 h-10" onClick={() => save({ index: 0, finished: false })}>
            <RotateCcw className="size-4" aria-hidden /> Empezar otra vez
          </Button>
        </div>
      </div>
    );
  }

  const lesson = LESSONS[index];
  return (
    <div>
      <DeckProgressBar index={index} total={total} finished={false} label="Aprender growth" />
      <SwipeCard cardKey={lesson.id} onNext={next} onPrev={prev}>
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-soft">
              {index + 1}. {lesson.kicker}
            </div>
            <h2 className="mt-1 text-3xl leading-tight font-extrabold sm:text-4xl">{lesson.title}</h2>
          </div>
          <BrandIcon name={ART[lesson.id] ?? "mapa"} className="w-16 shrink-0 sm:w-20" />
        </div>
        <div className="mt-4 space-y-2 text-[15px] leading-relaxed sm:text-base">
          {lesson.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border-l-4 border-highlight bg-wash px-4 py-3">
          <div className="text-xs font-semibold text-soft">Ejemplo · {lesson.example.line}</div>
          <p className="mt-0.5 text-sm">{lesson.example.text}</p>
        </div>
        <div className="mt-6">
          <h3 className="mb-3 text-base font-bold">{lesson.interaction.question}</h3>
          <LessonInteractionView key={lesson.id} interaction={lesson.interaction} />
        </div>
      </SwipeCard>
      <DeckNav index={index} total={total} onPrev={prev} onNext={next} lastLabel="Terminar el curso" />
      <DeckDots index={index} total={total} onGo={go} labels={LESSONS.map((l) => l.title)} />
      <p className="mt-2 text-center text-xs text-soft">Deslice la tarjeta o use las flechas del teclado. Su avance queda guardado en este navegador.</p>
    </div>
  );
}
