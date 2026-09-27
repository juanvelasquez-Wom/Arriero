import Image from "next/image";
import { Credits } from "@/components/brand/credits";
import { BRAND_ICONS, BrandIcon, type BrandIconName } from "@/components/brand/icons";
import { LoginJokes } from "@/components/brand/login-jokes";
import { LogoFull } from "@/components/brand/logo";
import { SLOGAN } from "@/components/brand/phrases";

/** Qué hace la app, en una línea (visible en todos los tamaños bajo el lema). */
const TAGLINE = "Del dato al experimento: priorice, pruebe y aprenda con su equipo.";

const PATTERN = Object.keys(BRAND_ICONS) as BrandIconName[];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen flex-1 lg:h-screen lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:overflow-hidden">
      {/* Panel de marca: negro, logo en blanco, chiste de la mula, íconos de fondo y la mula subiendo.
          Todo cabe en la altura de la pantalla: el logo y los textos se escalan con la altura. */}
      <section className="relative hidden h-screen overflow-hidden bg-[#111111] text-[#f6f6f4] lg:flex lg:flex-col lg:px-10 lg:pt-8 lg:pb-28">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-6 gap-10 p-8 opacity-[0.09]">
          {Array.from({ length: 36 }).map((_, k) => (
            <Image
              key={k}
              src={`/brand/icons/${PATTERN[(k * 5) % PATTERN.length]}.png`}
              alt=""
              width={96}
              height={96}
              className="brand-on-dark h-auto w-16"
              style={{ transform: `rotate(${((k * 37) % 30) - 15}deg)` }}
            />
          ))}
        </div>
        <div aria-hidden className="pointer-events-none absolute -top-32 -right-32 size-[28rem] rounded-full bg-highlight/15 blur-3xl" />

        <div className="relative text-xs font-semibold tracking-[0.2em] text-[#f6f6f4]/60 uppercase">Growth Engine · El que sabe por dónde es</div>

        <div className="rise relative flex min-h-0 flex-1 flex-col justify-center gap-[2.2vh]">
          <LogoFull onDark className="h-[24vh] max-h-64 w-auto self-start" />
          <div>
            <p className="font-heading text-[clamp(1.6rem,4.4vh,3rem)] leading-[1.05] font-extrabold tracking-tight">{SLOGAN}</p>
            <p className="mt-2 max-w-md text-[clamp(0.85rem,2vh,1.1rem)] text-[#f6f6f4]/80 [@media(max-height:620px)]:hidden">{TAGLINE}</p>
          </div>
          <LoginJokes className="max-w-md" />
        </div>

        {/* La montaña con la mula subiendo (de fondo: no ocupa espacio del contenido). */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24">
          <svg viewBox="0 0 800 120" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <path d="M0 120 L0 95 L180 80 L320 60 L470 42 L620 22 L800 6 L800 120 Z" fill="#1f1f1f" />
            <path d="M0 95 L180 80 L320 60 L470 42 L620 22 L800 6" fill="none" stroke="#F2C200" strokeWidth="2" strokeDasharray="6 8" />
          </svg>
          <div className="mule-trek absolute bottom-10 left-0 w-full">
            <BrandIcon name="mula-cargada" className="brand-on-dark w-12" />
          </div>
        </div>
      </section>

      <section className="flex flex-col bg-paper px-4 py-8 lg:h-screen lg:overflow-y-auto lg:py-10">
        <div className="rise m-auto w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center gap-2 text-center lg:hidden">
            <LogoFull className="w-36" />
            <div className="font-heading text-lg font-extrabold">{SLOGAN}</div>
            <p className="max-w-xs text-sm text-soft">{TAGLINE}</p>
          </div>
          <div className="mb-6 hidden items-center gap-3 lg:flex">
            <BrandIcon name="mula-sombrero" className="float-soft w-14" />
            <div className="text-sm text-soft">
              Buenas. Póngase el sombrero,
              <br />
              que hoy toca mover el embudo.
            </div>
          </div>
          {children}
          <p className="mt-6 text-xs text-soft">Solo se entra por invitación: aquí no se cuela nadie, ni la competencia.</p>
          {/* En el celular el chiste va después del formulario: primero se entra. */}
          <LoginJokes tone="light" compact className="mt-6 lg:hidden" />
          <Credits className="mt-8" />
        </div>
      </section>
    </main>
  );
}
