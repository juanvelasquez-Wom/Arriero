import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WELCOME_IDEAS } from "../help-content";

/** Recorrido guiado inicial: el modelo de growth en cinco ideas. */
export function StepWelcome({ startHref }: { startHref: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-soft">Antes de empezar</div>
      <h1 className="text-3xl font-semibold tracking-tight">Cómo funciona un programa de growth</h1>
      <p className="mt-2 max-w-2xl text-soft">
        En lugar de apostar por grandes campañas basadas en intuición, el crecimiento se construye con muchos ejercicios pequeños, medidos
        y encadenados. Cada ejercicio responde una pregunta, y lo aprendido es lo que hace crecer el negocio. Estas son las cinco ideas
        que vas a configurar:
      </p>
      <ol className="mt-6 grid gap-3 sm:grid-cols-2">
        {WELCOME_IDEAS.map((idea, i) => (
          <li key={idea.title} className="flex gap-3 rounded-xl border bg-paper p-4">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-highlight text-sm font-semibold text-[#1f1f1f]">
              {i + 1}
            </span>
            <div>
              <div className="font-medium">{idea.title}</div>
              <p className="mt-1 text-sm text-soft">{idea.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 rounded-xl border bg-wash p-4 text-sm">
        <strong>Qué vas a hacer ahora:</strong> definir el periodo y el calendario comercial, los horizontes, las líneas de negocio y, para
        cada línea, su métrica norte, su árbol de métricas y su embudo. Después, el equipo y las reglas para priorizar. Toma entre 10 y 20
        minutos, se guarda en cada paso y puedes retomarlo cuando quieras. En cada pantalla tienes ayudas y ejemplos.
      </div>
      <div className="mt-6 flex justify-end">
        <Button size="lg" asChild>
          <Link href={startHref}>
            Empezar <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}
