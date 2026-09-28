"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/domain/dates";
import { parseScoringConfig } from "@/domain/scoring";
import { tiaSystem, withNumberCheck } from "@/domain/tia";
import {
  COMMITTEE_TASK,
  committeeContext,
  EXPLAIN_TASK,
  metricExplainData,
  OPPORTUNITY_TASK,
  parseOpportunities,
  problemDraftHref,
  type TiaOpportunity,
} from "@/domain/tia-insights";
import type { MetricDirection } from "@/domain/types";
import { getActionActor, getSessionUser, type ProgramContext, type ProgramSummary } from "@/server/auth";
import { listExperiments } from "@/server/queries/experiments";
import { listCalendar, listHorizons, listLines } from "@/server/queries/programs";
import { listMetrics, listMetricValues, listStages } from "@/server/queries/structure";
import { askTia, TiaError } from "@/server/tia/client";
import { ensureTiaAvailable, recordTiaUsage, runTia } from "@/server/tia/run";

const uuid = z.string().uuid();
const SESSION = "Su sesión venció. Vuelva a entrar.";
const NO_ACCESS = "No tiene acceso a este programa.";
const GENERIC = "La Tía no pudo responder. Intente de nuevo en un momentico.";

/** Contexto del programa para una acción, sin redirigir ni lanzar (RLS decide qué se ve). */
async function actionProgramContext(programId: string): Promise<ProgramContext | null> {
  const who = await getActionActor(programId);
  if (!who) return null;
  const supabase = await createClient();
  const { data: program } = await supabase
    .from("programs")
    .select("id, name, description, is_demo, start_date, end_date, setup_step, setup_completed_at, scoring_config")
    .eq("id", programId)
    .maybeSingle();
  if (!program) return null;
  return {
    user: who.user,
    program: { ...program, scoring_config: parseScoringConfig(program.scoring_config) } as ProgramSummary,
    role: who.actor.role,
    actor: who.actor,
  };
}

function tiaFail(e: unknown): ActionResult<never> {
  if (e instanceof TiaError) return fail(e.message);
  console.error("[tia] error inesperado", e instanceof Error ? e.message : e);
  return fail(GENERIC);
}

export type OpportunityCard = TiaOpportunity & { href: string };

/**
 * "La Tía detectó una oportunidad": hasta 3 oportunidades con respaldo en los
 * datos del programa. Si Claude no devuelve JSON legible, se entrega el texto.
 */
export async function detectOpportunities(
  programId: string,
): Promise<ActionResult<{ items: OpportunityCard[]; text: string | null }>> {
  if (!uuid.safeParse(programId).success) return fail("Programa inválido.");
  if (!(await getSessionUser())) return fail(SESSION);
  const ctx = await actionProgramContext(programId);
  if (!ctx) return fail(NO_ACCESS);

  const res = await runTia({ ctx, feature: "opportunity", task: OPPORTUNITY_TASK, maxTokens: 1400 });
  if (!res.ok) return res;
  try {
    const [lines, stages, metrics] = await Promise.all([listLines(programId), listStages({ programId }), listMetrics({ programId })]);
    const items = parseOpportunities(res.data, { lines, stages, metrics });
    if (items == null) return ok({ items: [], text: res.data });
    return ok({ items: items.map((o) => ({ ...o, href: problemDraftHref(programId, o) })), text: null });
  } catch (e) {
    return tiaFail(e);
  }
}

/** "La Tía le explica los números": por qué se movió una métrica y un siguiente paso. */
export async function explainMetric(programId: string, metricId: string): Promise<ActionResult<string>> {
  if (!uuid.safeParse(programId).success || !uuid.safeParse(metricId).success) return fail("Métrica inválida.");
  if (!(await getSessionUser())) return fail(SESSION);
  const ctx = await actionProgramContext(programId);
  if (!ctx) return fail(NO_ACCESS);
  const available = await ensureTiaAvailable();
  if (!available.ok) return available;

  try {
    const supabase = await createClient();
    const { data: metric } = await supabase
      .from("metrics")
      .select("id, line_id, name, type, unit, direction, baseline, metric_targets(horizon_id, target)")
      .eq("id", metricId)
      .eq("program_id", programId)
      .maybeSingle();
    if (!metric) return fail("No encontramos esa métrica (quizás la borraron).");

    const [lines, horizons, calendar, values, experiments] = await Promise.all([
      listLines(programId),
      listHorizons(programId),
      listCalendar(programId),
      listMetricValues({ metricIds: [metricId] }),
      listExperiments(programId),
    ]);
    const data = metricExplainData({
      today: todayIso(),
      programStart: ctx.program.start_date,
      metricId,
      metric: {
        name: metric.name as string,
        type: metric.type as string,
        unit: (metric.unit as string | null) ?? null,
        direction: metric.direction as MetricDirection,
        baseline: metric.baseline == null ? null : Number(metric.baseline),
        line_name: lines.find((l) => l.id === metric.line_id)?.name ?? "",
        targets: ((metric.metric_targets ?? []) as { horizon_id: string; target: number }[]).map((t) => ({
          horizon_id: t.horizon_id,
          target: Number(t.target),
        })),
      },
      horizons,
      values,
      experiments: experiments.filter((e) => e.line_id === metric.line_id),
      calendar,
    });

    const reply = await askTia({
      system: tiaSystem(EXPLAIN_TASK, data),
      messages: [{ role: "user", content: "Tía, explíqueme estos números." }],
      maxTokens: 700,
    });
    await recordTiaUsage(programId, "explain_metric", reply.usage);
    const text = reply.text.trim();
    return text ? ok(withNumberCheck(text, data)) : fail("La Tía se quedó callada. Intente de nuevo.");
  } catch (e) {
    return tiaFail(e);
  }
}

const briefSchema = z.string().trim().min(20, "No hay resumen para preparar el comité.").max(40_000);

/**
 * "La Tía le prepara el comité": narrativa de ~250 palabras a partir SOLO del
 * texto del resumen ejecutivo (no se mandan datos crudos de cada programa).
 */
export async function prepareCommittee(briefText: string): Promise<ActionResult<string>> {
  if (!(await getSessionUser())) return fail(SESSION);
  const parsed = briefSchema.safeParse(briefText);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Resumen inválido.");
  const available = await ensureTiaAvailable();
  if (!available.ok) return available;
  try {
    const reply = await askTia({
      system: tiaSystem(COMMITTEE_TASK, committeeContext(parsed.data)),
      messages: [{ role: "user", content: "Tía, prepáreme el comité." }],
      maxTokens: 1000,
    });
    await recordTiaUsage(null, "committee", reply.usage);
    const text = reply.text.trim();
    return text ? ok(withNumberCheck(text, committeeContext(parsed.data))) : fail("La Tía se quedó callada. Intente de nuevo.");
  } catch (e) {
    return tiaFail(e);
  }
}
