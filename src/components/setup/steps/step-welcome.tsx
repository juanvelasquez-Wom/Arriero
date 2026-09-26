import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Mule } from "@/components/brand/logo";
import { SLOGAN } from "@/components/brand/phrases";
import { Button } from "@/components/ui/button";
import { WELCOME_IDEAS } from "../help-content";

/** Recorrido guiado inicial: el modelo de growth en cinco ideas. */
export function StepWelcome({ startHref }: { startHref: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rise flex flex-col-reverse gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-soft">Antes de arrancar, mire el terreno</div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Así funciona un programa de growth</h1>
          <p className="mt-2 font-heading text-lg font-bold">{SLOGAN}</p>
        </div>
        <Mule className="w-20 shrink-0 sm:w-28" />
      </div>
      <p className="rise rise-delay-1 mt-4 max-w-2xl text-soft">
        En vez de apostarle a grandes campañas por intuición, el crecimiento se construye con muchos ejercicios pequeños, medidos y
        encadenados. Cada ejercicio responde una pregunta, y lo aprendido es lo que hace crecer el negocio. Estas son las cinco ideas que va
        a configurar:
      </p>
      <ol className="rise rise-delay-2 mt-6 grid gap-3 sm:grid-cols-2">
        {WELCOME_IDEAS.map((idea, i) => (
          <li key={idea.title} className="flex gap-3 rounded-2xl border bg-paper p-4 shadow-card">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink font-heading text-sm font-bold text-paper">
              {i + 1}
            </span>
            <div>
              <h2 className="text-base font-bold">{idea.title}</h2>
              <p className="mt-1 text-sm text-soft">{idea.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="rise rise-delay-3 mt-6 rounded-2xl border bg-wash p-4 text-sm">
        <strong>Lo que va a hacer ahora:</strong> definir el periodo y el calendario comercial, los horizontes, las líneas de negocio y, para
        cada línea, su métrica norte, su árbol de métricas y su embudo. Después, el equipo y las reglas para priorizar. Toma entre 10 y 20
        minutos (lo que dura un tinto largo), se guarda en cada paso y puede retomarlo cuando quiera. En cada pantalla encuentra ayudas y ejemplos.
      </div>
      <div className="mt-6 flex justify-end">
        <Button size="lg" asChild>
          <Link href={startHref}>
            Hágale pues <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}
