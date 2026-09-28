"use client";

import { ArrowDown, ArrowUp, Check, RotateCcw, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatSignedPercent } from "@/domain/format";
import {
  HYPOTHESIS_SLOTS,
  iceVerdict,
  isOrderCorrect,
  lessonIce,
  lessonLift,
  shuffleForOrder,
  type HypothesisSlot,
  type LessonInteraction,
} from "@/domain/learn-content";
import { cn } from "@/lib/utils";

type Of<K extends LessonInteraction["kind"]> = Extract<LessonInteraction, { kind: K }>;

function Feedback({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p
      role="status"
      className={cn(
        "pop-in mt-3 flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-sm",
        ok ? "border-highlight bg-highlight/15 text-ink" : "bg-wash text-ink",
      )}
    >
      {ok ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> : <X className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span>{children}</span>
    </p>
  );
}

// ---------------------------------------------------------------------------

function ChoiceInteraction({ data }: { data: Of<"choice"> }) {
  const [picked, setPicked] = useState<string | null>(null);
  const option = data.options.find((o) => o.id === picked);
  return (
    <div>
      <div className="grid gap-2" role="radiogroup" aria-label={data.question}>
        {data.options.map((o) => {
          const active = picked === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPicked(o.id)}
              className={cn(
                "min-h-12 rounded-2xl border bg-paper px-4 py-3 text-left text-[15px] transition-colors motion-reduce:transition-none",
                "hover:border-ink/40",
                active && o.correct && "border-highlight bg-highlight/15 font-semibold",
                active && !o.correct && "border-ink/40 bg-wash",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {option ? (
        <Feedback key={option.id} ok={option.correct}>
          {option.feedback}
          {!option.correct ? " Pruebe otra." : null}
        </Feedback>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

const ICE_LABELS = [
  { k: "impact", label: "Impacto", hint: "¿Cuánto movería la métrica?" },
  { k: "confidence", label: "Confianza", hint: "¿Qué tanta evidencia hay?" },
  { k: "ease", label: "Facilidad", hint: "¿Qué tan fácil es montarlo?" },
] as const;

function IceInteraction({ data }: { data: Of<"ice"> }) {
  const [values, setValues] = useState(data.initial);
  const ice = lessonIce(values.impact, values.confidence, values.ease);
  return (
    <div data-no-swipe>
      <p className="mb-3 rounded-2xl bg-wash px-3 py-2 text-sm">
        <span className="font-semibold">Idea:</span> {data.idea}
      </p>
      <div className="space-y-4">
        {ICE_LABELS.map(({ k, label, hint }) => (
          <div key={k}>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">
                {label} <span className="font-normal text-soft">· {hint}</span>
              </span>
              <span className="font-heading text-lg font-bold tabular-nums">{values[k]}</span>
            </div>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[values[k]]}
              onValueChange={([v]) => setValues((prev) => ({ ...prev, [k]: v }))}
              aria-label={label}
              className="py-2"
            />
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-4 rounded-2xl border bg-wash/60 px-4 py-3">
        <div className="text-center">
          <div className="text-[11px] font-medium text-soft">ICE</div>
          <div className="font-heading text-4xl font-extrabold tabular-nums" aria-live="polite">
            {ice.toFixed(1)}
          </div>
        </div>
        <p className="text-sm">
          ({values.impact} + {values.confidence} + {values.ease}) ÷ 3. {iceVerdict(ice)}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function OrderInteraction({ data }: { data: Of<"order"> }) {
  const expected = useMemo(() => data.items.map((i) => i.id), [data.items]);
  const [order, setOrder] = useState(() => shuffleForOrder(expected));
  const done = isOrderCorrect(expected, order);
  const byId = new Map(data.items.map((i) => [i.id, i]));

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }

  return (
    <div data-no-swipe>
      <ol className="space-y-2">
        {order.map((id, i) => {
          const item = byId.get(id);
          if (!item) return null;
          const inPlace = expected[i] === id;
          return (
            <li
              key={id}
              className={cn(
                "flex items-center gap-2 rounded-2xl border bg-paper py-1.5 pr-1.5 pl-3 transition-colors motion-reduce:transition-none",
                done && "border-highlight bg-highlight/15",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full font-heading text-sm font-bold",
                  done ? "bg-highlight text-[#1F1F1F]" : "bg-gray-2",
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{item.label}</span>
                <span className="block text-xs text-soft">{item.hint}</span>
              </span>
              {done && inPlace ? <Check className="pop-in size-5 shrink-0" aria-hidden /> : null}
              {!done ? (
                <span className="flex shrink-0 gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-11"
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0}
                    aria-label={`Subir ${item.label}`}
                  >
                    <ArrowUp className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-11"
                    onClick={() => move(i, i + 1)}
                    disabled={i === order.length - 1}
                    aria-label={`Bajar ${item.label}`}
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </Button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {done ? <Feedback ok>{data.success}</Feedback> : <p className="mt-3 text-xs text-soft">Use las flechas para subir o bajar cada etapa.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

function HypothesisInteraction({ data }: { data: Of<"hypothesis"> }) {
  // Pedazos revueltos de forma estable; la persona elige un pedazo y luego la casilla.
  const pieces = useMemo(() => shuffleForOrder(data.parts), [data.parts]);
  const [placed, setPlaced] = useState<Partial<Record<HypothesisSlot, number>>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [miss, setMiss] = useState(false);

  const usedPieces = new Set(Object.values(placed));
  const allPlaced = HYPOTHESIS_SLOTS.every((s) => placed[s.slot] != null);
  const allRight = allPlaced && HYPOTHESIS_SLOTS.every((s) => pieces[placed[s.slot]!].slot === s.slot);

  function drop(slot: HypothesisSlot) {
    if (selected == null) {
      // Tocar una casilla llena la vacía.
      if (placed[slot] != null) {
        setPlaced((p) => ({ ...p, [slot]: undefined }));
        setMiss(false);
      }
      return;
    }
    const piece = pieces[selected];
    if (piece.slot !== slot) {
      setMiss(true);
      return;
    }
    setMiss(false);
    setPlaced((p) => ({ ...p, [slot]: selected }));
    setSelected(null);
  }

  return (
    <div data-no-swipe>
      <div className="space-y-2">
        {HYPOTHESIS_SLOTS.map(({ slot, label }) => {
          const idx = placed[slot];
          const filled = idx != null;
          return (
            <button
              key={slot}
              type="button"
              onClick={() => drop(slot)}
              aria-label={filled ? `${label}: ${pieces[idx].text}` : `Poner aquí el ${label}`}
              className={cn(
                "flex min-h-12 w-full items-start gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors motion-reduce:transition-none",
                filled ? "border-highlight bg-highlight/15" : "border-dashed bg-wash/60",
                selected != null && !filled && "border-ink/50",
              )}
            >
              <span className="w-20 shrink-0 pt-0.5 font-heading text-xs font-extrabold tracking-wider">{label}</span>
              <span className={cn("text-sm", !filled && "text-soft")}>{filled ? pieces[idx].text : "…"}</span>
            </button>
          );
        })}
      </div>
      {!allPlaced ? (
        <div className="mt-4 flex flex-col gap-2">
          {pieces.map((p, i) =>
            usedPieces.has(i) ? null : (
              <button
                key={p.text}
                type="button"
                aria-pressed={selected === i}
                onClick={() => {
                  setSelected(selected === i ? null : i);
                  setMiss(false);
                }}
                className={cn(
                  "min-h-12 rounded-2xl border bg-paper px-4 py-2.5 text-left text-sm transition-colors motion-reduce:transition-none hover:border-ink/40",
                  selected === i && "border-ink bg-wash font-semibold",
                )}
              >
                {p.text}
              </button>
            ),
          )}
        </div>
      ) : null}
      {miss ? <Feedback ok={false}>Esa casilla no es. Pista: el SI es lo que hacemos; el PORQUE, lo que creemos del cliente.</Feedback> : null}
      {allRight ? <Feedback ok>{data.success}</Feedback> : null}
      {allPlaced ? (
        <Button variant="ghost" size="sm" className="mt-2 h-10" onClick={() => setPlaced({})}>
          <RotateCcw className="size-4" aria-hidden /> Volver a armar
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function LiftInteraction({ data }: { data: Of<"lift"> }) {
  const [test, setTest] = useState(data.initial);
  const lift = lessonLift(data.control, test) ?? 0;
  const extra = test - data.control;
  const max = data.max;
  const bars = [
    { label: "Control", value: data.control, highlight: false },
    { label: "Con el cambio", value: test, highlight: extra > 0 },
  ];
  const message =
    extra > 0
      ? `${extra} ventas más por cada 1.000 personas. Esa es la incrementalidad: ventas que sin el cambio no habrían pasado.`
      : extra === 0
        ? "Igual que el control: el cambio no sumó nada. Mejor saberlo antes de gastar en grande."
        : "Vendió menos que el control. El piloto le ahorró escalar algo que resta.";
  return (
    <div data-no-swipe>
      <div className="grid grid-cols-2 gap-3">
        {bars.map((b) => (
          <div key={b.label} className="flex flex-col items-center">
            <div className="flex h-36 w-full items-end justify-center rounded-2xl bg-wash px-6 pt-3">
              <div
                className={cn(
                  "w-full rounded-t-xl transition-[height] duration-300 motion-reduce:transition-none",
                  b.highlight ? "bg-highlight" : "bg-gray-4",
                )}
                style={{ height: `${(b.value / max) * 100}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs font-medium text-soft">{b.label}</div>
            <div className="font-heading text-xl font-bold tabular-nums">{b.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Slider
          min={data.min}
          max={data.max}
          step={1}
          value={[test]}
          onValueChange={([v]) => setTest(v)}
          aria-label="Ventas del grupo con el cambio"
          className="py-2"
        />
      </div>
      <div className="mt-4 flex items-center gap-4 rounded-2xl border bg-wash/60 px-4 py-3">
        <div className="text-center">
          <div className="text-[11px] font-medium text-soft">Diferencia</div>
          <div className="font-heading text-3xl font-extrabold tabular-nums" aria-live="polite">
            {formatSignedPercent(lift)}
          </div>
        </div>
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function LessonInteractionView({ interaction }: { interaction: LessonInteraction }) {
  switch (interaction.kind) {
    case "choice":
      return <ChoiceInteraction data={interaction} />;
    case "ice":
      return <IceInteraction data={interaction} />;
    case "order":
      return <OrderInteraction data={interaction} />;
    case "hypothesis":
      return <HypothesisInteraction data={interaction} />;
    case "lift":
      return <LiftInteraction data={interaction} />;
  }
}
