import { Bug, Lightbulb, MessageCircle, PartyPopper, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Número al que llegan los reportes por WhatsApp (formato internacional, sin «+»). */
export const FEEDBACK_WHATSAPP = "573215038663";
const SHOWN_NUMBER = "321 503 8663";

const OPTIONS: { key: string; label: string; icon: LucideIcon; text: string }[] = [
  {
    key: "falla",
    label: "Reportar una falla",
    icon: Bug,
    text: "Hola, vengo a reportar una falla en el Arriero (antes de que la falla me reporte a mí). Pasó esto: ",
  },
  {
    key: "mejora",
    label: "Proponer una mejora",
    icon: Lightbulb,
    text: "Hola, tengo una oportunidad de mejora para el Arriero. No es queja, es evidencia: ",
  },
  {
    key: "felicitar",
    label: "Echar flores",
    icon: PartyPopper,
    text: "Hola, vengo a felicitar al Arriero. Sí, así como lo lee. Me gustó esto: ",
  },
];

export function whatsappHref(text: string): string {
  return `https://wa.me/${FEEDBACK_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

/**
 * Burbuja de WhatsApp para reportar fallas, proponer mejoras o felicitar.
 * Cada opción abre WhatsApp con el mensaje ya empezado.
 */
export function FeedbackBubble({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("relative rounded-2xl rounded-bl-sm border bg-paper p-3 shadow-card", className)}>
      <div className="flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-highlight text-[#111111]">
          <MessageCircle aria-hidden className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">¿Se le dañó algo, se le ocurrió algo o viene a echar flores?</p>
          <p className="mt-0.5 text-xs text-soft">
            Escríbanos por WhatsApp. Las quejas se reciben con té de coca; las felicitaciones, con incredulidad.
          </p>
        </div>
      </div>
      <ul className={cn("mt-2.5 grid gap-1.5", compact ? "sm:grid-cols-3" : "")}>
        {OPTIONS.map((o) => (
          <li key={o.key}>
            <a
              href={whatsappHref(o.text)}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-transparent hover:bg-highlight hover:text-[#111111]"
            >
              <o.icon aria-hidden className="wiggle-on-hover size-3.5 shrink-0" />
              {o.label}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-soft">
        WhatsApp {SHOWN_NUMBER} · Respondemos rápido, salvo que la mula esté de paseo.
      </p>
    </div>
  );
}
