import Image from "next/image";
import { BRAND_ICONS, BrandIcon, type BrandIconName } from "@/components/brand/icons";
import { LoginJokes } from "@/components/brand/login-jokes";
import { LogoFull } from "@/components/brand/logo";
import { SLOGAN } from "@/components/brand/phrases";

/** Qué hace la app, en una línea (visible en todos los tamaños bajo el lema). */
const TAGLINE = "Del dato al experimento: priorice, pruebe y aprenda con su equipo.";

const PATTERN = Object.keys(BRAND_ICONS) as BrandIconName[];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen flex-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* Panel de marca: negro, logo en blanco, íconos de fondo y la mula subiendo. */}
      <section className="relative hidden overflow-hidden bg-[#111111] text-[#f6f6f4] lg:flex lg:h-screen lg:flex-col lg:justify-between lg:p-10">
        {/* Fondo de íconos de la marca, muy sutil. */}
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

        <div className="rise relative">
          <LogoFull onDark className="w-full max-w-[15rem] xl:max-w-[18rem]" />
          <p className="mt-6 font-heading text-4xl leading-[1.05] font-extrabold tracking-tight xl:text-5xl">{SLOGAN}</p>
          <p className="mt-3 max-w-md text-base text-[#f6f6f4]/80 xl:text-lg">{TAGLINE}</p>
          <LoginJokes className="mt-6 max-w-md" />
        </div>

        {/* La montaña con la mula subiendo. */}
        <div aria-hidden className="relative -mx-10 -mb-10 h-24 shrink-0">
          <svg viewBox="0 0 800 120" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-28 w-full">
            <path d="M0 120 L0 95 L180 80 L320 60 L470 42 L620 22 L800 6 L800 120 Z" fill="#1f1f1f" />
            <path d="M0 95 L180 80 L320 60 L470 42 L620 22 L800 6" fill="none" stroke="#F2C200" strokeWidth="2" strokeDasharray="6 8" />
          </svg>
          <div className="mule-trek absolute bottom-14 left-0 w-full">
            <BrandIcon name="mula-cargada" className="brand-on-dark w-14" />
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center bg-paper px-4 py-10">
        <div className="rise w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
            <LogoFull className="w-44" />
            <div className="font-heading text-xl font-extrabold">{SLOGAN}</div>
            <p className="max-w-xs text-sm text-soft">{TAGLINE}</p>
            <LoginJokes tone="light" className="mt-2" />
          </div>
          <div className="mb-6 hidden items-center gap-3 lg:flex">
            <BrandIcon name="mula-sombrero" className="w-14" />
            <div className="text-sm text-soft">
              Buenas. Póngase el sombrero,
              <br />
              que hoy toca mover el embudo.
            </div>
          </div>
          {children}
          <p className="mt-6 text-xs text-soft">Solo se entra por invitación: aquí no se cuela nadie, ni la competencia.</p>
        </div>
      </section>
    </main>
  );
}
