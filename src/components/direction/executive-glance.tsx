import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandIcon } from "@/components/brand/icons";
import type { BriefKey } from "@/domain/executive";
import type { ExecutiveGlance, GlanceCard } from "@/domain/executive-glance";
import { cn } from "@/lib/utils";

/**
 * El vistazo de dirección: la respuesta grande, cuatro semáforos y lo de esta
 * semana. Presenta lo que arma `buildExecutiveGlance`; no decide nada.
 */
export function ExecutiveGlanceView({
  glance,
  eyebrow,
  questionHref,
  footer,
}: {
  glance: ExecutiveGlance;
  /** Línea pequeña de arriba (periodo, programas, cambiar periodo). */
  eyebrow: ReactNode;
  /** Enlace a una pregunta del detalle para el comité. */
  questionHref: (q: BriefKey) => string;
  /** Lo de abajo: el detalle para el comité, copiar y exportar. */
  footer?: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="veredicto" className="rise flex items-center gap-4 sm:gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-soft">{eyebrow}</div>
          <h1 className="mt-2 font-heading text-xl font-bold text-soft sm:text-2xl">¿Estamos creciendo?</h1>
          <p id="veredicto" className="mt-1 text-balance font-heading text-4xl leading-[1.05] font-extrabold sm:text-6xl">
            {glance.title}
          </p>
          <p className="mt-3 max-w-prose text-base sm:text-lg">{glance.quip}</p>
          <p className="mt-1 max-w-prose text-sm text-soft">{glance.detail}</p>
        </div>
        <BrandIcon name={glance.art} className="float-soft w-16 shrink-0 self-start sm:w-36 sm:self-center" />
      </section>

      <section aria-label="El semáforo">
        <ul className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
          {glance.cards.map((c) => (
            <li key={c.key} className="pop-in">
              <SignalCard card={c} href={c.href ?? questionHref(c.question)} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="esta-semana">
        <h2 id="esta-semana" className="text-xs font-semibold uppercase tracking-[0.14em] text-soft">
          Qué hacer esta semana
        </h2>
        <ol className="stagger mt-3 space-y-2">
          {glance.actions.map((a, i) => {
            const href = a.href ?? (a.question ? questionHref(a.question) : undefined);
            const body = (
              <>
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-wash font-heading text-sm font-extrabold tabular-nums"
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-balance">{a.text}</span>
                  <span className="block text-sm text-soft">{a.detail}</span>
                </span>
                {href ? <ArrowRight aria-hidden className="size-5 shrink-0 transition-transform group-hover:translate-x-1" /> : null}
              </>
            );
            return (
              <li key={i} className="pop-in">
                {href ? (
                  <Link href={href} className="lift group flex items-center gap-3 rounded-2xl border bg-paper px-4 py-3 shadow-card">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 rounded-2xl border bg-paper px-4 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {footer}
    </div>
  );
}

function SignalCard({ card, href }: { card: GlanceCard; href: string }) {
  const ToneIcon = card.tone === "good" ? TrendingUp : card.tone === "bad" ? TrendingDown : null;
  return (
    <Link
      href={href}
      className={cn(
        "lift group flex h-full flex-col gap-2 rounded-2xl border p-4 shadow-card sm:p-5",
        card.attention ? "border-transparent bg-highlight text-[#111111]" : "bg-paper",
        card.tone === "bad" && !card.attention && "border-ink/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <BrandIcon name={card.art} className="wiggle-on-hover w-10 shrink-0 sm:w-12" />
        <ArrowRight aria-hidden className="size-4 shrink-0 transition-transform group-hover:translate-x-1" />
      </div>
      <div className="text-xs font-semibold uppercase tracking-[0.1em]">{card.label}</div>
      <div className="flex items-center gap-1.5 font-heading text-4xl leading-none font-extrabold tabular-nums sm:text-5xl">
        {card.value}
        {ToneIcon && card.value > 0 ? (
          <ToneIcon aria-label={card.tone === "good" ? "a favor" : "en contra"} className="size-5 sm:size-6" />
        ) : null}
      </div>
      <p className={cn("line-clamp-3 text-sm", card.attention ? "text-[#111111]/80" : "text-soft")}>{card.sentence}</p>
    </Link>
  );
}
