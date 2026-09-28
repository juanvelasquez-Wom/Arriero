import Link from "next/link";
import { AppHeader } from "@/components/app/app-header";
import { ProgramMobileNav, ProgramSidebar } from "@/components/app/program-nav";
import { RealtimeRefresh } from "@/components/app/realtime-refresh";
import { DemoBadge } from "@/components/app/status-badge";
import { ROLE_LABEL } from "@/domain/labels";
import { can } from "@/domain/permissions";
import { getProgramContext } from "@/server/auth";
import { listLines } from "@/server/queries/programs";
import { recordUsage } from "@/server/usage";
import { getPilotContext } from "@/server/pilot-auth";

export default async function ProgramLayout({ children, params }: LayoutProps<"/programas/[programId]">) {
  const { programId } = await params;
  const ctx = await getProgramContext(programId);
  recordUsage("programas", ctx.user.id);
  const [lines, pilots] = await Promise.all([listLines(programId), getPilotContext().catch(() => null)]);
  const nav = {
    programId,
    lines: lines.map((l) => ({ id: l.id, name: l.name })),
    showTrash: can.viewTrash(ctx.actor),
    showSettings: can.editStructure(ctx.actor) || can.manageMembers(ctx.actor),
    showPilots: !!pilots?.actor.role,
  };

  return (
    <>
      <AppHeader
        user={ctx.user}
        programId={programId}
        canCreateExperiment={can.createExperiment(ctx.actor)}
        nav={<ProgramMobileNav {...nav} />}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/programas" className="shrink-0 text-sm text-soft hover:text-ink hover:underline">
            Programas
          </Link>
          <span aria-hidden className="text-soft">
            /
          </span>
          <Link href={`/programas/${programId}`} className="min-w-0 truncate text-sm font-semibold hover:underline">
            {ctx.program.name}
          </Link>
          {ctx.program.is_demo ? <DemoBadge className="shrink-0" /> : null}
          <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-soft">{ctx.role ? ROLE_LABEL[ctx.role] : "Admin"}</span>
        </div>
      </AppHeader>
      <div className="flex flex-1">
        <ProgramSidebar {...nav} />
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
      <RealtimeRefresh programId={programId} />
    </>
  );
}
