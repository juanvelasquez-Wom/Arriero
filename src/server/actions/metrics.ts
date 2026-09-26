"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import {
  metricSchema,
  moveSchema,
  targetsSchema,
  type MetricInput,
  type MoveInput,
  type TargetsInput,
} from "@/lib/validation/structure";
import { createsCycle, moveWithinSiblings, nextSortOrder, sortSiblings } from "@/domain/metric-tree";
import { can } from "@/domain/permissions";
import { getActionActor } from "@/server/auth";

const uuid = z.string().uuid();

function revalidateProgram(programId: string) {
  revalidatePath(`/programas/${programId}`, "layout");
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function requireEditor(programId: string): Promise<ActionResult<never> | null> {
  if (!uuid.safeParse(programId).success) return fail("Programa inválido.");
  const ctx = await getActionActor(programId);
  if (!ctx) return fail("Su sesión venció o no tiene acceso a este programa.");
  if (!can.editStructure(ctx.actor)) return fail("Su rol no puede editar métricas.");
  return null;
}

/** Hermanos de una métrica (mismo padre en la misma línea), en orden visual. */
async function loadSiblings(supabase: Supabase, lineId: string, parentId: string | null) {
  let q = supabase.from("metrics").select("id, sort_order").eq("line_id", lineId);
  q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
  const { data, error } = await q.order("sort_order").order("created_at");
  if (error) return { error } as const;
  return { data: sortSiblings((data ?? []).map((r) => ({ id: r.id as string, sort_order: Number(r.sort_order) }))) } as const;
}

async function loadLineMetrics(supabase: Supabase, lineId: string) {
  const { data, error } = await supabase.from("metrics").select("id, parent_id, type").eq("line_id", lineId);
  if (error) return { error } as const;
  return {
    data: (data ?? []).map((r) => ({ id: r.id as string, parent_id: (r.parent_id as string | null) ?? null, type: r.type as string })),
  } as const;
}

function metricRow(v: z.output<typeof metricSchema>) {
  return {
    type: v.type,
    branch: v.branch,
    parent_id: v.parent_id,
    name: v.name,
    definition: v.definition,
    channel: v.channel,
    unit: v.unit,
    direction: v.direction,
    source: v.source,
    baseline: v.baseline,
    owner_id: v.owner_id,
  };
}

export async function createMetric(programId: string, input: MetricInput): Promise<ActionResult<{ id: string }>> {
  const denied = await requireEditor(programId);
  if (denied) return denied;
  const parsed = metricSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { data: line } = await supabase
    .from("business_lines")
    .select("id")
    .eq("id", v.line_id)
    .eq("program_id", programId)
    .maybeSingle();
  if (!line) return fail("La línea no existe o fue borrada.");

  const lineMetrics = await loadLineMetrics(supabase, v.line_id);
  if (lineMetrics.error) return failFrom(lineMetrics.error);
  if (v.type === "north_star" && lineMetrics.data.some((m) => m.type === "north_star")) {
    return fail("Esta línea ya tiene métrica norte. Edítela en lugar de crear otra.", { type: ["Ya existe."] });
  }
  if (v.parent_id && !lineMetrics.data.some((m) => m.id === v.parent_id)) {
    return fail("La métrica padre debe ser de la misma línea.", { parent_id: ["Elija una métrica de esta línea."] });
  }

  const siblings = await loadSiblings(supabase, v.line_id, v.parent_id);
  if (siblings.error) return failFrom(siblings.error);

  const { data, error } = await supabase
    .from("metrics")
    .insert({ ...metricRow(v), line_id: v.line_id, sort_order: nextSortOrder(siblings.data) })
    .select("id")
    .single();
  if (error) return failFrom(error);
  revalidateProgram(programId);
  return ok({ id: data.id as string }, "Métrica creada. Hágale pues.");
}

export async function updateMetric(
  programId: string,
  metricId: string,
  input: MetricInput,
): Promise<ActionResult<{ id: string }>> {
  if (!uuid.safeParse(metricId).success) return fail("Métrica inválida.");
  const denied = await requireEditor(programId);
  if (denied) return denied;
  const parsed = metricSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("metrics")
    .select("id, line_id, parent_id, type")
    .eq("id", metricId)
    .eq("program_id", programId)
    .maybeSingle();
  if (!current) return fail("La métrica no existe o fue borrada.");

  const lineMetrics = await loadLineMetrics(supabase, current.line_id as string);
  if (lineMetrics.error) return failFrom(lineMetrics.error);
  if (
    v.type === "north_star" &&
    current.type !== "north_star" &&
    lineMetrics.data.some((m) => m.type === "north_star" && m.id !== metricId)
  ) {
    return fail("Esta línea ya tiene métrica norte.", { type: ["Ya existe una métrica norte."] });
  }
  if (v.parent_id && !lineMetrics.data.some((m) => m.id === v.parent_id)) {
    return fail("La métrica padre debe ser de la misma línea.", { parent_id: ["Elija una métrica de esta línea."] });
  }
  if (createsCycle(lineMetrics.data, metricId, v.parent_id)) {
    return fail("Una métrica no puede colgar de sí misma ni de una de sus hijas.", {
      parent_id: ["Elija otra métrica padre."],
    });
  }

  const row: Record<string, unknown> = metricRow(v);
  const parentChanged = (current.parent_id ?? null) !== v.parent_id;
  if (parentChanged) {
    const siblings = await loadSiblings(supabase, current.line_id as string, v.parent_id);
    if (siblings.error) return failFrom(siblings.error);
    row.sort_order = nextSortOrder(siblings.data.filter((s) => s.id !== metricId));
  }
  const { error } = await supabase.from("metrics").update(row).eq("id", metricId);
  if (error) return failFrom(error);
  revalidateProgram(programId);
  return ok({ id: metricId }, "Cambios guardados.");
}

/** Sube o baja una métrica entre sus hermanas (mismo padre). */
export async function moveMetric(programId: string, input: MoveInput): Promise<ActionResult> {
  const denied = await requireEditor(programId);
  if (denied) return denied;
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return fail("Movimiento inválido.");

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("metrics")
    .select("id, line_id, parent_id")
    .eq("id", parsed.data.id)
    .eq("program_id", programId)
    .maybeSingle();
  if (!current) return fail("La métrica no existe o fue borrada.");

  const siblings = await loadSiblings(supabase, current.line_id as string, (current.parent_id as string | null) ?? null);
  if (siblings.error) return failFrom(siblings.error);
  const updates = moveWithinSiblings(siblings.data, parsed.data.id, parsed.data.direction);
  if (!updates) return fail(parsed.data.direction === "up" ? "Ya está de primera." : "Ya está de última.");
  for (const u of updates) {
    const { error } = await supabase.from("metrics").update({ sort_order: u.sort_order }).eq("id", u.id);
    if (error) return failFrom(error);
  }
  revalidateProgram(programId);
  return ok(undefined);
}

/** Fija los objetivos por horizonte. Un objetivo vacío se quita. */
export async function setMetricTargets(programId: string, input: TargetsInput): Promise<ActionResult> {
  const denied = await requireEditor(programId);
  if (denied) return denied;
  const parsed = targetsSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const { metric_id, targets } = parsed.data;

  const supabase = await createClient();
  const { data: metric } = await supabase
    .from("metrics")
    .select("id")
    .eq("id", metric_id)
    .eq("program_id", programId)
    .maybeSingle();
  if (!metric) return fail("La métrica no existe o fue borrada.");

  const { data: horizons, error: hError } = await supabase
    .from("program_horizons")
    .select("id")
    .eq("program_id", programId);
  if (hError) return failFrom(hError);
  const valid = new Set((horizons ?? []).map((h) => h.id as string));
  if (targets.some((t) => !valid.has(t.horizon_id))) return fail("Algún horizonte no es de este programa.");

  const upserts = targets
    .filter((t) => t.target != null)
    .map((t) => ({ metric_id, horizon_id: t.horizon_id, target: t.target }));
  const clears = targets.filter((t) => t.target == null).map((t) => t.horizon_id);

  if (upserts.length) {
    const { error } = await supabase.from("metric_targets").upsert(upserts, { onConflict: "metric_id,horizon_id" });
    if (error) return failFrom(error);
  }
  if (clears.length) {
    const { error } = await supabase.from("metric_targets").delete().eq("metric_id", metric_id).in("horizon_id", clears);
    if (error) return failFrom(error);
  }
  revalidateProgram(programId);
  return ok(undefined, "Objetivos guardados. La mula no pregunta, avanza.");
}
