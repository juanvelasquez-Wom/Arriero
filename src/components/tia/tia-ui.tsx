import type { ReactNode } from "react";
import { BrandIcon } from "@/components/brand/icons";
import { pickPhrase } from "@/components/brand/phrases";
import { TIA_LINES } from "@/domain/tia";
import { cn } from "@/lib/utils";

/** Cara de La Tía (por ahora, el tinto de la marca en un círculo amarillo). */
export function TiaAvatar({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-highlight ring-2 ring-paper", className)} aria-hidden>
      <BrandIcon name="tinto" className="w-[70%] filter-none!" />
    </span>
  );
}

/** Texto de La Tía con formato mínimo y seguro: párrafos, viñetas y **negritas** (sin HTML). */
export function TiaText({ text, className }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  const inline = (s: string, key: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong> : <span key={`${key}-${i}`}>{part}</span>,
    );
  return (
    <div className={cn("space-y-2 text-sm leading-relaxed", className)}>
      {blocks.map((b, bi) => {
        const lines = b.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-5">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <span key={li}>
                {li ? <br /> : null}
                {inline(l.replace(/^#+\s*/, ""), `${bi}-${li}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** Tarjeta de La Tía: título en su voz ("La Tía detectó una oportunidad") y contenido. */
export function TiaCard({ title, children, actions, className }: { title: ReactNode; children?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-highlight/60 bg-highlight/10 p-4", className)}>
      <div className="flex items-start gap-3">
        <TiaAvatar />
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base font-extrabold">{title}</h3>
          {children ? <div className="mt-1.5">{children}</div> : null}
          {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
    </section>
  );
}

/** Mientras La Tía piensa. */
export function TiaThinking({ seed = "" }: { seed?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-soft" role="status" aria-live="polite">
      <span className="inline-flex gap-1" aria-hidden>
        <span className="size-1.5 animate-bounce rounded-full bg-ink [animation-delay:-0.2s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-ink [animation-delay:-0.1s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-ink" />
      </span>
      {pickPhrase(TIA_LINES.thinking, seed)}
    </div>
  );
}

/** Nota al pie: La Tía propone, el equipo decide. */
export function TiaDisclaimer({ className }: { className?: string }) {
  return <p className={cn("text-[11px] text-soft", className)}>{TIA_LINES.disclaimer}</p>;
}
