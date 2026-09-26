import "server-only";
import type { WizardData } from "@/components/experiments/wizard-values";
import { can } from "@/domain/permissions";
import type { ProgramContext } from "@/server/auth";
import { listCalendar, listLines, listMembers } from "./programs";
import { listMetrics, listProblems } from "./structure";

export async function loadWizardData(ctx: ProgramContext): Promise<WizardData> {
  const programId = ctx.program.id;
  const [lines, problems, metrics, members, calendar] = await Promise.all([
    listLines(programId),
    listProblems(programId),
    listMetrics({ programId }),
    listMembers(programId),
    listCalendar(programId),
  ]);
  return {
    programId,
    lines: lines.map((l) => ({ id: l.id, name: l.name })),
    problems: problems.map((p) => ({ id: p.id, line_id: p.line_id, title: p.title, stage_name: p.stage_name, status: p.status })),
    metrics: metrics.map((m) => ({ id: m.id, line_id: m.line_id, name: m.name, type: m.type, parent_id: m.parent_id })),
    members: members.map((m) => ({ user_id: m.user_id, name: m.name, role: m.role })),
    calendar,
    scoring: ctx.program.scoring_config,
    canScore: can.scoreIce(ctx.actor),
    isAgency: ctx.role === "agency",
  };
}
