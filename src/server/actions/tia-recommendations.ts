"use server";

// "La Tía tiene una recomendación": server actions del asistente de ejercicios y
// del diálogo de decisión. Solo proponen: no escriben nada en la base (salvo el
// registro de consumo que hace runTia). Leen con el cliente de la persona (RLS).
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { can } from "@/domain/permissions";
import { readExperiment } from "@/domain/results";
import { clip, type TiaFeature } from "@/domain/tia";
import {
  DESIGN_TASK,
  designDraftSchema,
  HYPOTHESES_TASK,
  hypothesisDraftSchema,
  ICE_TASK,
  iceDraftSchema,
  parseDesign,
  parseHypotheses,
  parseIce,
  parseReading,
  parseReview,
  READING_TASK,
  readingForTia,
  readingScreenSchema,
  REVIEW_TASK,
  type DesignSuggestion,
  type HypothesisDraft,
  type HypothesisOption,
  type HypothesisReview,
  type IceSuggestion,
  type ReadingSuggestion,
} from "@/domain/tia-recommendations";
import type { Actor } from "@/domain/types";
import { getActionActor, getProgramContext, type ProgramContext } from "@/server/auth";
import { getExperiment, listMetricEconomics, listVariants } from "@/server/queries/experiments";
import { listLines } from "@/server/queries/programs";
import { listMetrics, listProblems } from "@/server/queries/structure";
import { runTia } from "@/server/tia/run";

const uuid = z.string().uuid();
const NOT_UNDERSTOOD = "La Tía respondió algo que no se le entendió bien. Pídale otra vez, que ella no se ofende.";

/** Programa + actor, sin lanzar (notFound/redirect no deben escaparse de una acción). */
async function context(programId: string, allowed: (a: Actor) => boolean): Promise<ActionResult<ProgramContext>> {
  if (!uuid.safeParse(programId).success) return fail("Programa inválido.");
  const who = await getActionActor(programId);
  if (!who) return fail("¡Uy, qué pena! No tiene acceso a este programa.");
  if (!allowed(who.actor)) return fail("¡Uy, qué pena! Su rol no puede pedirle esto a la Tía.");
  try {
    return ok(await getProgramContext(programId));
  } catch {
    return fail("No se pudo abrir el programa.");
  }
}

/** Problema, métrica y borrador para "pantalla" (verifica que sean de la misma línea). */
async function draftScreen(programId: string, draft: HypothesisDraft): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const [problem] = await listProblems(programId, { problemId: draft.problem_id });
    if (!problem) return fail("No encontramos el problema elegido.");
    const metrics = await listMetrics({ lineId: problem.line_id });
    const metric = metrics.find((m) => m.id === draft.metric_id);
    if (!metric) return fail("La métrica debe ser del árbol de la misma línea del problema.");
    const parent = metric.parent_id ? metrics.find((m) => m.id === metric.parent_id) : null;
    return ok({
      problema: {
        titulo: problem.title,
        linea: problem.line_name,
        etapa: problem.stage_name,
        canal: problem.channel,
        evidencia: clip(problem.evidence, 1200),
        causa_raiz: clip(problem.root_cause, 500),
        impacto: problem.impact,
        control: problem.control,
        estado: problem.status,
        ejercicios_existentes: problem.experiments,
      },
      metrica: {
        nombre: metric.name,
        tipo: metric.type,
        rama: metric.branch,
        definicion: clip(metric.definition, 300),
        canal: metric.channel,
        unidad: metric.unit,
        direccion: metric.direction === "down" ? "baja es mejor" : "sube es mejor",
        linea_base: metric.baseline,
        cuelga_de: parent?.name ?? null,
      },
      borrador: {
        titulo: clip(draft.title, 200),
        si: clip(draft.hypothesis_if, 600),
        entonces: clip(draft.hypothesis_then, 400),
        porque: clip(draft.hypothesis_because, 600),
      },
    });
  } catch {
    return fail("No se pudieron leer el problema y la métrica. Intente de nuevo.");
  }
}

async function ask<T>(
  ctx: ProgramContext,
  feature: TiaFeature,
  task: string,
  extra: Record<string, unknown>,
  parse: (reply: string) => T | null,
  maxTokens: number,
): Promise<ActionResult<T>> {
  const r = await runTia({ ctx, feature, task, extra, maxTokens });
  if (!r.ok) return r;
  const parsed = parse(r.data);
  return parsed == null ? fail(NOT_UNDERSTOOD) : ok(parsed);
}

/** 1. "Pídale hipótesis a la Tía": tres opciones SI / ENTONCES / PORQUE. */
export async function suggestHypotheses(programId: string, input: unknown): Promise<ActionResult<HypothesisOption[]>> {
  const draft = hypothesisDraftSchema.safeParse(input);
  if (!draft.success) return fail(draft.error.issues[0]?.message ?? "Elija primero el problema y la métrica.");
  const c = await context(programId, can.createExperiment);
  if (!c.ok) return c;
  const screen = await draftScreen(programId, draft.data);
  if (!screen.ok) return screen;
  return ask(c.data, "recommendation", HYPOTHESES_TASK, screen.data, parseHypotheses, 1800);
}

/** 2. "La Tía le revisa la hipótesis". */
export async function reviewHypothesis(programId: string, input: unknown): Promise<ActionResult<HypothesisReview>> {
  const draft = hypothesisDraftSchema.safeParse(input);
  if (!draft.success) return fail(draft.error.issues[0]?.message ?? "Elija primero el problema y la métrica.");
  const d = draft.data;
  if (!d.hypothesis_if.trim() && !d.hypothesis_then.trim() && !d.hypothesis_because.trim())
    return fail("Escriba primero algo de la hipótesis para que la Tía la revise.");
  const c = await context(programId, can.createExperiment);
  if (!c.ok) return c;
  const screen = await draftScreen(programId, d);
  if (!screen.ok) return screen;
  return ask(c.data, "hypothesis_review", REVIEW_TASK, screen.data, parseReview, 1000);
}

/** 3. "¿Qué calificación le pondría la Tía?" (solo quien puede calificar ICE). */
export async function suggestIce(programId: string, input: unknown): Promise<ActionResult<IceSuggestion>> {
  const draft = iceDraftSchema.safeParse(input);
  if (!draft.success) return fail(draft.error.issues[0]?.message ?? "Elija primero el problema y la métrica.");
  const c = await context(programId, can.scoreIce);
  if (!c.ok) return c;
  const screen = await draftScreen(programId, draft.data);
  if (!screen.ok) return screen;
  const extra = {
    ...screen.data,
    control_del_ejercicio: draft.data.control,
    fechas_planeadas: { inicio: draft.data.planned_start || null, fin: draft.data.planned_end || null },
    puntaje: c.data.program.scoring_config,
  };
  return ask(c.data, "recommendation", ICE_TASK, extra, parseIce, 700);
}

/** 4. Diseño de la prueba: tipo, duración, regla, variantes y riesgos. */
export async function suggestDesign(programId: string, input: unknown): Promise<ActionResult<DesignSuggestion>> {
  const draft = designDraftSchema.safeParse(input);
  if (!draft.success) return fail(draft.error.issues[0]?.message ?? "Elija primero el problema y la métrica.");
  const c = await context(programId, can.createExperiment);
  if (!c.ok) return c;
  const screen = await draftScreen(programId, draft.data);
  if (!screen.ok) return screen;
  let volumen: Record<string, unknown> | null = null;
  try {
    const econ = (await listMetricEconomics([draft.data.metric_id])).get(draft.data.metric_id);
    if (econ) volumen = { ultimo_valor_semanal: econ.latest_value, semana: econ.latest_week, linea_base: econ.baseline, unidad: econ.unit };
  } catch {
    volumen = null;
  }
  const d = draft.data;
  const extra = {
    ...screen.data,
    volumen_de_la_metrica: volumen,
    diseno_actual: {
      tipo_prueba: d.test_type,
      duracion_minima_dias: d.min_duration_days,
      regla_de_decision: clip(d.decision_rule, 500),
      metricas_de_control: d.control_metrics.map((m) => clip(m, 150)),
      variantes: d.variants.map((v) => ({ nombre: clip(v.name, 80), descripcion: clip(v.description, 200), control: v.is_control })),
    },
    fechas_planeadas: { inicio: d.planned_start || null, fin: d.planned_end || null },
  };
  return ask(c.data, "recommendation", DESIGN_TASK, extra, parseDesign, 1200);
}

/** 5. "La Tía le lee el resultado" en el diálogo de decisión. */
export async function readResult(programId: string, input: unknown): Promise<ActionResult<ReadingSuggestion>> {
  const screen = readingScreenSchema.safeParse(input);
  if (!screen.success) return fail("No se pudo leer lo que hay en pantalla.");
  const c = await context(programId, (a) => a.isAdmin || (a.role !== null && a.role !== "viewer"));
  if (!c.ok) return c;
  const s = screen.data;
  let extra: Record<string, unknown>;
  try {
    const e = await getExperiment(s.experiment_id);
    if (!e || e.program_id !== programId) return fail("No encontramos el ejercicio.");
    const [variants, economics, lines] = await Promise.all([
      listVariants({ experimentId: e.id }),
      listMetricEconomics([e.metric_id]),
      listLines(programId),
    ]);
    const metric = economics.get(e.metric_id) ?? null;
    const reading = readExperiment({ variants, testType: e.test_type, metric });
    extra = {
      ejercicio: {
        titulo: e.title,
        linea: e.line_name,
        problema: e.problem_title,
        metrica: e.metric_name,
        direccion: metric?.direction === "down" ? "baja" : "sube",
        tipo_prueba: e.test_type,
        hipotesis: e.hypothesis_if
          ? `SI ${clip(e.hypothesis_if, 300)} ENTONCES ${clip(e.hypothesis_then, 200)} PORQUE ${clip(e.hypothesis_because, 300)}`
          : null,
        regla_de_decision: clip(s.decisionRule ?? e.decision_rule, 600),
        metricas_de_control: e.control_metrics.map((m) => clip(m, 150)),
        inicio_real: e.actual_start,
        fin_real: e.actual_end,
        duracion_minima_dias: e.min_duration_days,
      },
      lectura: readingForTia(reading),
      evidencia: {
        tipo: s.evidence.kind,
        variante_resumen: s.evidence.bestName,
        probabilidad_de_ganar: s.evidence.probabilityLabel,
        banda: s.evidence.bandLabel,
        ganador_con_advertencia: s.evidence.winnerNeedsWarning,
        ganador_confiable: s.evidence.reliableWinner,
      },
      advertencia_de_duracion: s.durationWarning,
      faltan_resultados: s.missingResults,
      otras_lineas: lines.filter((l) => l.id !== e.line_id).map((l) => l.name),
    };
  } catch {
    return fail("No se pudieron leer los resultados. Intente de nuevo.");
  }
  return ask(c.data, "reading", READING_TASK, extra, parseReading, 1400);
}
