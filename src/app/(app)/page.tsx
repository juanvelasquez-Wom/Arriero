import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app/app-header";
import { Credits } from "@/components/brand/credits";
import { BrandIcon, type BrandIconName } from "@/components/brand/icons";
import { Mule } from "@/components/brand/logo";
import { phraseOfTheDay } from "@/components/brand/phrases";
import { canWritePilots } from "@/domain/pilots/flow";
import { cn } from "@/lib/utils";
import { isDatabaseReady, requireUser } from "@/server/auth";
import { getPilotContext } from "@/server/pilot-auth";
import { listMyPrograms } from "@/server/queries/programs";

export const metadata: Metadata = { title: "Inicio" };

const firstName = (n: string) => n.split(/[\s@.]+/)[0] || n;

interface Path {
  href: string;
  title: string;
  body: string;
  art: BrandIconName;
  primary?: boolean;
  tag?: string;
}

export default async function HomePage() {
  const user = await requireUser();
  if (!(await isDatabaseReady())) return null;
  const [programs, pilotCtx] = await Promise.all([listMyPrograms(user.id), getPilotContext().catch(() => null)]);
  const pilotActor = pilotCtx?.actor.role ? pilotCtx.actor : null;
  const newbie = programs.length === 0;

  // Hacer (arriba, grandes) y entender (abajo).
  const doing: Path[] = [
    user.isAdmin
      ? {
          href: "/programas/nuevo",
          title: "Crear un proyecto de growth",
          body: "Líneas, metas y ejercicios en cinco pasitos. El asistente lo lleva de la mano.",
          art: "mapa",
          primary: true,
        }
      : {
          href: "/programas",
          title: "Ver mis proyectos de growth",
          body: "Los programas donde usted ya está montado, con lo que toca hoy en cada uno.",
          art: "mapa",
          primary: true,
        },
  ];
  if (pilotActor) {
    doing.push(
      canWritePilots(pilotActor)
        ? {
            href: "/pilotos/nuevo",
            title: "Crear un piloto de medios",
            body: "¿Meta, radio, una landing nueva? Pruébelo con grupo de control antes de meterle toda la plata.",
            art: "carriel-experimentos",
          }
        : {
            href: "/pilotos",
            title: "Ver los pilotos de medios",
            body: "Las pruebas en Meta, Google y demás medios: cómo van y qué se aprendió.",
            art: "carriel-experimentos",
          },
    );
  }
  const learning: Path[] = [
    {
      href: "/direccion",
      title: "Soy de dirección: ¿cómo vamos?",
      body: "Qué crece, qué ganó y qué hay que decidir. Todo en una página, sin carreta.",
      art: "montana-cima",
    },
    {
      href: "/aprender",
      title: "No sé nada de growth y quiero aprender",
      body: "Diez minuticos, con ejemplos de telco y sin palabras raras. Prometido.",
      art: "tinto",
      tag: newbie ? "Empiece por aquí" : undefined,
    },
    {
      href: "/guia",
      title: "¿Cómo se usa el Arriero?",
      body: "Un recorrido paso a paso por la app, de la carga semanal al veredicto.",
      art: "celular-ruta",
    },
  ];

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-12">
        <section className="rise">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-soft">Buenas, {firstName(user.name || user.email)}</p>
          <h1 className="mt-1 text-balance font-heading text-3xl font-extrabold sm:text-4xl">¿Pa&apos; dónde arrancamos hoy?</h1>
          <p className="mt-2 max-w-prose text-soft">«{phraseOfTheDay(user.id)}»</p>
          {/* El camino: la mula va y viene por la trocha. */}
          <div aria-hidden className="relative mt-6 h-10 overflow-hidden">
            <div className="absolute inset-x-0 bottom-2 border-b-2 border-dashed border-line" />
            <div className="home-trail absolute bottom-2">
              <Mule className="mule-walk w-10" />
            </div>
          </div>
        </section>

        <ul className={cn("stagger mt-4 grid gap-4", doing.length > 1 ? "sm:grid-cols-2" : "")}>
          {doing.map((p) => (
            <li key={p.href} className="pop-in">
              <PathCard path={p} big />
            </li>
          ))}
        </ul>

        <ul className="stagger mt-4 grid gap-4 sm:grid-cols-3">
          {learning.map((p) => (
            <li key={p.href} className="pop-in">
              <PathCard path={p} />
            </li>
          ))}
        </ul>

        {programs.length ? (
          <section className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-soft">Siga donde iba</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {programs.slice(0, 3).map((p) => (
                <li key={p.id}>
                  <Link
                    href={p.setup_completed_at || p.is_demo ? `/programas/${p.id}` : `/programas/${p.id}/configuracion`}
                    className="group inline-flex max-w-full items-center gap-2 rounded-full border bg-paper px-3.5 py-1.5 text-sm transition-colors hover:bg-wash"
                  >
                    <span className="truncate">{p.name}</span>
                    <ArrowRight aria-hidden className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
              {programs.length > 3 ? (
                <li>
                  <Link href="/programas" className="inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-medium underline underline-offset-4">
                    Ver los {programs.length}
                  </Link>
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}

        <footer className="mt-12 border-t pt-6">
          <Credits />
        </footer>
      </main>
    </>
  );
}

function PathCard({ path, big = false }: { path: Path; big?: boolean }) {
  return (
    <Link
      href={path.href}
      className={cn(
        "lift group relative flex h-full gap-4 overflow-hidden rounded-2xl border p-5 shadow-card",
        big ? "items-center sm:p-6" : "flex-col",
        path.primary ? "border-transparent bg-highlight text-[#111111]" : "bg-paper",
      )}
    >
      <BrandIcon name={path.art} className={cn("wiggle-on-hover shrink-0", big ? "w-16 sm:w-20" : "w-14")} />
      <div className="min-w-0 flex-1">
        {path.tag ? (
          <span className="mb-2 inline-block rounded-full bg-highlight px-2.5 py-0.5 text-xs font-semibold text-[#111111]">{path.tag}</span>
        ) : null}
        <div className={cn("text-balance font-heading font-extrabold leading-tight", big ? "text-xl sm:text-2xl" : "text-lg")}>{path.title}</div>
        <p className={cn("mt-1 text-sm", path.primary ? "text-[#111111]/75" : "text-soft")}>{path.body}</p>
      </div>
      <ArrowRight
        aria-hidden
        className={cn("size-5 shrink-0 transition-transform group-hover:translate-x-1", big ? "" : "absolute right-5 top-5")}
      />
    </Link>
  );
}
