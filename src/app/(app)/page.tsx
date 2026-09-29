import { ArrowRight, CloudRain, Lightbulb, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app/app-header";
import { Credits } from "@/components/brand/credits";
import { FeedbackBubble } from "@/components/brand/feedback-bubble";
import { BrandIcon, type BrandIconName } from "@/components/brand/icons";
import { TalkingMule } from "@/components/brand/talking-mule";
import { LevelUpWatcher } from "@/components/recua/level-up-watcher";
import { TiaHero } from "@/components/tia/tia-copilot";
import { TIA_ENABLED } from "@/domain/tia";
import { phraseOfTheDay } from "@/components/brand/phrases";
import { levelFor, nudge } from "@/domain/gamification";
import { bogotaHour, greetingFor } from "@/domain/greeting";
import { canWritePilots } from "@/domain/pilots/flow";
import { cn } from "@/lib/utils";
import { isDatabaseReady, requireUser } from "@/server/auth";
import { getPilotContext } from "@/server/pilot-auth";
import { loadRecua } from "@/server/queries/gamification";
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
  const [programs, pilotCtx, recua] = await Promise.all([
    listMyPrograms(user.id),
    getPilotContext().catch(() => null),
    loadRecua("siempre").catch(() => null),
  ]);
  const me = recua?.ready ? (recua.ranked.find((u) => u.userId === user.id) ?? null) : null;
  const myPoints = me?.points ?? 0;
  const pilotActor = pilotCtx?.actor.role ? pilotCtx.actor : null;
  const newbie = programs.length === 0;
  const hi = greetingFor(bogotaHour());

  // Arriba La Tía (el camino corto); debajo, hacerlo a mano como experiencia inmersiva; al final, entender.
  const doing: Path[] = [
    user.isAdmin
      ? {
          href: "/programas/nuevo",
          title: "Arme un proyecto de growth paso a paso",
          body: "Usted mismo, pantalla por pantalla: líneas, métrica norte, embudo y calendario. Aprende el método mientras arma. Más fácil que organizar un paseo de olla.",
          art: "mapa",
          primary: !TIA_ENABLED,
        }
      : {
          href: "/programas",
          title: "Ver mis proyectos de growth",
          body: "Los programas donde usted ya está montado, con lo que toca hoy en cada uno. Sin excusas.",
          art: "mapa",
          primary: !TIA_ENABLED,
        },
  ];
  if (pilotActor) {
    doing.push(
      canWritePilots(pilotActor)
        ? {
            href: "/pilotos/nuevo",
            title: "Arme un piloto de medios paso a paso",
            body: "Oportunidad, diseño, métricas y reglas de decisión, una pregunta a la vez. Para los que quieren entender cada perilla antes de meterle toda la plata (y toda la fe).",
            art: "carriel-experimentos",
          }
        : {
            href: "/pilotos",
            title: "Ver los pilotos de medios",
            body: "Las pruebas en Meta, Google y demás medios: cómo van y qué se aprendió. Chismosear también es aprender.",
            art: "carriel-experimentos",
          },
    );
  }
  const learning: Path[] = [
    {
      href: "/direccion",
      title: "Me creo CMO y quiero ver el status de todo",
      body: "Qué crece, qué ganó y qué hay que decidir, en una página. Para leer entre reunión y reunión con cara de «yo ya sabía».",
      art: "montana-cima",
    },
    {
      href: "/aprender",
      title: "No sé nada de growth y quiero aprender",
      body: "Once ideas en cinco minuticos, con examen y cartón al final. Si pierde, no le contamos a nadie.",
      art: "tinto",
      tag: newbie ? "Empiece por aquí" : undefined,
    },
    {
      href: "/guia",
      title: "¿Cómo se usa el Arriero?",
      body: "Un recorrido por la app, de la carga del lunes al veredicto. También da cartón, pa' colgar en el cubículo.",
      art: "celular-ruta",
    },
  ];

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-12">
        <section className="rise">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-soft">
            {hi.hello}, {firstName(user.name || user.email)}
          </p>
          <h1 className="mt-1 text-balance font-heading text-3xl font-extrabold sm:text-4xl">¿Pa&apos; dónde arrancamos hoy?</h1>
          <p className="mt-2 max-w-prose text-soft">
            {hi.quip} «{phraseOfTheDay(user.id)}»
          </p>
          {/* La trocha: la mula va y viene, y si le hacen clic, opina. */}
          <div className="mt-4">
            <TalkingMule />
          </div>
        </section>

        {/* El camino principal: contarle a La Tía. */}
        <TiaHero canProject={user.isAdmin} canPilot={!!pilotActor && canWritePilots(pilotActor)} />

        {/* Hacerlo a mano: la experiencia inmersiva en growth. */}
        <section className="mt-8">
          {TIA_ENABLED ? (
            <div className="mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-soft">Experiencia inmersiva en growth</h2>
              <p className="text-sm text-soft">¿Prefiere hacerlo usted, paso a paso? Así aprende el método desde adentro, con la mula al lado.</p>
            </div>
          ) : null}
          <ul className="stagger grid gap-4 sm:grid-cols-2">
            {doing.map((p) => (
              <li key={p.href} className="pop-in sm:last:odd:col-span-2">
                <PathCard path={p} big={!TIA_ENABLED} />
              </li>
            ))}
          </ul>
        </section>

        {/* Franjas chiquitas: el carriel de insights y la lluvia de ideas. */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Link
            href="/insights"
            className="group flex items-center gap-2 rounded-2xl border border-dashed bg-paper px-4 py-2.5 text-sm transition-colors hover:bg-wash"
          >
            <Lightbulb aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <strong>¿Vio algo?</strong> <span className="text-soft">Guárdelo en el carriel de insights antes de que se le olvide.</span>
            </span>
            <ArrowRight aria-hidden className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/ideas"
            className="group flex items-center gap-2 rounded-2xl border border-dashed bg-paper px-4 py-2.5 text-sm transition-colors hover:bg-wash"
          >
            <CloudRain aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <strong>¿Lluvia de ideas?</strong> <span className="text-soft">Un reto, ideas sin filtro y al final se decide.</span>
            </span>
            <ArrowRight aria-hidden className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <ul className="stagger mt-4 grid gap-4 sm:grid-cols-3">
          {learning.map((p) => (
            <li key={p.href} className="pop-in">
              <PathCard path={p} />
            </li>
          ))}
        </ul>


        {recua?.ready ? (
          <>
            <LevelUpWatcher userId={user.id} points={myPoints} />
            <Link
              href="/recua"
              className="lift group mt-4 flex flex-col items-start gap-3 rounded-2xl bg-[#111111] px-5 py-4 text-[#F6F6F4] shadow-card sm:flex-row sm:items-center"
            >
              <Trophy aria-hidden className="wiggle-on-hover size-7 shrink-0 text-highlight" />
              <div className="min-w-0 flex-1">
                <div className="font-heading text-lg font-extrabold leading-tight">
                  {me ? `Usted va en el puesto ${me.position} de La Recua · ${levelFor(myPoints).level.title}` : "La Recua: el escalafón de los arrieros"}
                </div>
                <p className="text-sm text-[#F6F6F4]/70">
                  {me ? `${myPoints.toLocaleString("es-CO")} puntos. ${nudge(myPoints)}` : "Todavía no tiene puntos. Entre, cree, decida: la mula anota todo."}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-highlight px-3 py-1.5 text-sm font-semibold text-[#111111]">
                Ver el ranking <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          </>
        ) : null}

        {programs.length ? (
          <section className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-soft">Siga donde iba (la mula se acuerda)</h2>
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

        <footer className="mt-12 space-y-4 border-t pt-6">
          <FeedbackBubble compact className="max-w-2xl" />
          <Credits />
        </footer>
      </main>
    </>
  );
}

/** `stack`: con tres tarjetas grandes en fila, en pantallas anchas el ícono va arriba para que el texto respire. */
function PathCard({ path, big = false, stack = false }: { path: Path; big?: boolean; stack?: boolean }) {
  return (
    <Link
      href={path.href}
      className={cn(
        "lift group relative flex h-full gap-4 overflow-hidden rounded-2xl border p-5 shadow-card",
        big ? cn("items-center sm:p-6", stack && "lg:flex-col lg:items-start") : "flex-col",
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
        className={cn(
          "size-5 shrink-0 transition-transform group-hover:translate-x-1",
          big ? (stack ? "lg:absolute lg:top-6 lg:right-6" : "") : "absolute top-5 right-5",
        )}
      />
    </Link>
  );
}
