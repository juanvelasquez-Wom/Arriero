import { CloudRain, Database, Gavel, Star, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { AppHeader } from "@/components/app/app-header";
import { Fold } from "@/components/app/fold";
import { EmptyState } from "@/components/app/page";
import { ViewTabs } from "@/components/app/view-tabs";
import { SessionCard } from "@/components/ideas/session-parts";
import { SessionForm } from "@/components/ideas/session-form";
import { firstParam } from "@/domain/dashboard-filters";
import { todayIso } from "@/domain/dates";
import { filterSessions, IDEA_PHASES, SESSION_VIEWS, sessionCounts, type SessionView } from "@/domain/ideas";
import { requireUser } from "@/server/auth";
import { listIdeaSessions } from "@/server/queries/ideas";

export const metadata: Metadata = { title: "Lluvia de ideas" };

const EMPTY_TEXT: Record<SessionView, { title: string; description: string }> = {
  abiertas: { title: "Cielo despejado", description: "No hay aguaceros abiertos. Arme uno arriba: un reto, y que llueva." },
  votacion: { title: "Nadie está puntuando", description: "Cuando quien armó un aguacero diga «Escampó», aparece aquí para puntuar." },
  cerradas: { title: "Todavía no se ha decidido nada", description: "Aquí quedan los aguaceros cerrados, con su podio y su cementerio." },
  mios: { title: "Usted no ha armado ninguno", description: "¿Tiene un reto que le quita el sueño? Arme el aguacero y que el equipo se moje." },
};

export default async function IdeasPage({ searchParams }: PageProps<"/ideas">) {
  const user = await requireUser();
  const sp = await searchParams;
  const raw = firstParam(sp.vista) ?? "abiertas";
  const view: SessionView = (SESSION_VIEWS as string[]).includes(raw) ? (raw as SessionView) : "abiertas";
  const { ready, items } = await listIdeaSessions(user.id);
  const counts = sessionCounts(items);
  const shown = filterSessions(items, view);
  const today = todayIso();
  const href = (v: SessionView) => (v === "abiertas" ? "?" : `?vista=${v}`);

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <header className="rise mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-soft">Lluvia de ideas</p>
          <h1 className="mt-1 text-balance font-heading text-3xl font-extrabold sm:text-4xl">Aquí llueven ideas</h1>
          <p className="mt-1 max-w-prose text-soft">
            Un reto, muchas ideas sin filtro, puntaje a ciegas y decisión. Las mejores se vuelven proyecto, piloto o insight; las demás van al
            cementerio de ideas, con honores y lápida.
          </p>
        </header>

        {!ready ? (
          <EmptyState
            art="carriel-herramientas"
            icon={Database}
            title="Todavía no hay nubes"
            description="Para usar la lluvia de ideas hay que aplicar el SQL de la lluvia de ideas en el SQL Editor de Supabase. Después recargue esta página."
          />
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
              <section aria-label="Armar un aguacero" className="rise rounded-3xl border bg-paper p-5 shadow-card">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-full bg-highlight text-[#111111]">
                    <CloudRain aria-hidden className="size-5" />
                  </span>
                  <h2 className="font-heading text-lg font-extrabold">Arme un aguacero</h2>
                </div>
                <SessionForm exampleKey={items.length} />
              </section>
              <aside className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                {[
                  { n: counts.open, label: "lloviendo", note: counts.open ? "¡Saque el paraguas!" : "Ni una nube" },
                  { n: counts.voting, label: "a puntuar", note: counts.voting ? "Vote, que eso no cuesta" : "Nadie votando" },
                  { n: counts.chosen, label: "ideas elegidas", note: "ya se volvieron trabajo" },
                  { n: counts.buried, label: "en el cementerio", note: counts.buried ? "Que en paz descansen" : "Nadie ha muerto (todavía)" },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl border bg-paper px-4 py-3">
                    <div className="font-heading text-2xl font-extrabold tabular-nums">{s.n}</div>
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-xs text-soft">{s.note}</div>
                  </div>
                ))}
              </aside>
            </div>

            <Fold title="¿Cómo funciona un aguacero?" className="mt-4" bare>
              <ol className="space-y-1 text-sm" data-explain>
                {IDEA_PHASES.map((p, i) => (
                  <li key={p.key}>
                    <strong>
                      {i + 1}. {p.label}:
                    </strong>{" "}
                    <span className="text-soft">{p.blurb}</span>
                  </li>
                ))}
              </ol>
            </Fold>

            <ViewTabs
              label="Aguaceros"
              active={view}
              className="mt-6"
              tabs={[
                { key: "abiertas", label: "Lloviendo", href: href("abiertas"), icon: CloudRain, count: counts.open, attention: counts.open > 0 },
                { key: "votacion", label: "A puntuar", href: href("votacion"), icon: Star, count: counts.voting, attention: counts.voting > 0 },
                { key: "cerradas", label: "Decididos", href: href("cerradas"), icon: Gavel, count: counts.closed },
                { key: "mios", label: "Los míos", href: href("mios"), icon: UserRound, count: counts.mine },
              ]}
            />

            {shown.length === 0 ? (
              <EmptyState art="cafe-crecimiento" icon={CloudRain} title={EMPTY_TEXT[view].title} description={EMPTY_TEXT[view].description} />
            ) : (
              <ul className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((s) => (
                  <SessionCard key={s.id} s={s} today={today} />
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </>
  );
}
