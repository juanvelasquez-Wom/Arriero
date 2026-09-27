import "server-only";

import { todayIso } from "@/domain/dates";
import { readExperiment } from "@/domain/results";
import { evaluateNorthStars } from "@/domain/rollup";
import { clip } from "@/domain/tia";
import type { ProgramContext } from "@/server/auth";
import { listExperiments } from "@/server/queries/experiments";
import { loadProgramSnapshot } from "@/server/queries/management";
import { listLearnings, listProblems } from "@/server/queries/structure";

/**
 * Lo que La Tía sabe de un programa: un resumen compacto (y recortado) de las
 * métricas norte frente a la meta, los problemas, los ejercicios con su lectura,
 * los aprendizajes y el calendario. Se lee con el cliente de la persona: RLS decide.
 */
export async function programContextForTia(ctx: ProgramContext) {
  const today = todayIso();
  const p = ctx.program;
  const [snap, experiments, problems, learnings] = await Promise.all([
    loadProgramSnapshot({ id: p.id, name: p.name, is_demo: p.is_demo, start_date: p.start_date, end_date: p.end_date }, today),
    listExperiments(p.id),
    listProblems(p.id),
    listLearnings(p.id),
  ]);
  const northStars = evaluateNorthStars({ northStars: snap.northStars, horizons: snap.horizons, start_date: p.start_date, today });
  const variantsById = new Map(snap.experiments.map((e) => [e.id, e]));

  return {
    hoy: today,
    programa: { id: p.id, nombre: p.name, objetivo: clip(p.description, 300), inicio: p.start_date, fin: p.end_date, es_ejemplo: p.is_demo },
    horizontes: snap.horizons.map((h) => ({ nombre: h.name, inicio: h.start_date, fin: h.end_date })),
    metricas_norte: northStars.map((n) => ({
      linea: n.line_name,
      metrica: n.metric_name,
      unidad: n.unit,
      debe: n.direction === "down" ? "bajar" : "subir",
      frente_a_la_meta: n.evaluation.status,
      ultimo_valor: n.evaluation.latest,
      esperado_hoy: n.evaluation.expected == null ? null : Math.round(n.evaluation.expected * 100) / 100,
      brecha: n.evaluation.gap == null ? null : Math.round(n.evaluation.gap * 1000) / 1000,
      meta: n.evaluation.target,
      horizonte: n.evaluation.horizonName,
      ultimas_semanas: n.values.slice(-8).map((v) => [v.week_start, v.value]),
    })),
    problemas: problems.slice(0, 40).map((pr) => ({
      id: pr.id,
      linea: pr.line_name,
      etapa: pr.stage_name,
      canal: pr.channel,
      titulo: pr.title,
      evidencia: clip(pr.evidence, 300),
      causa: clip(pr.root_cause, 200),
      impacto: pr.impact,
      estado: pr.status,
      ejercicios: pr.experiments,
    })),
    ejercicios: experiments.slice(0, 60).map((e) => {
      const snapE = variantsById.get(e.id);
      const read = snapE ? readExperiment({ variants: snapE.variants, testType: e.test_type, metric: snap.economics.get(e.metric_id) ?? null }).headline : null;
      return {
        id: e.id,
        linea: e.line_name,
        titulo: e.title,
        estado: e.status,
        problema: e.problem_title,
        metrica: e.metric_name,
        hipotesis: e.hypothesis_if ? `SI ${clip(e.hypothesis_if, 160)} ENTONCES ${clip(e.hypothesis_then, 120)} PORQUE ${clip(e.hypothesis_because, 160)}` : null,
        ice: e.ice_score,
        puntaje: e.final_score,
        tipo_prueba: e.test_type,
        inicio_real: e.actual_start,
        duracion_minima: e.min_duration_days,
        veredicto: e.verdict,
        decision: e.decision,
        diferencia_vs_control: read?.diffVsControl ?? null,
        probabilidad_de_ganar: read?.stats?.probability ?? null,
      };
    }),
    aprendizajes: learnings.slice(0, 30).map((l) => ({
      linea: l.line_name,
      ejercicio: l.experiment_title,
      veredicto: l.verdict,
      texto: clip(l.text, 300),
      hipotesis_sugerida: clip(l.suggested_hypothesis, 200),
    })),
    calendario: snap.calendar
      .filter((c) => c.end_date >= today)
      .slice(0, 12)
      .map((c) => ({ tipo: c.type, nombre: c.name, inicio: c.start_date, fin: c.end_date })),
  };
}

export type TiaProgramContext = Awaited<ReturnType<typeof programContextForTia>>;
