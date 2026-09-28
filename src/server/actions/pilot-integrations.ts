"use server";

// Integraciones de Pilotos (Meta primero) y ventas del negocio.
// · El token lo pega un aprobador; el servidor lo guarda en Vault con la secret
//   key (RPC set_integration_token) y nunca lo devuelve, lo loguea ni lo guarda aquí.
// · Las extracciones y sus escrituras (snapshots, ad_facts, datos mcp) van con el
//   cliente admin porque solo el servidor las escribe; antes se valida el rol y el
//   acceso al piloto con el cliente del usuario (RLS).
// · Las ventas del negocio (CSV) van con el cliente del usuario: RLS decide.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, todayIso } from "@/domain/dates";
import { canLoadData, canWritePilots, isPilotApprover } from "@/domain/pilots/flow";
import { extractionEntities, pickConnection, type EntityMap } from "@/domain/pilots/extraction-mapping";
import { fail, failFrom, fromZod, ok, type ActionResult } from "@/lib/action-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  businessConversionsSchema,
  entityMapSchema,
  integrationConnectionSchema,
  integrationTokenSchema,
  type IntegrationConnectionInput,
  type IntegrationTokenInput,
} from "@/lib/validation/pilots";
import { extractWithMcp, mcpEnabled, providerReady } from "@/server/integrations/mcp";
import {
  applyExtractionToPilot,
  extractionRange,
  metaMediaOf,
  readSnapshotExtraction,
  suggestedMapFor,
  SYNC_STATUSES,
} from "@/server/integrations/pilot-sync";
import { getPilotActionActor } from "@/server/pilot-auth";
import { listIntegrationConnections, loadPilotCatalogs, loadPilotDetail } from "@/server/queries/pilots";

const uuid = z.string().uuid();
const ONLY_APPROVER = "Solo un aprobador administra las integraciones.";
const NO_WRITE = "Su rol en Pilotos es de lectura: pídale a un aprobador que le cambie el rol.";
const OFF = "Las integraciones están apagadas: todo sigue manual. Para prenderlas, vea docs/pilotos/integraciones.md.";

function refresh(pilotId?: string) {
  revalidatePath("/pilotos", "layout");
  if (pilotId) revalidatePath(`/pilotos/${pilotId}`, "layout");
}

async function approver() {
  const ctx = await getPilotActionActor();
  return ctx && isPilotApprover(ctx.actor) ? ctx : null;
}

/** Fecha de vencimiento (día) → fin de ese día en Bogotá. */
function expiresAt(day: string | null | undefined): string | null {
  return day ? `${day}T23:59:59-05:00` : null;
}

/** Guarda el token en Vault. Nunca se devuelve ni se loguea el valor. */
async function storeToken(connectionId: string, token: string, expires: string | null): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("set_integration_token", { p_connection: connectionId, p_token: token, p_expires_at: expires });
    if (error) {
      console.error("[integraciones] No se pudo guardar el token", { connectionId, code: error.code });
      return "No se pudo guardar el token. Revise que la migración de integraciones esté aplicada e intente de nuevo.";
    }
    return null;
  } catch {
    console.error("[integraciones] Falta la secret key en el servidor", { connectionId });
    return "El servidor no tiene la llave para guardar tokens. Revise la configuración (SUPABASE_SECRET_KEY).";
  }
}

// -----------------------------------------------------------------------------
// Conexiones
// -----------------------------------------------------------------------------

export async function createIntegrationConnection(input: IntegrationConnectionInput): Promise<ActionResult<{ id: string }>> {
  if (!(await approver())) return fail(ONLY_APPROVER);
  const parsed = integrationConnectionSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const { account_label, account_ref, token, expires_at } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pilot_integration_connections")
    .insert({ provider: "meta", account_label, account_ref })
    .select("id")
    .single();
  if (error) return error.code === "23505" ? fail("Esa cuenta de Meta ya está conectada.", { account_ref: ["Ya existe."] }) : failFrom(error);
  if (token) {
    const tokenError = await storeToken(data.id, token, expiresAt(expires_at));
    if (tokenError) {
      refresh();
      return fail(`La cuenta quedó creada, pero sin conectar. ${tokenError}`);
    }
  }
  refresh();
  return ok({ id: data.id }, token ? "¡Eso! Cuenta de Meta conectada." : "Cuenta creada. Falta pegar el token para conectarla.");
}

export async function setIntegrationToken(connectionId: string, input: IntegrationTokenInput): Promise<ActionResult> {
  if (!uuid.safeParse(connectionId).success) return fail("Conexión inválida.");
  if (!(await approver())) return fail(ONLY_APPROVER);
  const parsed = integrationTokenSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data: conn } = await supabase.from("pilot_integration_connections").select("id").eq("id", connectionId).maybeSingle();
  if (!conn) return fail("La conexión no existe.");
  const tokenError = await storeToken(connectionId, parsed.data.token, expiresAt(parsed.data.expires_at));
  if (tokenError) return fail(tokenError);
  refresh();
  return ok(undefined, "Token guardado. La cuenta quedó conectada.");
}

export async function deleteIntegrationConnection(connectionId: string): Promise<ActionResult> {
  if (!uuid.safeParse(connectionId).success) return fail("Conexión inválida.");
  if (!(await approver())) return fail(ONLY_APPROVER);
  // Primero se borra el token de Vault (solo el servidor puede); luego la conexión.
  const { error: vaultError } = await createAdminClient().rpc("delete_integration_token", { p_connection: connectionId });
  if (vaultError && vaultError.code !== "PGRST202" && vaultError.code !== "42883") {
    console.error("[integraciones] no se pudo borrar el token", vaultError.code);
    return fail("No se pudo borrar el token guardado. Intente de nuevo.");
  }
  const supabase = await createClient();
  const { error } = await supabase.from("pilot_integration_connections").delete().eq("id", connectionId);
  if (error) return failFrom(error);
  refresh();
  return ok(undefined, "Conexión borrada con su token. Los datos ya traídos se quedan con su origen.");
}

/** Extracción pequeña (ayer, solo inversión) para confirmar que el token sirve. */
export async function testIntegrationConnection(connectionId: string): Promise<ActionResult<{ rows: number; campaigns: number }>> {
  if (!uuid.safeParse(connectionId).success) return fail("Conexión inválida.");
  const ctx = await approver();
  if (!ctx) return fail(ONLY_APPROVER);
  if (!mcpEnabled() || !providerReady("meta")) return fail(OFF);
  const supabase = await createClient();
  const { data: conn } = await supabase
    .from("pilot_integration_connections")
    .select("id, provider, account_ref, status")
    .eq("id", connectionId)
    .maybeSingle();
  if (!conn || !conn.account_ref) return fail("La conexión no existe o no tiene cuenta.");
  if (conn.status !== "connected") return fail("Primero pegue el token para conectar la cuenta.");
  const yesterday = addDays(todayIso(), -1);
  const out = await extractWithMcp(createAdminClient(), {
    pilotId: null,
    connectionId,
    provider: "meta",
    account: conn.account_ref,
    campaigns: [],
    dateFrom: yesterday,
    dateTo: yesterday,
    metrics: ["spend"],
    userId: ctx.user.id,
  });
  refresh();
  if (out.status !== "ok" || !out.data) return fail(`La prueba no pasó. ${out.error ?? "Revise el token y los permisos (ads_read)."}`);
  const campaigns = extractionEntities(out.data).length;
  return ok(
    { rows: out.data.rows.length, campaigns },
    campaigns ? `¡Conexión buena! Ayer hubo inversión en ${campaigns} ${campaigns === 1 ? "campaña" : "campañas"}.` : "¡Conexión buena! Ayer no hubo inversión en la cuenta.",
  );
}

// -----------------------------------------------------------------------------
// Traer datos de Meta a un piloto (dos pasos: extraer y, tras revisar el mapeo, aplicar)
// -----------------------------------------------------------------------------

async function pilotForSync(pilotId: string) {
  const ctx = await getPilotActionActor();
  if (!ctx || !canWritePilots(ctx.actor)) return { error: NO_WRITE } as const;
  // Con el cliente del usuario: si no puede verlo, no existe para él.
  const [detail, catalogs] = await Promise.all([loadPilotDetail(pilotId), loadPilotCatalogs()]);
  if (!detail || detail.pilot.deleted_at) return { error: "El piloto no existe o no tiene acceso." } as const;
  const p = detail.pilot;
  // Mismo criterio que la base (pilot_can_edit): el creador edita solo lo suyo.
  const own = p.created_by === ctx.user.id || p.owner_id === ctx.user.id;
  if (!isPilotApprover(ctx.actor) && !own) return { error: "Solo quien creó el piloto, su responsable o un aprobador traen sus datos." } as const;
  if (!canLoadData(ctx.actor, p.status) || !(SYNC_STATUSES as readonly string[]).includes(p.status)) {
    return { error: "Los datos de Meta se traen con el piloto aprobado, en prueba o en lectura." } as const;
  }
  return { ctx, detail, catalogs } as const;
}

export interface FetchedExtraction {
  snapshotId: string;
  rows: number;
  dateFrom: string;
  dateTo: string;
  entities: string[];
  suggested: EntityMap;
  arms: { id: string; name: string; is_control: boolean }[];
}

export async function fetchPilotMetaData(pilotId: string): Promise<ActionResult<FetchedExtraction>> {
  if (!uuid.safeParse(pilotId).success) return fail("Piloto inválido.");
  if (!mcpEnabled() || !providerReady("meta")) return fail(OFF);
  const r = await pilotForSync(pilotId);
  if ("error" in r) return fail(r.error!);
  const { ctx, detail, catalogs } = r;
  const integration = new Map(catalogs.media.map((m) => [m.id, m.integration]));
  const meta = metaMediaOf(detail, integration);
  if (!meta.length) return fail("Este piloto no tiene un medio de Meta.");
  const connection = pickConnection(
    meta.map((m) => m.account),
    (await listIntegrationConnections()).filter((c) => c.provider === "meta"),
  );
  if (!connection?.account_ref) return fail("No hay una cuenta de Meta conectada que coincida con la del piloto. Revise Catálogos › Integraciones.");
  const range = extractionRange(detail);
  if (!range) return fail("Todavía no hay días cerrados en el rango del piloto para traer.");

  const admin = createAdminClient();
  const out = await extractWithMcp(admin, {
    pilotId,
    connectionId: connection.id,
    provider: "meta",
    account: connection.account_ref,
    campaigns: [...new Set(meta.map((m) => m.campaign).filter((c): c is string => !!c))],
    dateFrom: range.from,
    dateTo: range.to,
    userId: ctx.user.id,
  });
  refresh(pilotId);
  if (out.status !== "ok" || !out.data || !out.snapshotId) {
    return fail(`No se pudieron traer los datos: ${out.error ?? "error desconocido"} El piloto sigue en manual.`);
  }
  if (!out.data.rows.length) return fail("Meta no devolvió filas para ese rango y esas campañas. Revise el nombre de la campaña en el diseño.");
  return ok({
    snapshotId: out.snapshotId,
    rows: out.data.rows.length,
    dateFrom: range.from,
    dateTo: range.to,
    entities: extractionEntities(out.data),
    suggested: await suggestedMapFor(admin, detail, out.data),
    arms: detail.arms.map((a) => ({ id: a.id, name: a.name, is_control: a.is_control })),
  });
}

export async function applyPilotSnapshot(
  pilotId: string,
  snapshotId: string,
  entityMap: EntityMap,
): Promise<ActionResult<{ written: number; keptManual: number; unmapped: number }>> {
  if (!uuid.safeParse(pilotId).success || !uuid.safeParse(snapshotId).success) return fail("Dato inválido.");
  const map = entityMapSchema.safeParse(entityMap);
  if (!map.success) return fail("Revise a qué grupo va cada campaña.");
  if (!Object.values(map.data).some(Boolean)) return fail("Asigne al menos una campaña a un grupo.");
  const r = await pilotForSync(pilotId);
  if ("error" in r) return fail(r.error!);
  const admin = createAdminClient();
  const extraction = await readSnapshotExtraction(admin, pilotId, snapshotId);
  if (!extraction) return fail("Esa extracción no es de este piloto o no quedó válida. Vuelva a traer los datos.");
  try {
    const res = await applyExtractionToPilot(admin, r.detail, r.catalogs.metrics, extraction, snapshotId, map.data);
    refresh(pilotId);
    const parts = [`${res.written} ${res.written === 1 ? "dato guardado" : "datos guardados"}`];
    if (res.unchanged) parts.push(`${res.unchanged} sin cambios`);
    if (res.keptManual) parts.push(`${res.keptManual} cargados a mano se respetaron`);
    return ok({ written: res.written, keptManual: res.keptManual, unmapped: res.skipped.unmapped }, `¡Listo pues! ${parts.join(", ")}.`);
  } catch (e) {
    console.error("[integraciones] Error al aplicar la extracción", { pilotId, snapshotId, message: e instanceof Error ? e.message : "?" });
    return fail("No se pudieron guardar los datos traídos. Intente de nuevo; mientras tanto, cárguelos a mano.");
  }
}

// -----------------------------------------------------------------------------
// Ventas del negocio (CSV) · RLS: creadores y aprobadores
// -----------------------------------------------------------------------------

export async function importBusinessConversions(input: z.input<typeof businessConversionsSchema>): Promise<ActionResult<{ saved: number }>> {
  const ctx = await getPilotActionActor();
  if (!ctx || !canWritePilots(ctx.actor)) return fail(NO_WRITE);
  const parsed = businessConversionsSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const today = todayIso();
  if (parsed.data.some((r) => r.day > today)) return fail("Hay fechas futuras en el archivo.");
  const supabase = await createClient();
  const rows = parsed.data.map((r) => ({ ...r, source: "csv" as const }));
  // Volver a subir el mismo archivo actualiza las cifras (misma fecha, canal, campaña y clave).
  const { error } = await supabase.from("business_conversions").upsert(rows, { onConflict: "day,channel,campaign_name,match_key" });
  if (error) return failFrom(error);
  revalidatePath("/pilotos/campanas");
  return ok({ saved: rows.length }, `¡Listo pues! ${rows.length} ${rows.length === 1 ? "fila guardada" : "filas guardadas"}.`);
}

// -----------------------------------------------------------------------------
// "¿De dónde sale este número?" · lectura con el cliente del usuario (RLS)
// -----------------------------------------------------------------------------

export interface SnapshotDetail {
  id: string;
  source: string;
  account_ref: string | null;
  date_from: string | null;
  date_to: string | null;
  status: "ok" | "invalid" | "error";
  attempts: number;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  error: string | null;
  created_at: string;
  /** JSON validado, recortado para mostrar (las primeras filas). */
  validatedPreview: string | null;
  totalRows: number;
}

const PREVIEW_ROWS = 200;

export async function getSnapshotDetail(pilotId: string, snapshotId: string): Promise<ActionResult<SnapshotDetail>> {
  if (!uuid.safeParse(pilotId).success || !uuid.safeParse(snapshotId).success) return fail("Dato inválido.");
  if (!(await getPilotActionActor())) return fail("Inicie sesión para ver el origen del dato.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pilot_snapshots")
    .select("id, pilot_id, source, account_ref, date_from, date_to, status, attempts, model, input_tokens, output_tokens, error, validated, created_at")
    .eq("id", snapshotId)
    .maybeSingle();
  if (error) return failFrom(error);
  if (!data || data.pilot_id !== pilotId) return fail("No se encontró la extracción de este dato.");
  const validated = data.validated as { rows?: unknown[] } | null;
  const rows = Array.isArray(validated?.rows) ? validated.rows : [];
  const preview = validated ? JSON.stringify({ ...validated, rows: rows.slice(0, PREVIEW_ROWS) }, null, 2) : null;
  return ok({
    id: data.id,
    source: data.source,
    account_ref: data.account_ref,
    date_from: data.date_from,
    date_to: data.date_to,
    status: data.status,
    attempts: data.attempts,
    model: data.model,
    input_tokens: data.input_tokens,
    output_tokens: data.output_tokens,
    error: data.error,
    created_at: data.created_at,
    validatedPreview: preview,
    totalRows: rows.length,
  });
}
