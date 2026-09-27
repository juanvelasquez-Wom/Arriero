import { LogoFull, Mule } from "@/components/brand/logo";
import { phraseOfTheDay, SLOGAN } from "@/components/brand/phrases";

/** Qué hace la app, en una línea (visible en todos los tamaños bajo el lema). */
const TAGLINE = "Del dato al experimento: priorice, pruebe y aprenda con su equipo.";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen flex-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Panel de marca: negro, con el logo y el lema. */}
      <section className="relative hidden overflow-hidden bg-[#111111] text-[#f6f6f4] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="text-xs font-semibold tracking-[0.2em] uppercase text-[#f6f6f4]/60">Growth Engine</div>
        <div className="rise">
          <LogoFull className="w-full max-w-md invert" />
          <p className="mt-8 font-heading text-4xl font-extrabold tracking-tight">{SLOGAN}</p>
          <p className="mt-3 max-w-md text-lg text-[#f6f6f4]/80">{TAGLINE}</p>
        </div>
        <p className="font-heading text-lg font-semibold text-highlight">«{phraseOfTheDay("login")}»</p>
        <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-highlight/10 blur-3xl" />
      </section>

      <section className="flex items-center justify-center bg-paper px-4 py-10">
        <div className="rise w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-2 lg:hidden">
            <Mule className="w-20" />
            <div className="font-heading text-2xl font-extrabold">Arriero</div>
            <div className="text-sm font-semibold text-soft">{SLOGAN}</div>
            <p className="max-w-xs text-center text-sm text-soft">{TAGLINE}</p>
          </div>
          {children}
          <p className="mt-6 text-xs text-soft">Solo se entra por invitación.</p>
        </div>
      </section>
    </main>
  );
}
