"use server";

// La Tía en Pilotos: redacta borradores (diagnóstico, diseño, conclusión) a partir
// de lo que la persona ya puede ver. Los números los pone el motor determinístico
// del módulo; La Tía los recibe calculados y solo los cuenta en palabras.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canWritePilots } from "@/domain/pilots/flow";
import { PILOT_STATUS_LABEL, PILOT_TEST_TYPE_LABEL } from "@/domain/pilots/labels";
import { clip, TIA_ENABLED, tiaSystem, withNumberCheck, type TiaFeature } from "@/domain/tia";
import { fail, failFrom, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { getPilotActionActor } from "@/server/pilot-auth";
import { analyzePilotDetail } from "@/server/pilot-reading";
import { loadPilotCatalogs, loadPilotDetail } from "@/server/queries/pilots";
import { askTia, TiaError, tiaModel } from "@/server/tia/client";
import { ensureTiaAvailable, recordTiaUsage } from "@/server/tia/run";

export type PilotDraftKind = "diagnosis" | "design" | "conclusion";

const FEATURE: Record<PilotDraftKind, TiaFeature> = {
  diagnosis: "pilot_diagnosis",
  design: "pilot_design",
  conclusion: "pilot_conclusion",
};

const TASK: Record<PilotDraftKind, string> = {
  diagnosis: `Diagnostique la línea base del piloto y sugiera cómo afinar la hipótesis.
- En 3 a 5 viñetas: qué dice el problema y su evidencia, qué falta medir, y una hipótesis mejorada en el formato "Si hacemos [cambio] en [ámbito], esperamos mover [métrica] en [N %] porque [razón]".
- Es una sugerencia: la persona decide.`,
  design: `Recomiende el diseño de la prueba y señale riesgos.
- Diga si el tipo de prueba elegido encaja con la variable (la matriz de Arriero ya trae una recomendación) y por qué.
- Riesgos concretos: volumen bajo para el MDE, contaminación entre ciudades o audiencias, solapamiento con otros pilotos, medición (eventos que deben disparar).
- 4 a 6 viñetas, sin inventar cifras: use solo las que vienen en los datos.`,
  conclusion: `Redacte el borrador de conclusión del piloto para gerencia.
- Use SOLO los resultados ya calculados que vienen en "lectura" (no recalcule nada, no invente cifras).
- 1 párrafo de resultado en lenguaje simple (cuánto cambió la métrica principal, el rango probable y qué tan seguros estamos), 1 párrafo de guardrails e incidentes, y una propuesta de aprendizaje en una frase.
- Termine recordando que la decisión la firma el aprobador. Si la evidencia es débil o faltan datos, dígalo primero.`,
};

const uuid = z.string().uuid();

export async function requestPilotDraft(pilotId: string, kind: PilotDraftKind): Promise<ActionResult<{ id: string; content: string }>> {
  if (!TIA_ENABLED) return fail("La Tía está apagada por ahora.");
  if (!uuid.safeParse(pilotId).success || !(kind in TASK)) return fail("Solicitud inválida.");
  const ctx = await getPilotActionActor();
  if (!ctx || !canWritePilots(ctx.actor)) return fail("Su rol en Pilotos es de lectura.");
  const available = await ensureTiaAvailable();
  if (!available.ok) return available;

  const [detail, catalogs] = await Promise.all([loadPilotDetail(pilotId), loadPilotCatalogs()]);
  if (!detail) return fail("El piloto no existe o no tiene acceso.");
  const p = detail.pilot;
  const metricName = new Map(catalogs.metrics.map((m) => [m.id, m.name]));
  const variable = catalogs.variables.find((v) => v.id === p.variable_id);
  const analysis = kind === "conclusion" ? analyzePilotDetail(detail, catalogs) : null;
  const data = {
    piloto: {
      titulo: p.title,
      estado: PILOT_STATUS_LABEL[p.status],
      problema: clip(p.problem, 1500),
      evidencia: clip(p.problem_evidence, 1500),
      hipotesis: {
        cambio: p.hypothesis_change,
        ambito: p.hypothesis_scope,
        metrica: p.hypothesis_metric,
        efecto_esperado_pct: p.hypothesis_expected_pct,
        razon: p.hypothesis_reason,
      },
      variable: variable ? { nombre: variable.name, recomendado: PILOT_TEST_TYPE_LABEL[variable.recommended_test_type] } : null,
      tipo_de_prueba: p.test_type ? PILOT_TEST_TYPE_LABEL[p.test_type] : null,
      justificacion_del_tipo: p.design_justification,
      grupos: detail.arms.map((a) => ({ nombre: a.name, control: a.is_control, reparto_pct: a.split_pct, ciudades: a.cities })),
      medios: detail.media.map((m) => ({ medio: m.media_name, cuenta: m.account, campana: m.campaign, audiencia: m.audience, destino: m.destination })),
      metrica_principal: p.primary_metric_id ? metricName.get(p.primary_metric_id) : null,
      guardrails: detail.guardrails.map((g) => ({ metrica: metricName.get(g.metric_id), limite_pct: g.limit_pct })),
      potencia: p.power_result,
      reglas: p.decision_rules,
      fechas: { inicio: p.actual_start ?? p.planned_start, fin: p.actual_end ?? p.planned_end },
      presupuesto_cop: p.planned_budget_cop,
      lista_de_chequeo: detail.checklist.map((c) => ({ evento: c.event_name, plataforma: c.platform, estado: c.status })),
      incidentes: detail.incidents.map((i) => ({ fecha: i.occurred_on, que_paso: clip(i.description, 300), impacto: i.expected_impact })),
    },
    lectura: analysis,
  };

  try {
    const reply = await askTia({
      system: tiaSystem(TASK[kind], data),
      messages: [{ role: "user", content: "Hágale pues." }],
      maxTokens: 900,
    });
    await recordTiaUsage(null, FEATURE[kind], reply.usage);
    const content = reply.text.trim() ? withNumberCheck(reply.text.trim(), data) : "";
    if (!content) return fail("La Tía se quedó callada. Intente de nuevo.");
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("pilot_ai_drafts")
      .insert({ pilot_id: pilotId, kind, content, model: tiaModel(), created_by: ctx.user.id })
      .select("id")
      .single();
    if (error) return failFrom(error);
    revalidatePath(`/pilotos/${pilotId}`, "layout");
    return ok({ id: row.id, content }, "La Tía dejó un borrador. Revíselo antes de usarlo.");
  } catch (e) {
    if (e instanceof TiaError) return fail(e.message);
    console.error("[tia] pilotos", e instanceof Error ? e.message : e);
    return fail("La Tía no pudo responder. Intente de nuevo en un momentico.");
  }
}

/** Editar un borrador lo deja como "editado"; aprobarlo, como "aprobado". */
export async function reviewPilotDraft(draftId: string, input: { content?: string; approve?: boolean }): Promise<ActionResult> {
  if (!uuid.safeParse(draftId).success) return fail("Borrador inválido.");
  const ctx = await getPilotActionActor();
  if (!ctx || !canWritePilots(ctx.actor)) return fail("Su rol en Pilotos es de lectura.");
  const content = input.content?.trim();
  if (input.content != null && (!content || content.length > 20000)) return fail("El borrador no puede quedar vacío.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pilot_ai_drafts")
    .update({
      ...(content ? { content } : {}),
      status: input.approve ? "approved" : "edited",
      reviewed_by: ctx.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .select("pilot_id")
    .single();
  if (error) return failFrom(error);
  revalidatePath(`/pilotos/${data.pilot_id}`, "layout");
  return ok(undefined, input.approve ? "Borrador aprobado." : "Borrador guardado.");
}
