import { ExternalLink, Sprout } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { InsightActions, VoteButton } from "@/components/insights/insight-actions";
import { StatusChip } from "@/components/insights/insight-card";
import { InsightForm } from "@/components/insights/insight-form";
import { firstParam } from "@/domain/dashboard-filters";
import { formatDate } from "@/domain/format";
import { INSIGHT_STAGE_LABEL, insightActions, similarInsights, SOURCE_LABEL } from "@/domain/insights";
import { requireUser } from "@/server/auth";
import { getPilotContext } from "@/server/pilot-auth";
import { canWritePilots } from "@/domain/pilots/flow";
import { getInsight, listInsights, plantedIn, programsForProblems } from "@/server/queries/insights";

export const metadata: Metadata = { title: "Insight" };

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InsightPage({ params, searchParams }: PageProps<"/insights/[insightId]">) {
  const { insightId } = await params;
  if (!uuidRe.test(insightId)) notFound();
  const sp = await searchParams;
  const user = await requireUser();
  const insight = await getInsight(insightId, user.id);
  if (!insight) notFound();
  const [all, planted, programs, pilotCtx] = await Promise.all([
    listInsights(user.id),
    plantedIn(insight),
    programsForProblems(user.id, user.isAdmin),
    getPilotContext().catch(() => null),
  ]);
  const canPilot = !!pilotCtx?.actor.role && canWritePilots(pilotCtx.actor);
  const perms = insightActions(insight, { id: user.id, isAdmin: user.isAdmin, canPilot });
  const editing = firstParam(sp.editar) === "1" && perms.edit;
  const similar = similarInsights(insight, all.items);
  const sourceIsUrl = !!insight.source_ref && /^https?:\/\//i.test(insight.source_ref);

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link href="/insights" className="text-sm text-soft hover:text-ink hover:underline">
          ← El carriel de insights
        </Link>

        {editing ? (
          <section className="rise mt-4 rounded-3xl border bg-paper p-5 shadow-card">
            <h1 className="mb-4 font-heading text-2xl font-extrabold">Editar el insight</h1>
            <InsightForm
              insightId={insight.id}
              initial={{
                title: insight.title,
                detail: insight.detail ?? "",
                source: insight.source,
                source_ref: insight.source_ref ?? "",
                line_hint: insight.line_hint ?? "",
                stage: insight.stage,
                channel: insight.channel ?? "",
                tags: insight.tags.join(", "),
              }}
            />
            <Link href={`/insights/${insight.id}`} className="mt-3 inline-block text-sm text-soft underline underline-offset-4">
              Cancelar
            </Link>
          </section>
        ) : (
          <article className="rise mt-4 space-y-5">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusChip status={insight.status} />
              <span className="rounded-full bg-wash px-2 py-0.5 text-[11px] font-medium">{SOURCE_LABEL[insight.source]}</span>
              {insight.line_hint ? <span className="rounded-full bg-wash px-2 py-0.5 text-[11px] font-medium">{insight.line_hint}</span> : null}
              {insight.stage ? <span className="rounded-full bg-wash px-2 py-0.5 text-[11px] font-medium">{INSIGHT_STAGE_LABEL[insight.stage]}</span> : null}
              {insight.channel ? <span className="rounded-full bg-wash px-2 py-0.5 text-[11px] font-medium">{insight.channel}</span> : null}
            </div>
            <h1 className="text-balance font-heading text-3xl leading-tight font-extrabold">{insight.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-soft">
              <span>
                Lo anotó {insight.author_name} el {formatDate(insight.created_at.slice(0, 10))}
              </span>
              <VoteButton id={insight.id} votes={insight.votes} voted={insight.voted_by_me} mine={insight.created_by === user.id} />
            </div>

            {insight.detail ? (
              <section className="rounded-2xl border-l-4 border-highlight bg-paper px-4 py-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-soft">Evidencia</h2>
                <p className="mt-1 whitespace-pre-line">{insight.detail}</p>
              </section>
            ) : (
              <p className="rounded-2xl bg-wash px-4 py-3 text-sm">
                Todavía sin evidencia. Si alguien la tiene, que la cuente: un dato convierte una corazonada en un insight de verdad.
              </p>
            )}
            {insight.source_ref ? (
              <p className="text-sm">
                <span className="font-semibold">Referencia: </span>
                {sourceIsUrl ? (
                  <a href={insight.source_ref} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 underline underline-offset-4">
                    {insight.source_ref} <ExternalLink aria-hidden className="size-3.5" />
                  </a>
                ) : (
                  insight.source_ref
                )}
              </p>
            ) : null}
            {insight.tags.length ? (
              <div className="flex flex-wrap gap-1.5">
                {insight.tags.map((t) => (
                  <Link key={t} href={`/insights?q=${encodeURIComponent(t)}`} className="rounded-full bg-wash px-2.5 py-0.5 text-xs hover:bg-gray-1">
                    #{t}
                  </Link>
                ))}
              </div>
            ) : null}

            {insight.status === "planted" ? (
              <section className="rounded-2xl bg-highlight px-4 py-3 text-[#111111]">
                <h2 className="flex items-center gap-1.5 font-heading font-extrabold">
                  <Sprout aria-hidden className="size-4" /> Ya echó raíz
                </h2>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {planted.problem ? (
                    <li>
                      Oportunidad de mejora:{" "}
                      <Link href={`/programas/${planted.problem.programId}/problemas/${planted.problem.id}`} className="font-semibold underline underline-offset-4">
                        {planted.problem.title}
                      </Link>
                    </li>
                  ) : null}
                  {planted.program && !planted.problem ? (
                    <li>
                      Programa:{" "}
                      <Link href={`/programas/${planted.program.id}`} className="font-semibold underline underline-offset-4">
                        {planted.program.name}
                      </Link>
                    </li>
                  ) : null}
                  {planted.pilot ? (
                    <li>
                      Piloto:{" "}
                      <Link href={`/pilotos/${planted.pilot.id}`} className="font-semibold underline underline-offset-4">
                        {planted.pilot.title}
                      </Link>
                    </li>
                  ) : null}
                  {!planted.problem && !planted.program && !planted.pilot ? <li>Se usó en algo que usted no tiene acceso a ver.</li> : null}
                </ul>
                <p className="mt-2 text-xs text-[#111111]/75">Todavía se puede sembrar en otro lado: un buen insight da para varias cosechas.</p>
              </section>
            ) : null}

            <section className="rounded-3xl border bg-paper p-4 shadow-card">
              <h2 className="font-heading text-lg font-extrabold">¿Qué hacemos con esto?</h2>
              <p className="mb-3 text-sm text-soft">Un insight guardado no crece solo. Siémbrelo.</p>
              <InsightActions id={insight.id} perms={perms} programs={programs} />
            </section>

            {similar.length ? (
              <section>
                <h2 className="font-heading text-lg font-extrabold">Se le parecen</h2>
                <p className="text-sm text-soft">Si dicen lo mismo, júntelos como evidencia antes de sembrar.</p>
                <ul className="mt-2 space-y-2">
                  {similar.map((m) => (
                    <li key={m.item.id}>
                      <Link href={`/insights/${m.item.id}`} className="block rounded-2xl border bg-paper px-4 py-3 hover:bg-wash">
                        <div className="font-medium">{m.item.title}</div>
                        <div className="text-xs text-soft">
                          {m.item.author_name} · {m.item.votes} {m.item.votes === 1 ? "voto" : "votos"}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </article>
        )}
      </main>
    </>
  );
}
