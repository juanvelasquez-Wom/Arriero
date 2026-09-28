import { Archive, Database, Flame, Lightbulb, Search, Sprout, UserRound, Layers } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app/app-header";
import { EmptyState } from "@/components/app/page";
import { ViewTabs } from "@/components/app/view-tabs";
import { InsightCard } from "@/components/insights/insight-card";
import { InsightForm } from "@/components/insights/insight-form";
import { Input } from "@/components/ui/input";
import { firstParam } from "@/domain/dashboard-filters";
import { filterInsights, INSIGHT_SOURCES, insightCounts, lineHints, type InsightSource, type InsightView } from "@/domain/insights";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { listInsights } from "@/server/queries/insights";

export const metadata: Metadata = { title: "Carriel de insights" };

const VIEWS: InsightView[] = ["todos", "sin-sembrar", "calientes", "sembrados", "mios", "archivados"];

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  const user = await requireUser();
  const sp = await searchParams;
  const rawView = firstParam(sp.vista) ?? "todos";
  const view: InsightView = (VIEWS as string[]).includes(rawView) ? (rawView as InsightView) : "todos";
  const q = (firstParam(sp.q) ?? "").slice(0, 80);
  const rawSource = firstParam(sp.fuente);
  const source = INSIGHT_SOURCES.some((s) => s.key === rawSource) ? (rawSource as InsightSource) : null;
  const line = firstParam(sp.linea) ?? null;
  const { ready, items } = await listInsights(user.id);

  const shown = filterInsights(items, { view, q, source, line }, user.id);
  const counts = insightCounts(items, user.id);
  const lines = lineHints(items);
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur = { vista: view === "todos" ? null : view, q: q || null, fuente: source, linea: line, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "?";
  };

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <header className="rise mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-soft">Repositorio de insights</p>
          <h1 className="mt-1 text-balance font-heading text-3xl font-extrabold sm:text-4xl">El carriel de insights</h1>
          <p className="mt-1 max-w-prose text-soft">
            Aquí se guarda lo que la gente ve, oye y sospecha, antes de que se lo lleve el viento. De aquí salen las oportunidades de mejora, los proyectos y los
            pilotos. Una idea por insight, con su fuente, y a sembrar.
          </p>
        </header>

        {!ready ? (
          <EmptyState
            art="carriel-herramientas"
            icon={Database}
            title="El carriel todavía no tiene costuras"
            description="Para usar los insights hay que aplicar el SQL del repositorio de insights en el SQL Editor de Supabase. Después recargue esta página."
          />
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
              <section aria-label="Anotar un insight" className="rise rounded-3xl border bg-paper p-5 shadow-card">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-full bg-highlight text-[#111111]">
                    <Lightbulb aria-hidden className="size-5" />
                  </span>
                  <h2 className="font-heading text-lg font-extrabold">Anote uno ya, que se le olvida</h2>
                </div>
                <InsightForm autoFocus={false} exampleKey={counts.total} />
              </section>
              <aside className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                {[
                  { n: counts.total, label: "en el carriel", note: "sin contar los archivados" },
                  { n: counts.fresh, label: "esta semana", note: counts.fresh ? "¡La recua está despierta!" : "Semana quieta. ¿Nadie vio nada?" },
                  { n: counts.planted, label: "sembrados", note: "ya se volvieron trabajo" },
                  { n: counts.mine, label: "suyos", note: counts.mine ? "Ojo de arriero" : "Todavía ninguno. Ánimo." },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl border bg-paper px-4 py-3">
                    <div className="font-heading text-2xl font-extrabold tabular-nums">{s.n}</div>
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-xs text-soft">{s.note}</div>
                  </div>
                ))}
              </aside>
            </div>

            <ViewTabs
              label="Vistas del carriel"
              active={view}
              className="mt-8"
              tabs={[
                { key: "todos", label: "Todos", href: href({ vista: null }), icon: Layers },
                { key: "sin-sembrar", label: "Sin sembrar", href: href({ vista: "sin-sembrar" }), icon: Lightbulb },
                { key: "calientes", label: "Los más calientes", href: href({ vista: "calientes" }), icon: Flame },
                { key: "sembrados", label: "Sembrados", href: href({ vista: "sembrados" }), icon: Sprout, count: counts.planted },
                { key: "mios", label: "Los míos", href: href({ vista: "mios" }), icon: UserRound, count: counts.mine },
                { key: "archivados", label: "Archivados", href: href({ vista: "archivados" }), icon: Archive },
              ]}
            />

            <div className="mt-4 space-y-3">
              <form method="get" className="relative" role="search">
                {view !== "todos" ? <input type="hidden" name="vista" value={view} /> : null}
                {source ? <input type="hidden" name="fuente" value={source} /> : null}
                {line ? <input type="hidden" name="linea" value={line} /> : null}
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-soft" />
                <Input name="q" defaultValue={q} placeholder="Buscar en el carriel: precio, WhatsApp, portabilidad…" aria-label="Buscar insights" className="h-11 pl-9" />
              </form>
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-soft">Fuente</span>
                <Chip href={href({ fuente: null })} on={!source}>
                  Todas
                </Chip>
                {INSIGHT_SOURCES.map((s) => (
                  <Chip key={s.key} href={href({ fuente: s.key })} on={source === s.key}>
                    {s.label}
                  </Chip>
                ))}
              </div>
              {lines.length ? (
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-soft">Línea</span>
                  <Chip href={href({ linea: null })} on={!line}>
                    Todas
                  </Chip>
                  {lines.slice(0, 8).map((l) => (
                    <Chip key={l} href={href({ linea: l })} on={line === l}>
                      {l}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </div>

            {shown.length === 0 ? (
              <div className="mt-6">
                <EmptyState
                  art="carriel-experimentos"
                  icon={Lightbulb}
                  title={items.length === 0 ? "El carriel está vacío" : "Nada por aquí con esos filtros"}
                  description={
                    items.length === 0
                      ? "Nadie ha anotado nada todavía. Sea el primero: lo que vio en el chat, en el tablero o en la tienda. La mula le da 10 puntos."
                      : q
                        ? `No hay insights con «${q}». Anótelo usted, que alguien tiene que empezar.`
                        : "Pruebe con otra vista o quite los filtros."
                  }
                />
              </div>
            ) : (
              <ul className="stagger mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((i) => (
                  <InsightCard key={i.id} insight={i} meId={user.id} />
                ))}
              </ul>
            )}
            {view === "calientes" && shown.length ? (
              <p className="mt-3 text-xs text-soft">Calientes = los que más gente también ha visto, y los más frescos. Se enfrían en unos dos meses.</p>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={on ? "true" : undefined}
      className={cn("rounded-full border px-3 py-1", on ? "border-transparent bg-ink font-semibold text-paper" : "text-soft hover:bg-wash hover:text-ink")}
    >
      {children}
    </Link>
  );
}
