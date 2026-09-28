import { Database, Ghost, ListOrdered, Scale, Trophy, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app/app-header";
import { EmptyState } from "@/components/app/page";
import { ViewTabs } from "@/components/app/view-tabs";
import { BadgeChip, LevelLadder, MyCard, Podium, RankTable, WallOfShame } from "@/components/recua/recua-parts";
import { LevelUpWatcher } from "@/components/recua/level-up-watcher";
import { firstParam } from "@/domain/dashboard-filters";
import { BADGES, POINT_RULES, type RankedUser } from "@/domain/gamification";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { loadRecua, type RecuaPeriod } from "@/server/queries/gamification";

export const metadata: Metadata = { title: "La Recua" };

const VIEWS = ["escalafon", "carriel", "verguenza", "reglas"] as const;
type View = (typeof VIEWS)[number];

export default async function RecuaPage({ searchParams }: PageProps<"/recua">) {
  const user = await requireUser();
  const sp = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(firstParam(sp.vista) ?? "") ? (firstParam(sp.vista) as View) : "escalafon";
  const period: RecuaPeriod = firstParam(sp.periodo) === "mes" ? "mes" : "siempre";
  // El nivel de la persona siempre se calcula con todo su historial.
  const [all, shown] = await Promise.all([loadRecua("siempre"), period === "mes" ? loadRecua("mes") : null]);
  const board = shown ?? all;
  const me: RankedUser | null = all.ranked.find((u) => u.userId === user.id) ?? null;

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <header className="rise mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-soft">La Recua</p>
          <h1 className="mt-1 text-balance font-heading text-3xl font-extrabold sm:text-4xl">El escalafón de la arriería</h1>
          <p className="mt-1 max-w-prose text-soft">
            Aquí se ve quién arrea y quién solo mira. Los puntos salen de lo que hace en el Arriero, no de lo que promete en las reuniones.
          </p>
        </header>

        {!all.ready ? (
          <EmptyState
            art="mula-cargada"
            icon={Database}
            title="Falta ensillar la mula"
            description="Para ver La Recua hay que aplicar el SQL de la gamificación en el SQL Editor de Supabase. Después recargue esta página."
          />
        ) : (
          <>
            <LevelUpWatcher userId={user.id} points={me?.points ?? 0} />
            <MyCard me={me} total={all.ranked.length} />

            <ViewTabs
              label="Secciones de La Recua"
              active={view}
              className="mt-6"
              tabs={[
                { key: "escalafon", label: "Escalafón", href: "?vista=escalafon", icon: Trophy },
                { key: "carriel", label: "Mi carriel", href: "?vista=carriel", icon: UserRound, count: me?.badges.length },
                { key: "verguenza", label: "Muro de la vergüenza", href: "?vista=verguenza", icon: Ghost },
                { key: "reglas", label: "Así se gana", href: "?vista=reglas", icon: Scale },
              ]}
            />

            <div className="slide-in mt-6" key={`${view}-${period}`}>
              {view === "escalafon" ? (
                <div className="space-y-6">
                  <div role="group" aria-label="Periodo" className="inline-flex rounded-full border bg-paper p-0.5">
                    {(["siempre", "mes"] as const).map((p) => (
                      <Link
                        key={p}
                        href={`?vista=escalafon${p === "mes" ? "&periodo=mes" : ""}`}
                        scroll={false}
                        aria-current={period === p ? "true" : undefined}
                        className={cn("rounded-full px-3.5 py-1.5 text-sm", period === p ? "bg-highlight font-semibold text-[#111111]" : "text-soft hover:text-ink")}
                      >
                        {p === "siempre" ? "Desde siempre" : "Último mes"}
                      </Link>
                    ))}
                  </div>
                  {board.ranked.length === 0 ? (
                    <EmptyState
                      art="camino"
                      icon={ListOrdered}
                      title="La trocha está sola"
                      description={period === "mes" ? "Nadie sumó puntos este mes. O todos están de vacaciones, o todos están en reuniones." : "Todavía nadie tiene puntos. Sea el primero en arrear."}
                    />
                  ) : (
                    <>
                      {board.ranked.length >= 3 ? <Podium top={board.ranked.slice(0, 3)} meId={user.id} /> : null}
                      <RankTable ranked={board.ranked} meId={user.id} />
                    </>
                  )}
                </div>
              ) : null}

              {view === "carriel" ? <MyCarriel me={me} /> : null}
              {view === "verguenza" ? <WallOfShame ranked={all.ranked} /> : null}
              {view === "reglas" ? <Rules points={me?.points ?? 0} /> : null}
            </div>
          </>
        )}
      </main>
    </>
  );
}

function MyCarriel({ me }: { me: RankedUser | null }) {
  const earned = new Set(me?.badges.map((b) => b.id));
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-extrabold">De dónde salen sus puntos</h2>
        {me && me.lines.length ? (
          <ul className="mt-3 divide-y overflow-hidden rounded-2xl border bg-paper">
            {me.lines.map((l) => (
              <li key={l.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">{l.label}</span>
                <span className="text-soft tabular-nums">× {l.count}</span>
                <span className={cn("w-16 text-right font-semibold tabular-nums", l.points < 0 && "text-soft")}>
                  {l.points > 0 ? "+" : ""}
                  {l.points.toLocaleString("es-CO")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl bg-wash px-4 py-3 text-sm">El carriel está vacío. Entre, cree algo, decida algo: la mula anota todo.</p>
        )}
      </section>
      <section>
        <h2 className="text-xl font-extrabold">Sus insignias</h2>
        <p className="mt-1 text-sm text-soft">
          {earned.size} de {BADGES.length}. Las que tienen candado todavía están por ganarse (o por sufrirse).
        </p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {BADGES.map((b) => (
            <li key={b.id}>
              <BadgeChip badge={b} locked={!earned.has(b.id)} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Rules({ points }: { points: number }) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-extrabold">Así se gana (y se pierde) puntos</h2>
        <p className="mt-1 text-sm text-soft">Cuenta lo de verdad: el programa de ejemplo y lo que está en la papelera no suman.</p>
        <ul className="mt-3 divide-y overflow-hidden rounded-2xl border bg-paper">
          {POINT_RULES.map((r) => (
            <li key={r.key} className="flex items-start gap-3 px-4 py-3">
              <span
                className={cn(
                  "w-14 shrink-0 rounded-full py-0.5 text-center text-sm font-bold tabular-nums",
                  r.points > 0 ? "bg-highlight text-[#111111]" : "bg-ink text-paper",
                )}
              >
                {r.points > 0 ? "+" : ""}
                {r.points}
              </span>
              <div className="min-w-0">
                <div className="font-medium">
                  {r.label}
                  {r.cap ? <span className="text-soft"> · tope {r.cap}</span> : null}
                </div>
                <p className="text-xs text-soft">{r.joke}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-xl font-extrabold">El escalafón</h2>
        <p className="mt-1 text-sm text-soft">De turista en chanclas a Mula Mayor honoraria. Nadie ha llegado arriba. Todavía.</p>
        <div className="mt-3">
          <LevelLadder points={points} />
        </div>
      </section>
    </div>
  );
}
