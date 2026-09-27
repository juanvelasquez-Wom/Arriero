import { ArrowRight, ListChecks, Zap } from "lucide-react";
import Link from "next/link";
import { Mule } from "@/components/brand/logo";
import { SLOGAN } from "@/components/brand/phrases";
import { Button } from "@/components/ui/button";
import { START_PATHS, WELCOME_IDEAS } from "../help-content";

/** Recorrido guiado inicial: el modelo de growth en cinco ideas y los dos caminos para arrancar. */
export function StepWelcome({ quickHref, startHref }: { quickHref: string; startHref: string }) {
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
        encadenados. Cada ejercicio responde una pregunta, y lo aprendido es lo que hace crecer el negocio. Estas son las cinco ideas del
        modelo:
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

      <h2 className="rise rise-delay-3 mt-8 text-xl font-bold">¿Por dónde quiere arrancar?</h2>
      <div className="rise rise-delay-3 mt-3 grid gap-3 sm:grid-cols-2">
        <section className="flex flex-col rounded-2xl border-2 border-ink bg-paper p-5 shadow-card" aria-labelledby="path-quick">
          <span className="mb-2 inline-flex w-fit items-center gap-1 rounded-full bg-highlight px-2 py-0.5 text-xs font-semibold text-[#1F1F1F]">
            <Zap className="size-3" aria-hidden /> {START_PATHS.quick.badge}
          </span>
          <h3 id="path-quick" className="text-lg font-bold">
            {START_PATHS.quick.title}
          </h3>
          <p className="mt-1 flex-1 text-sm text-soft">{START_PATHS.quick.text}</p>
          <Button size="lg" className="mt-4 self-start" asChild>
            <Link href={quickHref}>
              {START_PATHS.quick.cta} <ArrowRight aria-hidden />
            </Link>
          </Button>
        </section>
        <section className="flex flex-col rounded-2xl border bg-paper p-5 shadow-card" aria-labelledby="path-full">
          <span className="mb-2 inline-flex w-fit items-center gap-1 rounded-full bg-wash px-2 py-0.5 text-xs font-semibold text-soft">
            <ListChecks className="size-3" aria-hidden /> {START_PATHS.full.badge}
          </span>
          <h3 id="path-full" className="text-lg font-bold">
            {START_PATHS.full.title}
          </h3>
          <p className="mt-1 flex-1 text-sm text-soft">{START_PATHS.full.text}</p>
          <Button size="lg" variant="outline" className="mt-4 self-start" asChild>
            <Link href={startHref}>
              {START_PATHS.full.cta} <ArrowRight aria-hidden />
            </Link>
          </Button>
        </section>
      </div>
      <p className="mt-3 text-xs text-soft">
        Tome el camino que tome, todo queda editable en Configuración. Si arranca rápido, después puede completar líneas base, metas y más
        líneas sin volver a empezar.
      </p>
    </div>
  );
}
