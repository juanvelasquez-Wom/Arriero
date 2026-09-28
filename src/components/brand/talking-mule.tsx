"use client";

import { useState } from "react";
import { Mule } from "./logo";

const LINES = [
  "¿Y eso con qué dato?",
  "Yo cargo, usted decide. Trato justo.",
  "Menos carreta, más crecimiento. Y más panela.",
  "Si no tiene grupo control, no me lo cuente.",
  "El lunes se carga la semana. Yo no perdono.",
  "¿Otra reunión sin evidencia? Me voy a echar.",
  "Un ICE de 9 con confianza 2... ajá, sí, claro.",
  "En congelamiento no se lanza nada. Ni un meme.",
  "Hágale pues, que la trocha no se camina sola.",
  "Yo subo la montaña con carga. ¿Usted qué excusa tiene?",
];

/** La mula de la trocha del inicio: camina, y si le hacen clic, opina. */
export function TalkingMule() {
  const [line, setLine] = useState<number | null>(null);
  return (
    <div className="relative h-24 overflow-visible">
      <div className="absolute inset-x-0 bottom-2 border-b-2 border-dashed border-line" />
      <div className={`home-trail absolute bottom-2${line == null ? "" : " paused"}`}>
        {line != null ? (
          <div role="status" className="pop-in absolute bottom-full left-1/2 mb-2 w-max max-w-[16rem] -translate-x-1/2 rounded-2xl border bg-paper px-3 py-1.5 text-sm font-medium shadow-card">
            {LINES[line]}
            <span aria-hidden className="absolute top-full left-1/2 -mt-px size-2 -translate-x-1/2 rotate-45 border-r border-b bg-paper" />
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setLine((l) => ((l ?? -1) + 1) % LINES.length)}
          onBlur={() => setLine(null)}
          aria-label="Hablar con la mula"
          title="Háblele a la mula"
          className="block cursor-pointer rounded-md"
        >
          <span className="home-trail-face block">
            <Mule className="mule-walk w-11" />
          </span>
        </button>
      </div>
    </div>
  );
}
