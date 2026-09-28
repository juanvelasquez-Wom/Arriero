import { Coffee, Lightbulb, Map as MapIcon, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Callout, PageHeader, Section } from "@/components/app/page";
import { ProblemForm } from "@/components/problems/problem-form";
import { todayIso } from "@/domain/dates";
import { draftProblemFromMetric, EVIDENCE_MAX_WEEKS, pickHorizon } from "@/domain/evidence";
import { problemPrefillFromInsight } from "@/domain/insights";
import { getInsight } from "@/server/queries/insights";
import { can } from "@/domain/permissions";
import { parseProblemPrefill } from "@/domain/tia-insights";
import type { MetricDirection } from "@/domain/types";
import type { ProblemInput } from "@/lib/validation/problems";
import { createClient } from "@/lib/supabase/server";
import { getProgramContext } from "@/server/auth";
import { listLines } from "@/server/queries/programs";
import { listStages } from "@/server/queries/structure";

export const metadata: Metadata = { title: "Nueva oportunidad de mejora" };

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MetricDraft {
  metricName: string;
  lineId: string;
  defaults: ProblemInput;
}

/**
 * Borrador desde una métrica (`?metrica=<id>`): línea de la métrica, etapa
 * vinculada a ella (si hay) y título/evidencia con las últimas semanas, la
 * línea base y la meta del horizonte vigente. Lee como el usuario (RLS).
 */
async function metricDraft(programId: string, metricId: string): Promise<MetricDraft | null> {
  if (!uuidRe.test(metricId)) return null;
  const supabase = await createClient();
  const { data: metric } = await supabase
    .from("metrics")
    .select("id, line_id, name, unit, direction, baseline, metric_targets(target, program_horizons(name, start_date, end_date))")
    .eq("id", metricId)
    .eq("program_id", programId)
    .maybeSingle();
  if (!metric) return null;

  const [{ data: values }, { data: stage }] = await Promise.all([
    supabase
      .from("metric_values")
      .select("week_start, value")
      .eq("metric_id", metricId)
      .order("week_start", { ascending: false })
      .limit(EVIDENCE_MAX_WEEKS),
    supabase.from("funnel_stages").select("id").eq("metric_id", metricId).order("sort_order").limit(1).maybeSingle(),
  ]);

  type TargetRow = { target: number; program_horizons: { name: string; start_date: string; end_date: string } | null };
  const horizons = ((metric.metric_targets ?? []) as unknown as TargetRow[])
    .filter((t) => t.program_horizons)
    .map((t) => ({ ...t.program_horizons!, target: Number(t.target) }));
  const draft = draftProblemFromMetric({
    name: metric.name as string,
    unit: (metric.unit as string | null) ?? null,
    direction: metric.direction as MetricDirection,
    baseline: metric.baseline == null ? null : Number(metric.baseline),
    values: (values ?? []).map((v) => ({ week_start: v.week_start as string, value: Number(v.value) })),
    horizon: pickHorizon(horizons, todayIso()),
  });

  return {
    metricName: metric.name as string,
    lineId: metric.line_id as string,
    defaults: {
      stage_id: (stage?.id as string | undefined) ?? "",
      channel: "",
      title: draft.title,
      evidence: draft.evidence,
      root_cause: "",
      impact: draft.gap != null && draft.gap >= 0.15 ? "high" : "medium",
      control: "ours",
      status: "to_validate",
    },
  };
}

export default async function NewProblemPage({ params, searchParams }: PageProps<"/programas/[programId]/problemas/nuevo">) {
  const { programId } = await params;
  const sp = await searchParams;
  const ctx = await getProgramContext(programId);
  if (!can.createProblem(ctx.actor)) redirect(`/programas/${programId}/problemas`);
  const metricId = typeof sp.metrica === "string" ? sp.metrica : null;
  const [lines, stages, fromMetric] = await Promise.all([
    listLines(programId),
    listStages({ programId }),
    metricId ? metricDraft(programId, metricId) : Promise.resolve(null),
  ]);
  // Borrador desde la URL (p. ej. "Convertir en problema" de La Tía): textos recortados y
  // solo línea y etapa que existan en el programa.
  const prefill = parseProblemPrefill(sp, { lines, stages });
  // Desde el carriel de insights: título y evidencia salen del insight (leído con RLS).
  const insightParam = typeof sp.insight === "string" && uuidRe.test(sp.insight) ? sp.insight : null;
  const fromInsight = insightParam ? await getInsight(insightParam, ctx.user.id) : null;
  const insightDraft = fromInsight ? problemPrefillFromInsight(fromInsight) : null;
  if (insightDraft) {
    prefill.title ??= insightDraft.titulo;
    prefill.evidence = [prefill.evidence, insightDraft.evidencia].filter(Boolean).join("\n\n") || null;
  }
  const lineParam = prefill.lineId ?? undefined;
  const fromQuickStart = sp.desde === "arranque";
  const fromTia = sp.desde === "tia" && !!(prefill.title || prefill.evidence);
  const hasPrefill = !!(prefill.title || prefill.evidence || prefill.stageId);
  const base: ProblemInput = fromMetric?.defaults ?? {
    stage_id: "",
    channel: "",
    title: "",
    evidence: "",
    root_cause: "",
    impact: "medium",
    control: "ours",
    status: "to_validate",
  };
  // Si viene línea explícita y la etapa de la métrica es de otra línea, manda la etapa pedida (o ninguna).
  const baseStageOk = !prefill.lineId || stages.some((st) => st.id === base.stage_id && st.line_id === prefill.lineId);
  const defaults: ProblemInput | undefined = hasPrefill
    ? {
        ...base,
        stage_id: prefill.stageId ?? (baseStageOk ? base.stage_id : ""),
        title: prefill.title ?? base.title,
        evidence: [prefill.evidence, fromMetric?.defaults.evidence].filter(Boolean).join("\n\n").slice(0, 4000),
      }
    : fromMetric?.defaults;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Nueva oportunidad de mejora"
        description="Cargue lo que importa: dónde se pierde valor, con qué datos y por qué creemos que pasa. De aquí nacen los ejercicios."
      />
      {fromQuickStart ? (
        <Callout icon={MapIcon} className="mb-4">
          ¡Listo pues, ya tiene el mapa! Ahora cuéntele a Arriero dónde se pierde valor: una oportunidad de mejora con los datos que la muestran.
          Después puede completar líneas base y metas en Configuración.
        </Callout>
      ) : null}
      {fromInsight ? (
        <Callout icon={Lightbulb} tone="neutral" className="mb-4">
          Esta oportunidad de mejora nace del insight «{fromInsight.title}», de {fromInsight.author_name}. Le dejamos el texto y la fuente como evidencia: elija
          la etapa, cuente la causa que sospecha y guárdelo. Al guardar, el insight queda sembrado aquí.
        </Callout>
      ) : null}
      {fromTia ? (
        <Callout icon={Coffee} tone="neutral" className="mb-4">
          La Tía le dejó el borrador con lo que vio en los datos. Revíselo, complete la causa que sospecha y ajuste lo que haga falta:
          ella propone, usted decide. Nada se guarda hasta que usted lo diga.
        </Callout>
      ) : null}
      {fromMetric ? (
        <Callout icon={Sparkles} tone="neutral" className="mb-4">
          Le dejamos un borrador con los datos de «{fromMetric.metricName}»: las últimas semanas, la línea base y la meta. Revíselo,
          ajústelo a su gusto y cuéntenos la causa que sospecha. Nada se guarda hasta que usted lo diga.
        </Callout>
      ) : metricId ? (
        <Callout tone="neutral" className="mb-4">
          No encontramos esa métrica (quizás la borraron). Puede registrar la oportunidad de mejora a mano.
        </Callout>
      ) : null}
      <Section>
        <ProblemForm
          programId={programId}
          lines={lines}
          stages={stages}
          defaults={defaults}
          defaultLineId={lineParam ?? fromMetric?.lineId}
          insightId={fromInsight?.id}
        />
      </Section>
    </div>
  );
}
