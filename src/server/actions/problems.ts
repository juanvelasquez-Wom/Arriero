"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { attachmentSchema, problemSchema, type ProblemInput } from "@/lib/validation/problems";
import { can } from "@/domain/permissions";
import { getActionActor } from "@/server/auth";

const uuid = z.string().uuid();

export async function createProblem(programId: string, input: ProblemInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await getActionActor(programId);
  if (!ctx || !can.createProblem(ctx.actor)) return fail("Su rol no puede crear problemas.");
  const parsed = problemSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data: stage } = await supabase.from("funnel_stages").select("line_id").eq("id", parsed.data.stage_id).maybeSingle();
  if (!stage) return fail("La etapa no existe o fue borrada.");
  const { data, error } = await supabase
    .from("problems")
    .insert({
      ...parsed.data,
      channel: parsed.data.channel || null,
      root_cause: parsed.data.root_cause || null,
      line_id: stage.line_id,
      program_id: programId,
    })
    .select("id")
    .single();
  if (error) return failFrom(error);
  revalidatePath(`/programas/${programId}`, "layout");
  return ok({ id: data.id }, "Problema registrado. Ahora sí sabemos por dónde es.");
}

export async function updateProblem(programId: string, problemId: string, input: ProblemInput): Promise<ActionResult> {
  const ctx = await getActionActor(programId);
  if (!ctx || !can.editProblem(ctx.actor)) return fail("Su rol no puede editar problemas.");
  if (!uuid.safeParse(problemId).success) return fail("Problema inválido.");
  const parsed = problemSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("problems")
    .update({ ...parsed.data, channel: parsed.data.channel || null, root_cause: parsed.data.root_cause || null })
    .eq("id", problemId);
  if (error) return failFrom(error);
  revalidatePath(`/programas/${programId}`, "layout");
  return ok(undefined, "Problema actualizado. De una.");
}

/** Registra un archivo ya subido a Storage (la subida la valida la política de Storage). */
export async function registerAttachment(programId: string, input: z.input<typeof attachmentSchema>): Promise<ActionResult> {
  const parsed = attachmentSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const a = parsed.data;
  if (!a.storage_path.startsWith(`${programId}/${a.entity_type}/${a.entity_id}/`)) return fail("Ruta de archivo inválida.");
  const supabase = await createClient();
  const { error } = await supabase.from("attachments").insert({
    program_id: programId,
    entity_type: a.entity_type,
    problem_id: a.entity_type === "problem" ? a.entity_id : null,
    experiment_id: a.entity_type === "experiment" ? a.entity_id : null,
    storage_path: a.storage_path,
    name: a.name,
    mime_type: a.mime_type,
    size_bytes: a.size_bytes,
  });
  if (error) return failFrom(error);
  revalidatePath(`/programas/${programId}`, "layout");
  return ok(undefined, "Adjunto guardado.");
}

/** URL firmada de descarga (5 minutos). Storage valida la pertenencia al programa. */
export async function getAttachmentUrl(storagePath: string): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("attachments").createSignedUrl(storagePath, 300, { download: true });
  if (error || !data) return fail("No se pudo generar el enlace de descarga.");
  return ok({ url: data.signedUrl });
}
