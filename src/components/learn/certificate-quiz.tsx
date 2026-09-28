"use client";

import { ArrowRight, CheckCircle2, Download, RotateCcw, XCircle } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { celebrate } from "@/components/brand/celebrate";
import { BrandIcon } from "@/components/brand/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { gradeQuiz, PASS_MARK, QUIZZES, retryMessage, type CertificateKind } from "@/domain/certificates";
import { cn } from "@/lib/utils";
import { Certificate } from "./certificate";

const RIGHT = ["¡Eso!", "¡Uy, sí señor!", "¡Pa' las que sea!", "¡Ahí está el detalle!", "¡Qué nivel!"];
const WRONG = ["Ese camino no era.", "¡Ay, qué pesar!", "Casi, pero no.", "La mula se rió un poquito."];

// Hoy en Bogotá, como YYYY-MM-DD.
const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

interface Saved {
  correct: number;
  date: string;
  name: string;
}

function storageKey(kind: CertificateKind) {
  return `arriero:carton:${kind}`;
}
function readSaved(kind: CertificateKind): Saved | null {
  try {
    const raw = window.localStorage.getItem(storageKey(kind));
    const v = raw ? (JSON.parse(raw) as Saved) : null;
    return v && typeof v.correct === "number" && typeof v.date === "string" ? v : null;
  } catch {
    return null;
  }
}
function writeSaved(kind: CertificateKind, v: Saved) {
  try {
    window.localStorage.setItem(storageKey(kind), JSON.stringify(v));
  } catch {
    // sin almacenamiento: el cartón se descarga igual mientras la página esté abierta
  }
}

/** Examen de 10 preguntas y, si pasa, el cartón para descargar en PDF. */
export function CertificateQuiz({ kind, defaultName, onExit }: { kind: CertificateKind; defaultName: string; onExit: () => void }) {
  const questions = QUIZZES[kind];
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [index, setIndex] = useState(0);
  // El examen se monta al hacer clic (nunca en el servidor): se puede leer el navegador de una.
  // Si ya se ganó el cartón antes en este navegador, se muestra directo.
  const [done, setDone] = useState<Saved | null>(() => readSaved(kind));
  const [name, setName] = useState(() => readSaved(kind)?.name || defaultName);

  if (done) {
    return <Diploma kind={kind} saved={done} name={name} onName={setName} onRetake={() => { setDone(null); setIndex(0); setAnswers(questions.map(() => null)); }} onExit={onExit} />;
  }

  const finishedAll = index >= questions.length;
  if (finishedAll) {
    const grade = gradeQuiz(kind, answers);
    return (
      <div className="slide-in rounded-3xl border bg-paper p-6 text-center shadow-card sm:p-10">
        <BrandIcon name="mula-cargada" className="mx-auto w-28" />
        <h2 className="mt-4 text-3xl font-extrabold">
          {grade.correct} de {grade.total}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] text-soft">
          {retryMessage(grade.correct)} Necesita {PASS_MARK} para el cartón.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button size="lg" className="h-12" onClick={() => { setIndex(0); setAnswers(questions.map(() => null)); }}>
            <RotateCcw className="size-5" aria-hidden /> Intentar otra vez
          </Button>
          <Button size="lg" variant="outline" className="h-12" onClick={onExit}>
            Repasar primero
          </Button>
        </div>
      </div>
    );
  }

  const q = questions[index];
  const next = () => {
    if (index === questions.length - 1) {
      const grade = gradeQuiz(kind, answers);
      if (grade.passed) {
        const saved: Saved = { correct: grade.correct, date: todayIso(), name };
        writeSaved(kind, saved);
        setDone(saved);
        celebrate("¡Se ganó el cartón!", `${grade.correct} de 10. La Mula Mayor ya está firmando.`);
        return;
      }
    }
    setIndex((i) => i + 1);
  };
  const picked = answers[index];
  const answered = picked != null;
  const right = picked === q.answer;
  const reaction = (right ? RIGHT : WRONG)[index % (right ? RIGHT.length : WRONG.length)];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm text-soft">
        <span className="font-semibold text-ink">Examen para el cartón</span>
        <span className="tabular-nums">
          Pregunta {index + 1} de {questions.length}
        </span>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-gray-1">
        <div className="h-full rounded-full bg-highlight transition-[width] duration-300" style={{ width: `${(index / questions.length) * 100}%` }} />
      </div>
      <div key={q.id} className="slide-in rounded-3xl border bg-paper p-5 shadow-card sm:p-8">
        <h2 className="text-2xl leading-tight font-extrabold sm:text-3xl">{q.question}</h2>
        <ul className="mt-5 grid gap-2">
          {q.options.map((opt, i) => {
            const isPicked = picked === i;
            const isAnswer = q.answer === i;
            return (
              <li key={opt}>
                <button
                  type="button"
                  disabled={answered}
                  onClick={() => setAnswers((a) => a.map((v, j) => (j === index ? i : v)))}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] transition-colors",
                    !answered && "hover:border-ink hover:bg-wash",
                    answered && isAnswer && "border-ink bg-highlight font-semibold text-[#111111]",
                    answered && isPicked && !isAnswer && "border-dashed text-soft line-through",
                  )}
                >
                  {answered && isAnswer ? <CheckCircle2 className="size-5 shrink-0" aria-hidden /> : null}
                  {answered && isPicked && !isAnswer ? <XCircle className="size-5 shrink-0" aria-hidden /> : null}
                  {opt}
                </button>
              </li>
            );
          })}
        </ul>
        {answered ? (
          <div className="pop-in mt-4 rounded-2xl bg-wash px-4 py-3 text-sm" role="status">
            <span className="font-bold">{reaction}</span> {q.why}
          </div>
        ) : null}
        <div className="mt-5 flex justify-end">
          <Button size="lg" className="h-12" disabled={!answered} onClick={next}>
            {index === questions.length - 1 ? "Ver cómo me fue" : "Siguiente"} <ArrowRight className="size-5" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Diploma({
  kind,
  saved,
  name,
  onName,
  onRetake,
  onExit,
}: {
  kind: CertificateKind;
  saved: Saved;
  name: string;
  onName: (v: string) => void;
  onRetake: () => void;
  onExit: () => void;
}) {
  const download = () => {
    writeSaved(kind, { ...saved, name });
    // El título sugiere el nombre del archivo al guardar como PDF.
    const previous = document.title;
    document.title = `Carton Arriero ${kind === "growth" ? "Growth" : "Herramienta"} - ${name.trim() || "Arriero"}`;
    const restore = () => {
      document.title = previous;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };
  return (
    <div className="slide-in space-y-4">
      <div className="rounded-3xl border bg-paper p-5 shadow-card sm:p-6">
        <h2 className="text-2xl font-extrabold">¡Cartón ganado! {saved.correct} de 10</h2>
        <p className="mt-1 text-sm text-soft">Revise cómo quiere que salga su nombre y descárguelo. Enmárquelo, que la mula no firma dos veces.</p>
        <label className="mt-4 block text-sm font-medium" htmlFor={`carton-${kind}`}>
          Nombre en el cartón
        </label>
        <Input id={`carton-${kind}`} value={name} maxLength={60} onChange={(e) => onName(e.target.value)} className="mt-1 h-11" />
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button size="lg" className="h-12" onClick={download}>
            <Download className="size-5" aria-hidden /> Descargar el cartón en PDF
          </Button>
          <Button size="lg" variant="outline" className="h-12" onClick={onRetake}>
            <RotateCcw className="size-5" aria-hidden /> Repetir el examen
          </Button>
          <Button size="lg" variant="ghost" className="h-12" onClick={onExit}>
            Volver
          </Button>
        </div>
        <p className="mt-2 text-xs text-soft">Se abre la ventana de impresión: en «Destino» elija «Guardar como PDF».</p>
      </div>
      <Certificate kind={kind} name={name} correct={saved.correct} date={saved.date} />
      {/* Copia para imprimir, directo en <body>: fuera de animaciones, que dañan el tamaño de la hoja. */}
      {createPortal(
        <div className="print-portal">
          <Certificate kind={kind} name={name} correct={saved.correct} date={saved.date} printable />
        </div>,
        document.body,
      )}
    </div>
  );
}
