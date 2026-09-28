import { CloudRain, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { EmptyState } from "@/components/app/page";
import { IdeaItem } from "@/components/ideas/idea-item";
import { QuickIdeaInput } from "@/components/ideas/quick-idea-input";
import { ResultsBoard } from "@/components/ideas/results-board";
import { SessionControls } from "@/components/ideas/session-controls";
import { PhaseChip, PhaseStepper } from "@/components/ideas/session-parts";
import { VotingBoard } from "@/components/ideas/voting-board";
import { todayIso } from "@/domain/dates";
import { formatDate } from "@/domain/format";
import { ideaActions, IDEA_PHASES, isOverdue, pendingToScore, phaseMoves, rankIdeas, sessionActions } from "@/domain/ideas";
import { canWritePilots } from "@/domain/pilots/flow";
import { requireUser } from "@/server/auth";
import { getPilotContext } from "@/server/pilot-auth";
import { getIdeaSession, linkedTargets } from "@/server/queries/ideas";

export const metadata: Metadata = { title: "Aguacero de ideas" };

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function IdeaSessionPage({ params }: PageProps<"/ideas/[sessionId]">) {
  const { sessionId } = await params;
  if (!uuidRe.test(sessionId)) notFound();
  const user = await requireUser();
  const detail = await getIdeaSession(sessionId, user.id);
  if (!detail) notFound();
  const { session: s, ideas, scores, progress } = detail;
  const me = { isOwner: s.owner_id === user.id, isAdmin: user.isAdmin };
  const can = sessionActions(s, me);
  const phase = IDEA_PHASES.find((p) => p.key === s.phase)!;
  const moves = phaseMoves(s.phase, { hasIdeas: ideas.length > 0, hasLinked: ideas.some((i) => i.linked_at) });
  const today = todayIso();
  const late = s.phase !== "closed" && isOverdue(s.deadline, today);

  let body: React.ReactNode;
  if (s.phase === "open") {
    body = (
      <>
        <section aria-label="Anotar ideas" className="rise rounded-3xl border bg-paper p-4 shadow-card sm:p-5">
          <QuickIdeaInput sessionId={s.id} exampleKey={ideas.length} />
        </section>
        <h2 className="mt-8 font-heading text-lg font-extrabold">
          Lo que va lloviendo <span className="font-normal text-soft tabular-nums">· {ideas.length}</span>
        </h2>
        {ideas.length === 0 ? (
          <EmptyState
            className="mt-3"
            icon={CloudRain}
            art="cafe-crecimiento"
            title="Ni una gota todavía"
            description="Sea el primero. La primera idea siempre es la más difícil, y casi nunca la mejor. Por eso hay que soltarla."
          />
        ) : (
          <ul className="stagger mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...ideas].reverse().map((i) => {
              const a = ideaActions(i, s, me);
              return <IdeaItem key={i.id} idea={i} canEdit={a.edit} canRemove={a.remove} />;
            })}
          </ul>
        )}
      </>
    );
  } else if (s.phase === "voting") {
    const pending = pendingToScore(ideas, scores);
    body = (
      <>
        <p className="mb-4 flex items-center gap-2 text-sm text-soft">
          <Users aria-hidden className="size-4 shrink-0" />
          {progress.voters === 0
            ? "Nadie ha puntuado todavía. Estrene usted."
            : `${progress.voters} ${progress.voters === 1 ? "persona ha" : "personas han"} puntuado. Los puntajes de los demás se ven al cerrar.`}
          {pending === 0 && ideas.some((i) => !i.mine) ? " Usted ya terminó." : ""}
        </p>
        <VotingBoard ideas={ideas} scores={scores} isBoss={me.isOwner || me.isAdmin} />
      </>
    );
  } else {
    const [targets, pilotCtx] = await Promise.all([linkedTargets(ideas), getPilotContext().catch(() => null)]);
    const canPilot = !!pilotCtx?.actor.role && canWritePilots(pilotCtx.actor);
    const alive = rankIdeas(
      ideas.filter((i) => i.decision !== "buried"),
      scores,
    );
    const buried = rankIdeas(
      ideas.filter((i) => i.decision === "buried"),
      scores,
    );
    body = (
      <>
        {can.decide ? (
          <p className="mb-4 rounded-2xl border-l-4 border-highlight bg-paper px-4 py-3 text-sm">
            Decida qué pasa con cada idea: <strong>proyecto</strong>, <strong>piloto</strong>, <strong>insight</strong> o{" "}
            <strong>cementerio</strong>. No hay que decidirlas todas hoy; las que no toque quedan vivas en la tabla.
          </p>
        ) : null}
        <ResultsBoard ranked={alive} buried={buried} ctx={{ canDecide: can.decide, isAdmin: user.isAdmin, canPilot, targets }} />
      </>
    );
  }

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Link href="/ideas" className="text-sm text-soft hover:text-ink hover:underline">
          ← Lluvia de ideas
        </Link>

        <header className="rise mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <PhaseChip phase={s.phase} />
            {s.line_hint ? <span className="rounded-full bg-wash px-2 py-0.5 text-[11px] font-medium">{s.line_hint}</span> : null}
            {s.deadline ? (
              <span className={late ? "rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-paper" : "rounded-full bg-wash px-2 py-0.5 text-[11px] font-medium"}>
                {late ? "Se venció el " : "Llueve hasta el "}
                {formatDate(s.deadline)}
              </span>
            ) : null}
          </div>
          <h1 className="text-balance font-heading text-3xl leading-tight font-extrabold">{s.title}</h1>
          {s.context ? <p className="max-w-prose whitespace-pre-line text-soft">{s.context}</p> : null}
          <p className="text-sm text-soft">
            Lo armó {me.isOwner ? "usted" : s.owner_name} el {formatDate(s.created_at.slice(0, 10))} · {ideas.length}{" "}
            {ideas.length === 1 ? "idea" : "ideas"}
          </p>
          {can.movePhase ? (
            <SessionControls
              sessionId={s.id}
              moves={moves}
              initial={{ title: s.title, context: s.context ?? "", line_hint: s.line_hint ?? "", deadline: s.deadline ?? "" }}
            />
          ) : null}
        </header>

        <div className="mt-6">
          <PhaseStepper phase={s.phase} />
          <p className="mt-2 text-sm text-soft">{phase.blurb}</p>
          {s.phase === "open" && can.movePhase && ideas.length === 0 ? (
            <p className="mt-1 text-xs text-soft">Cuando haya ideas, aparece el botón para pasar a puntuar.</p>
          ) : null}
        </div>

        <div className="mt-6">{body}</div>
      </main>
    </>
  );
}
