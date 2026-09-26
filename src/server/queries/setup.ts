import "server-only";
import type { SetupState } from "@/domain/setup-flow";
import type { ProgramContext } from "@/server/auth";
import { listCalendar, listHorizons, listLines, listMembers } from "./programs";
import { listMetrics, listStages, type MetricRow, type StageRow } from "./structure";

export interface SetupLine {
  id: string;
  name: string;
  metrics: MetricRow[];
  stages: StageRow[];
}

export async function loadSetup(ctx: ProgramContext) {
  const programId = ctx.program.id;
  const [horizons, calendar, lines, members, metrics, stages] = await Promise.all([
    listHorizons(programId),
    listCalendar(programId),
    listLines(programId),
    listMembers(programId),
    listMetrics({ programId }),
    listStages({ programId }),
  ]);
  const setupLines: SetupLine[] = lines.map((l) => ({
    id: l.id,
    name: l.name,
    metrics: metrics.filter((m) => m.line_id === l.id),
    stages: stages.filter((s) => s.line_id === l.id),
  }));
  const state: SetupState = {
    setupStep: ctx.program.setup_step,
    completed: !!ctx.program.setup_completed_at,
    hasDates: !!ctx.program.start_date && !!ctx.program.end_date,
    lines: setupLines.map((l) => ({
      id: l.id,
      hasNorthStar: l.metrics.some((m) => m.type === "north_star"),
      hasInputs: l.metrics.some((m) => m.type === "input"),
    })),
  };
  return { horizons, calendar, lines: setupLines, members, state };
}

export type SetupData = Awaited<ReturnType<typeof loadSetup>>;
