import "server-only";

// La Tía copiloto en el servidor: arma el contexto (lo que la persona puede ver,
// con RLS), decide si hace falta Claude, y guarda con las mismas acciones que usa
// la interfaz (sus permisos y validaciones no se saltan).
import { todayIso } from "@/domain/dates";
import { GLOSSARY, type GlossaryEntry } from "@/domain/glossary";
import { canWritePilots, effectivePilotRole } from "@/domain/pilots/flow";
import { parseScoringConfig } from "@/domain/scoring";
import { normalizeText } from "@/domain/search";
import { clip, TIA_LINES, withNumberCheck, type TiaFeature } from "@/domain/tia";
import {
  ackFor,
  ADVICE_FIELD,
  adviceNeedsSmartModel,
  applyPatch,
  applyValue,
  armsFor,
  canCommit,
  copilotNudges,
  EDIT_FIELD,
  emptyCopilotState,
  fieldSpec,
  firstSentence,
  introFor,
  isHowTo,
  nextStep,
  recommendTestType,
  refFor,
  routeMessage,
  sanitizeState,
  startChips,
  type Chip,
  type ChipAction,
  type CopilotContext,
  type CopilotState,
  type CreatedRef,
  type RefItem,
  type TiaOut,
  type UpdateTarget,
} from "@/domain/tia-copilot";
import { adviceSystem, buildExtractInput, EXTRACT_SYSTEM, needsRefs, parseExtraction } from "@/domain/tia-copilot-prompt";
import { costUsd, usdCop } from "@/domain/tia-cost";
import type { PilotRole, PilotStatus } from "@/domain/pilots/types";
import { createClient } from "@/lib/supabase/server";
import { addComment } from "@/server/actions/comments";
import { transitionExperiment } from "@/server/actions/experiments";
import { saveWeeklyValues } from "@/server/actions/metric-values";
import { createPilot, logIncident, moveToReading, savePilotDesign, startPilot } from "@/server/actions/pilots";
import { createProblem } from "@/server/actions/problems";
import { saveQuickStart } from "@/server/actions/setup";
import { getActionActor, getSessionUser, type ProgramContext, type ProgramSummary, type SessionUser } from "@/server/auth";
import { analyzePilotDetail } from "@/server/pilot-reading";
import { listPilots, loadPilotCatalogs, loadPilotDetail } from "@/server/queries/pilots";
import { listLines, listMyPrograms } from "@/server/queries/programs";
import { listStages } from "@/server/queries/structure";
import { askTia, TiaError, tiaConfigured, tiaFastModel, tiaModel, type TiaUsage } from "./client";
import { programContextForTia } from "./context";
import { ensureTiaAvailable, recordTiaUsage } from "./run";

export interface CopilotSpend {
  model: string;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  cop: number;
}

export interface CopilotReply {
  state: CopilotState;
  out: TiaOut[];
  spend: CopilotSpend[];
}

interface Scope {
  programId: string | null;
  pilotId: string | null;
  experimentId: string | null;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** De qué habla la pantalla donde está la persona (sin confiar en ella: RLS decide qué se lee). */
export function scopeFromPath(path: string): Scope {
  const program = path.match(new RegExp(`^/programas/(${UUID})`, "i"))?.[1] ?? null;
  const experiment = path.match(new RegExp(`/ejercicios/(${UUID})`, "i"))?.[1] ?? null;
  const pilot = path.match(new RegExp(`^/pilotos/(${UUID})`, "i"))?.[1] ?? null;
  return { programId: program, pilotId: pilot, experimentId: experiment };
}

interface Loaded {
  user: SessionUser;
  ctx: CopilotContext;
  scope: Scope;
  pilotRole: PilotRole | null;
  nudgeInput: Parameters<typeof copilotNudges>[0];
}

async function pilotRoleOf(user: SessionUser): Promise<PilotRole | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pilot_roles").select("role").eq("user_id", user.id).maybeSingle();
  return effectivePilotRole(user.isAdmin, error ? null : ((data?.role ?? null) as PilotRole | null));
}

/** Lo que La Tía sabe para conversar: permisos, medios, y un índice corto de lo que se puede actualizar. */
async function loadContext(state: CopilotState, path: string, user: SessionUser): Promise<Loaded> {
  const scope = scopeFromPath(path);
  const supabase = await createClient();
  // Solo se lee lo que el turno puede necesitar: armando un proyecto o un piloto no hace falta el índice de avances.
  const needRefs = !state.mode || state.mode === "update";
  const needChannels = !state.mode || state.mode === "pilot";
  const none = Promise.resolve({ data: [] as unknown[] });
  let experimentsQuery = supabase
    .from("experiments")
    .select("id, title, status, program_id, actual_start, min_duration_days")
    .is("deleted_at", null)
    .in("status", ["idea", "prioritized", "in_design", "in_test", "in_reading"])
    .order("updated_at", { ascending: false })
    .limit(25);
  if (scope.programId) experimentsQuery = experimentsQuery.eq("program_id", scope.programId);
  const metricsQuery = (
    scope.programId
      ? supabase.from("metrics").select("id, name, type, program_id").eq("program_id", scope.programId)
      : supabase.from("metrics").select("id, name, type, program_id").in("type", ["north_star", "efficiency"])
  )
    .is("deleted_at", null)
    .limit(30);
  const [pilotRole, programs, pilots, catalogs, experimentsRes, metricsRes] = await Promise.all([
    pilotRoleOf(user),
    needRefs ? listMyPrograms(user.id).catch(() => []) : Promise.resolve([]),
    needRefs ? listPilots().catch(() => []) : Promise.resolve([]),
    needChannels ? loadPilotCatalogs().catch(() => null) : Promise.resolve(null),
    needRefs ? experimentsQuery : none,
    needRefs ? metricsQuery : none,
  ]);
  const programName = new Map(programs.map((p) => [p.id, p.name]));
  const experiments = (experimentsRes.data ?? []) as { id: string; title: string; status: string; program_id: string; actual_start: string | null; min_duration_days: number | null }[];
  const metrics = (metricsRes.data ?? []) as { id: string; name: string; type: string; program_id: string }[];
  const activePilots = pilots.filter((p) => !p.deleted_at && !p.is_example && p.status !== "decided" && p.status !== "cancelled").slice(0, 20);

  const refs: RefItem[] = [
    ...programs.slice(0, 12).map((p) => ({ ref: refFor("program", p.id), kind: "program" as const, id: p.id, label: p.name })),
    ...experiments.map((e) => ({
      ref: refFor("experiment", e.id),
      kind: "experiment" as const,
      id: e.id,
      label: e.title,
      programId: e.program_id,
      programName: programName.get(e.program_id) ?? null,
      status: e.status,
    })),
    ...metrics.map((m) => ({ ref: refFor("metric", m.id), kind: "metric" as const, id: m.id, label: m.name, programId: m.program_id, programName: programName.get(m.program_id) ?? null })),
    ...activePilots.map((p) => ({ ref: refFor("pilot", p.id), kind: "pilot" as const, id: p.id, label: p.title, status: p.status })),
  ];
  // Lo de la pantalla actual va primero en los botones.
  refs.sort((a, b) => Number(isInScope(b, scope)) - Number(isInScope(a, scope)));

  const ctx: CopilotContext = {
    today: todayIso(),
    canCreateProject: user.isAdmin,
    canCreatePilot: canWritePilots({ userId: user.id, role: pilotRole }),
    channels: (catalogs?.media ?? []).filter((m) => !m.archived_at && !m.merged_into_id).map((m) => m.name),
    refs,
    lines: [],
    stages: [],
  };
  await loadLinesFor(ctx, state, scope);
  return {
    user,
    ctx,
    scope,
    pilotRole,
    nudgeInput: {
      experiments: experiments.map((e) => ({ ...e, programId: e.program_id, programName: programName.get(e.program_id) ?? "" })),
      pilots: activePilots.map((p) => ({ id: p.id, title: p.title, status: p.status as PilotStatus, planned_start: p.planned_start, planned_end: p.planned_end, actual_start: p.actual_start })),
    },
  };
}

function isInScope(r: RefItem, scope: Scope): boolean {
  return r.id === scope.programId || r.id === scope.pilotId || r.id === scope.experimentId || (!!scope.programId && r.programId === scope.programId);
}

/** Líneas y etapas del programa al que va una oportunidad de mejora nueva. */
async function loadLinesFor(ctx: CopilotContext, state: CopilotState, scope: Scope) {
  const programId = state.mode === "update" && state.update.kind === "opportunity" ? state.update.target?.id ?? null : null;
  if (!programId) {
    ctx.lines = [];
    ctx.stages = [];
    return;
  }
  const [lines, stages] = await Promise.all([listLines(programId).catch(() => []), listStages({ programId }).catch(() => [])]);
  ctx.lines = lines.map((l) => ({ id: l.id, name: l.name }));
  const lineId = state.update.lineId ?? (lines.length === 1 ? lines[0].id : null);
  ctx.stages = [...new Set(stages.filter((s) => !lineId || s.line_id === lineId).map((s) => s.name))];
  void scope;
}

// ---------------------------------------------------------------------------
// Entrada principal

export async function openCopilot(rawState: unknown, path: string): Promise<CopilotReply> {
  const user = await getSessionUser();
  if (!user) return { state: emptyCopilotState(), out: [{ text: "Su sesión venció. Entre de nuevo y seguimos.", tone: "warn" }], spend: [] };
  const state = sanitizeState(rawState);
  const loaded = await loadContext(state, path, user);
  if (!tiaConfigured()) return { state, out: [{ text: TIA_LINES.notConfigured, tone: "warn" }], spend: [] };
  if (state.mode) {
    // Retoma donde iba.
    const step = nextStep(state, loaded.ctx, "Sigamos donde íbamos.");
    return { state: step.state, out: [step.out], spend: [] };
  }
  const nudges = copilotNudges(loaded.nudgeInput, loaded.ctx.today);
  const hello = `¡Quiubo, ${firstName(user.name)}! Soy La Tía. Dígame qué quiere hacer y yo le voy pidiendo lo que falta: armo proyectos y pilotos, anoto avances y le doy mi opinión.`;
  const out: TiaOut[] = [{ text: hello, chips: startChips(loaded.ctx) }];
  if (nudges.length) out.push({ text: nudges.map((n) => `• ${n.text}`).join("\n"), chips: nudges.map((n) => n.chip) });
  return { state, out, spend: [] };
}

export async function copilotTurn(input: { state: unknown; message?: string; chip?: ChipAction; path: string }): Promise<CopilotReply> {
  const user = await getSessionUser();
  if (!user) return { state: emptyCopilotState(), out: [{ text: "Su sesión venció. Entre de nuevo y seguimos.", tone: "warn" }], spend: [] };
  if (!tiaConfigured()) return { state: sanitizeState(input.state), out: [{ text: TIA_LINES.notConfigured, tone: "warn" }], spend: [] };
  let state = sanitizeState(input.state);
  const loaded = await loadContext(state, input.path, user);
  const spend: CopilotSpend[] = [];

  if (input.chip) return handleChip(state, input.chip, loaded, spend);

  const message = (input.message ?? "").trim().slice(0, 2000);
  if (!message) return { state, out: [nextStep(state, loaded.ctx).out], spend };

  // Primero todo lo que se resuelve sin Claude (routeMessage, en el dominio).
  const route = routeMessage(state, message, loaded.ctx, glossaryAnswer);
  switch (route.t) {
    case "reset": {
      const reset = { ...emptyCopilotState(), last: state.last };
      return { state: reset, out: [nextStep(reset, loaded.ctx, "Listo, borrón y cuenta nueva.").out], spend };
    }
    case "advice":
      return advise(route.question, route.state, loaded, spend);
    case "commit":
      return commit(state, loaded, spend);
    case "edit":
      return { state: route.state, out: [{ text: "¿Qué le cambio? Dígamelo como le salga, por ejemplo «que sean 12 meses»." }], spend };
    case "local": {
      await loadLinesFor(loaded.ctx, route.state, loaded.scope);
      const step = nextStep(route.state, loaded.ctx);
      return { state: step.state, out: [step.out], spend };
    }
    case "short":
      return { state, out: [{ text: route.text, chips: route.chips }], spend };
    case "glossary":
      return { state, out: [{ text: route.text, chips: startChips(loaded.ctx) }], spend };
    case "mode":
      return startMode(state, route.mode, loaded, spend);
    case "extract":
      state = route.state;
  }

  // Claude (Haiku) interpreta el mensaje.
  const extraction = await extract(state, message, loaded, spend);
  if (!extraction.ok) return { state, out: [{ text: extraction.error, tone: "warn" }], spend };
  const x = extraction.value;
  if (x.mode === "advice") return advise(x.question ?? message, state, loaded, spend);

  let next = state;
  if (x.mode && x.mode !== state.mode) {
    next = { ...state, mode: x.mode, asked: null, confirming: false, skipped: [] };
    if (x.mode === "update") next.update = {};
  }
  if (!next.mode) {
    return { state: next, out: [{ text: "No le entendí bien qué quiere hacer. ¿Me ayuda escogiendo una opción?", chips: startChips(loaded.ctx) }], spend };
  }
  let { state: patched, applied } = applyPatch(next, x.patch, loaded.ctx);
  // Si eligió un programa para una oportunidad, se cargan sus líneas y se reintenta lo que dependía de ellas.
  if (applied.includes("target")) {
    await loadLinesFor(loaded.ctx, patched, loaded.scope);
    const retry = applyPatch(patched, pick(x.patch, ["lineId", "stage"]), loaded.ctx);
    patched = retry.state;
    applied = [...applied, ...retry.applied];
  }
  await loadLinesFor(loaded.ctx, patched, loaded.scope);

  const modeChanged = next.mode !== state.mode;
  if (!applied.length && !modeChanged) {
    const spec = patched.asked ? fieldSpec(patched, patched.asked) : null;
    return {
      state: patched,
      out: [{ text: spec ? `No le entendí bien. ${spec.question(patched, loaded.ctx)}` : "No le entendí bien. ¿Me lo dice de otra forma?", chips: spec?.chips?.(patched, loaded.ctx) }],
      spend,
    };
  }
  const prefix = [modeChanged ? introFor(patched.mode as NonNullable<CopilotState["mode"]>) : null, ackFor(applied)].filter(Boolean).join(" ");
  const step = nextStep(patched, loaded.ctx, prefix || undefined);
  return { state: step.state, out: [step.out], spend };
}

function pick(obj: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
}

function startMode(state: CopilotState, mode: NonNullable<CopilotState["mode"]>, loaded: Loaded, spend: CopilotSpend[]): CopilotReply {
  const fresh: CopilotState = { ...emptyCopilotState(), mode, last: state.last };
  const step = nextStep(fresh, loaded.ctx, introFor(mode));
  return { state: step.state, out: [step.out], spend };
}

async function handleChip(state: CopilotState, chip: ChipAction, loaded: Loaded, spend: CopilotSpend[]): Promise<CopilotReply> {
  switch (chip.t) {
    case "mode":
      return startMode(state, chip.mode, loaded, spend);
    case "update": {
      const target = chip.target ? validTarget(chip.target, loaded.ctx) : undefined;
      let next: CopilotState = { ...emptyCopilotState(), mode: "update", last: state.last };
      next = applyValue(next, "kind", chip.kind, loaded.ctx) ?? next;
      if (target) next = { ...next, update: { ...next.update, target } };
      await loadLinesFor(loaded.ctx, next, loaded.scope);
      const step = nextStep(next, loaded.ctx);
      return { state: step.state, out: [step.out], spend };
    }
    case "set": {
      const next = applyValue(state, chip.field, chip.value, loaded.ctx);
      if (!next) return { state, out: [{ text: "Esa opción ya no me sirve. Escríbame la respuesta, porfa.", tone: "warn" }], spend };
      await loadLinesFor(loaded.ctx, next, loaded.scope);
      const extra =
        chip.field === "testType" && state.mode === "pilot" && chip.value === recommendTestType(state.pilot).type
          ? `Le recomiendo «${labelOfTest(chip.value as string)}» porque ${recommendTestType(state.pilot).why}.`
          : undefined;
      const step = nextStep({ ...next, confirming: false }, loaded.ctx, extra);
      return { state: step.state, out: [step.out], spend };
    }
    case "skip": {
      const step = nextStep({ ...state, skipped: [...new Set([...state.skipped, chip.field])] }, loaded.ctx);
      return { state: step.state, out: [step.out], spend };
    }
    case "commit":
      if (!canCommit(state)) {
        const step = nextStep(state, loaded.ctx, "Todavía me falta algo obligatorio.");
        return { state: step.state, out: [step.out], spend };
      }
      return commit(state, loaded, spend);
    case "edit":
      return { state: { ...state, confirming: false, asked: EDIT_FIELD }, out: [{ text: "¿Qué le cambio? Dígamelo como le salga, por ejemplo «que arranque el lunes» o «agregue recargas»." }], spend };
    case "reset": {
      const reset = { ...emptyCopilotState(), last: state.last };
      return { state: reset, out: [nextStep(reset, loaded.ctx, "Listo, no guardé nada. ¿En qué más le ayudo?").out], spend };
    }
    case "advice":
      if (chip.about === "last" && state.last) return advise(`¿Qué opina de «${state.last.label}» y qué debería hacer ahora?`, state, loaded, spend, state.last);
      return { state: { ...state, asked: ADVICE_FIELD }, out: [{ text: "Hágale, pregunte. Si es sobre un proyecto o un piloto, ábralo primero y así le miro los datos de ese." }], spend };
  }
}

function validTarget(t: UpdateTarget, ctx: CopilotContext): UpdateTarget | undefined {
  const ref = ctx.refs.find((r) => r.id === t.id && r.kind === t.kind);
  return ref ? { id: ref.id, kind: ref.kind, label: ref.label, programId: ref.programId ?? null, status: ref.status ?? null } : undefined;
}

function labelOfTest(t: string): string {
  return { ab_creative: "A/B de creatividades", ab_platform: "A/B en plataforma", holdout: "Holdout", geo: "Por geografía", pre_post: "Antes / después" }[t] ?? t;
}

function firstName(name: string): string {
  return (name.split(/[\s@.]+/)[0] || "").replace(/^./, (c) => c.toUpperCase());
}

function glossaryAnswer(message: string): string | null {
  const t = normalizeText(message).replace(/[?¿]/g, "").trim();
  const m = t.match(/^(que es|que significa|que quiere decir)\s+(el |la |un |una )?(.+)$/);
  if (!m) return null;
  const term = m[3].trim();
  const entry: GlossaryEntry | undefined = (Object.values(GLOSSARY) as GlossaryEntry[]).find((e) => normalizeText(e.label) === term);
  return entry ? `**${entry.label}:** ${entry.simple}${entry.detail ? `\n\n${entry.detail}` : ""}` : null;
}

// ---------------------------------------------------------------------------
// Claude

function spendOf(usage: TiaUsage): CopilotSpend {
  const usd = costUsd(usage);
  return { model: usage.model, inputTokens: usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0), outputTokens: usage.outputTokens, usd, cop: Math.round(usd * usdCop(process.env.TIA_USD_COP)) };
}

async function callTia(opts: { feature: TiaFeature; programId: string | null; model: string; system: string; message: string; maxTokens: number; cacheSystem?: boolean; temperature?: number }, spend: CopilotSpend[]) {
  const available = await ensureTiaAvailable(opts.programId, opts.feature);
  if (!available.ok) return { ok: false as const, error: available.error };
  try {
    const reply = await askTia({
      model: opts.model,
      system: opts.system,
      cacheSystem: opts.cacheSystem,
      messages: [{ role: "user", content: opts.message }],
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });
    await recordTiaUsage(opts.programId, opts.feature, reply.usage);
    spend.push(spendOf(reply.usage));
    return { ok: true as const, text: reply.text.trim() };
  } catch (e) {
    if (e instanceof TiaError) return { ok: false as const, error: e.message };
    console.error("[tia-copilot] error inesperado", e instanceof Error ? e.message : e);
    return { ok: false as const, error: "La Tía no pudo responder. Intente de nuevo en un momentico." };
  }
}

async function extract(state: CopilotState, message: string, loaded: Loaded, spend: CopilotSpend[]) {
  const refs = needsRefs(state, message) ? loaded.ctx.refs.slice(0, 40) : [];
  const res = await callTia(
    {
      feature: "copilot",
      programId: loaded.scope.programId,
      model: tiaFastModel(),
      system: EXTRACT_SYSTEM,
      cacheSystem: true,
      message: buildExtractInput({ state, message, today: loaded.ctx.today, refs }),
      maxTokens: 400,
      temperature: 0,
    },
    spend,
  );
  if (!res.ok) return { ok: false as const, error: res.error };
  const parsed = parseExtraction(res.text);
  if (!parsed) return { ok: false as const, error: "Se me enredó la lengua. ¿Me lo repite con otras palabras?" };
  return { ok: true as const, value: parsed };
}

/** Opina: Sonnet si hay que interpretar datos; Haiku si es una duda de uso. Con los datos justos. */
async function advise(question: string, state: CopilotState, loaded: Loaded, spend: CopilotSpend[], about?: CreatedRef): Promise<CopilotReply> {
  const subject = about ?? subjectFromScope(loaded.scope, state);
  // Una duda de uso no necesita los datos: se ahorra el contexto completo.
  const data = subject && !isHowTo(question) ? await briefFor(subject, loaded).catch(() => null) : null;
  const smart = adviceNeedsSmartModel(question, !!data);
  const res = await callTia(
    {
      feature: "copilot_advice",
      programId: subject?.programId ?? loaded.scope.programId,
      model: smart ? tiaModel() : tiaFastModel(),
      system: adviceSystem(data),
      message: question,
      maxTokens: smart ? 700 : 400,
    },
    spend,
  );
  const chips: Chip[] = [{ label: "Otra pregunta", action: { t: "advice" } }, ...startChips(loaded.ctx).slice(0, 2)];
  if (!res.ok) return { state, out: [{ text: res.error, tone: "warn" }], spend };
  const text = data ? withNumberCheck(res.text, data) : res.text;
  return { state: { ...state, asked: state.mode ? state.asked : null }, out: [{ text: text || "Me quedé sin palabras. Pregúnteme de otra forma.", chips: state.mode ? undefined : chips }], spend };
}

function subjectFromScope(scope: Scope, state: CopilotState): CreatedRef | null {
  if (scope.pilotId) return { kind: "pilot", id: scope.pilotId, label: "este piloto", href: `/pilotos/${scope.pilotId}` };
  if (scope.programId) return { kind: "program", id: scope.programId, label: "este programa", href: `/programas/${scope.programId}`, programId: scope.programId };
  return state.last;
}

/** Datos compactos para opinar (recortados para gastar pocos tokens). */
async function briefFor(subject: CreatedRef, loaded: Loaded): Promise<unknown> {
  if (subject.kind === "pilot") {
    const [detail, catalogs] = await Promise.all([loadPilotDetail(subject.id), loadPilotCatalogs()]);
    if (!detail) return null;
    const p = detail.pilot;
    const reading = p.status === "in_test" || p.status === "in_reading" || p.status === "decided" ? analyzePilotDetail(detail, catalogs) : null;
    return {
      hoy: loaded.ctx.today,
      piloto: {
        titulo: p.title,
        estado: p.status,
        oportunidad: clip(p.problem, 400),
        evidencia: clip(p.problem_evidence, 300),
        hipotesis: { cambio: clip(p.hypothesis_change, 200), metrica: p.hypothesis_metric, esperado_pct: p.hypothesis_expected_pct },
        tipo_de_prueba: p.test_type,
        fechas: { inicio: p.actual_start ?? p.planned_start, fin: p.actual_end ?? p.planned_end },
        presupuesto_cop: p.planned_budget_cop,
        grupos: detail.arms.map((a) => ({ nombre: a.name, control: a.is_control, reparto: a.split_pct })),
        medios: detail.media.map((m) => m.media_name),
        chequeo_pendiente: detail.checklist.filter((c) => c.status !== "ok").length,
        incidentes: detail.incidents.slice(0, 5).map((i) => ({ fecha: i.occurred_on, que: clip(i.description, 160), impacto: i.expected_impact })),
        mediciones: detail.measurements.length,
      },
      lectura: reading ? clipJson(reading, 2500) : null,
    };
  }
  const programId = subject.programId ?? (subject.kind === "program" ? subject.id : null);
  if (!programId) return null;
  const ctx = await programContextFor(programId);
  if (!ctx) return null;
  const full = await programContextForTia(ctx);
  return {
    hoy: full.hoy,
    programa: full.programa,
    metricas_norte: full.metricas_norte.map((n) => ({ ...n, ultimas_semanas: n.ultimas_semanas.slice(-4) })),
    oportunidades: full.problemas.slice(0, 8).map((p) => ({ titulo: p.titulo, etapa: p.etapa, impacto: p.impacto, estado: p.estado, ejercicios: p.ejercicios })),
    ejercicios: full.ejercicios
      .filter((e) => e.estado !== "discarded")
      .slice(0, 12)
      .map((e) => ({ titulo: e.titulo, estado: e.estado, metrica: e.metrica, puntaje: e.puntaje, inicio: e.inicio_real, veredicto: e.veredicto, dif_vs_control: e.diferencia_vs_control, prob_ganar: e.probabilidad_de_ganar })),
    aprendizajes: full.aprendizajes.slice(0, 5).map((l) => ({ ejercicio: l.ejercicio, veredicto: l.veredicto, texto: clip(l.texto, 160) })),
    calendario: full.calendario.slice(0, 5),
  };
}

function clipJson(value: unknown, maxChars: number): unknown {
  const json = JSON.stringify(value);
  if (json.length <= maxChars) return value;
  return { resumen_recortado: json.slice(0, maxChars) };
}

async function programContextFor(programId: string): Promise<ProgramContext | null> {
  const access = await getActionActor(programId);
  if (!access) return null;
  const supabase = await createClient();
  const { data: program } = await supabase
    .from("programs")
    .select("id, name, description, is_demo, start_date, end_date, setup_step, setup_completed_at, scoring_config")
    .eq("id", programId)
    .maybeSingle();
  if (!program) return null;
  return {
    user: access.user,
    program: { ...program, scoring_config: parseScoringConfig(program.scoring_config) } as ProgramSummary,
    role: access.actor.role,
    actor: access.actor,
  };
}

// ---------------------------------------------------------------------------
// Guardar

async function commit(state: CopilotState, loaded: Loaded, spend: CopilotSpend[]): Promise<CopilotReply> {
  const result =
    state.mode === "project" ? await commitProject(state, loaded) : state.mode === "pilot" ? await commitPilot(state, loaded) : await commitUpdate(state, loaded);
  if (!result.ok) {
    return {
      state: { ...state, confirming: true },
      out: [{ text: `No pude guardarlo: ${result.error}`, tone: "warn", chips: [{ label: "Cambiar algo", action: { t: "edit" } }, { label: "Cancelar", action: { t: "reset" } }] }],
      spend,
    };
  }
  const done: CopilotState = { ...emptyCopilotState(), last: result.last };
  const chips: Chip[] = [
    { label: "¿Qué opina, Tía?", action: { t: "advice", about: "last" }, primary: true },
    ...startChips(loaded.ctx).slice(0, 3),
  ];
  return { state: done, out: [{ text: result.text, tone: "ok", links: result.links, chips }], spend };
}

type CommitResult = { ok: true; text: string; links: { label: string; href: string }[]; last: CreatedRef } | { ok: false; error: string };

async function commitProject(state: CopilotState, loaded: Loaded): Promise<CommitResult> {
  const p = state.project;
  if (!p.lines?.length || !p.months || !p.startDate) return { ok: false, error: "faltan las líneas, la duración o el arranque." };
  const res = await saveQuickStart({
    name: p.name ?? "",
    lines: p.lines.map((l) => ({ templateKey: l.k, lineName: l.n ?? null })),
    startDate: p.startDate,
    months: p.months,
    useTelcoCalendar: p.calendar ?? true,
  });
  if (!res.ok) return { ok: false, error: res.error };
  const { programId, partialError } = res.data;
  const links = [{ label: "Abrir el proyecto", href: `/programas/${programId}` }];
  let text = "¡Quedó armado el proyecto! Con líneas, métrica norte, árbol de métricas, embudo y calendario. Menos carreta, más crecimiento.";
  if (partialError) text = `Quedó creado, pero con un pendiente: ${partialError}`;
  else if (p.oppText) {
    const problem = await createOpportunity(programId, null, p.oppStage ?? "Adquisición", p.oppText, p.oppImpact ?? "medium");
    if (problem.ok) {
      links.push({ label: "Ver la oportunidad de mejora", href: `/programas/${programId}/problemas/${problem.id}` });
      links.push({ label: "Crear el primer ejercicio", href: `/programas/${programId}/ejercicios/nuevo?problema=${problem.id}` });
      text += " Y le dejé registrada la oportunidad de mejora, lista para sacarle ejercicios.";
    } else text += ` La oportunidad de mejora no se pudo guardar (${problem.error}); regístrela desde el proyecto.`;
  }
  void loaded;
  return { ok: true, text, links, last: { kind: "program", id: programId, label: p.name || "el proyecto nuevo", href: `/programas/${programId}`, programId } };
}

async function createOpportunity(programId: string, lineId: string | null, stageName: string, text: string, impact: "high" | "medium" | "low") {
  const [lines, stages] = await Promise.all([listLines(programId), listStages({ programId })]);
  const line = lineId ?? lines[0]?.id;
  const stage = stages.find((s) => s.line_id === line && s.name === stageName) ?? stages.find((s) => s.line_id === line);
  if (!stage) return { ok: false as const, error: "el programa no tiene etapas de embudo" };
  const res = await createProblem(programId, {
    stage_id: stage.id,
    title: firstSentence(text),
    evidence: text,
    impact,
    control: "ours",
    status: "to_validate",
  });
  return res.ok ? { ok: true as const, id: res.data.id } : { ok: false as const, error: res.error };
}

async function commitPilot(state: CopilotState, loaded: Loaded): Promise<CommitResult> {
  const p = state.pilot;
  if (!p.problem || !p.title) return { ok: false, error: "falta la oportunidad de mejora o el nombre." };
  const res = await createPilot({
    title: p.title,
    problem: p.problem,
    problem_evidence: p.evidence ?? null,
    hypothesis_change: p.change ?? null,
    hypothesis_scope: p.channels?.length ? p.channels.join(", ") : null,
    hypothesis_metric: p.metric ?? null,
    hypothesis_expected_pct: p.expectedPct ?? null,
    hypothesis_reason: null,
  });
  if (!res.ok) return { ok: false, error: res.error };
  const id = res.data.id;
  let text = "¡Listo el piloto, en borrador! Revíselo, complete lo que falte y mándelo a revisión cuando quiera.";
  const hasDesign = p.testType || p.plannedStart || p.budgetCop != null || p.channels?.length;
  if (hasDesign) {
    const catalogs = await loadPilotCatalogs().catch(() => null);
    const media = (p.channels ?? [])
      .map((ch) => catalogs?.media.find((m) => !m.archived_at && normalizeText(m.name) === normalizeText(ch)) ?? catalogs?.media.find((m) => !m.archived_at && normalizeText(m.name).includes(normalizeText(ch))))
      .filter((m): m is NonNullable<typeof m> => !!m);
    const design = await savePilotDesign(id, {
      variable_id: null,
      test_type: p.testType ?? null,
      design_justification: p.testType ? `Sugerido con La Tía: ${recommendTestType(p).type === p.testType ? recommendTestType(p).why : "elegido por la persona"}.` : null,
      design_config: { holdout_pct: p.testType === "holdout" ? 10 : null, pre_start: null, granularity: "day", notes: null },
      planned_start: p.plannedStart ?? null,
      planned_end: p.plannedEnd ?? null,
      planned_budget_cop: p.budgetCop ?? null,
      arms: p.testType ? armsFor(p.testType).map((a) => ({ ...a, id: null, description: null })) : [],
      media: [...new Map(media.map((m) => [m.id, m])).values()].map((m) => ({ id: null, media_id: m.id, account: null, campaign: null, audience: null, destination: null, cities: [] })),
      expected_updated_at: null,
    });
    if (!design.ok) text += ` El diseño (fechas, grupos y medios) no se pudo guardar: ${design.error} Complételo en el paso 2.`;
    else if ((p.channels?.length ?? 0) > media.length) text += " Algunos medios no están en el catálogo; agréguelos en el paso 2.";
  }
  void loaded;
  return {
    ok: true,
    text,
    links: [
      { label: "Seguir con el diseño", href: `/pilotos/${id}/editar` },
      { label: "Ver el piloto", href: `/pilotos/${id}` },
    ],
    last: { kind: "pilot", id, label: p.title, href: `/pilotos/${id}` },
  };
}

async function commitUpdate(state: CopilotState, loaded: Loaded): Promise<CommitResult> {
  const u = state.update;
  const target = u.target ? validTarget(u.target, loaded.ctx) : undefined;
  if (!u.kind || !target) return { ok: false, error: "no sé a qué corresponde el avance." };
  const programId = target.kind === "program" ? target.id : target.programId ?? null;
  switch (u.kind) {
    case "opportunity": {
      if (!programId || !u.text || !u.impact) return { ok: false, error: "falta el detalle o el impacto." };
      const res = await createOpportunity(programId, u.lineId ?? null, u.stage ?? "Adquisición", u.text, u.impact);
      if (!res.ok) return { ok: false, error: res.error };
      return {
        ok: true,
        text: "¡Anotada la oportunidad de mejora! Queda «por validar» hasta que el equipo la revise.",
        links: [
          { label: "Verla", href: `/programas/${programId}/problemas/${res.id}` },
          { label: "Crear un ejercicio desde aquí", href: `/programas/${programId}/ejercicios/nuevo?problema=${res.id}` },
        ],
        last: { kind: "problem", id: res.id, label: firstSentence(u.text), href: `/programas/${programId}/problemas/${res.id}`, programId },
      };
    }
    case "experiment_note": {
      if (!programId || !u.text) return { ok: false, error: "falta la novedad." };
      const res = await addComment(programId, target.id, { body: u.text });
      if (!res.ok) return { ok: false, error: res.error };
      return experimentDone(target, programId, "Anotado en la conversación del ejercicio. El equipo lo ve ahí.");
    }
    case "experiment_move": {
      if (!programId || !u.to) return { ok: false, error: "falta a qué estado lo paso." };
      const res = await transitionExperiment({ experimentId: target.id, programId, to: u.to });
      if (!res.ok) return { ok: false, error: `${res.error} Ábralo y complete lo que pide.` };
      const tip =
        u.to === "in_test"
          ? " Quedó bloqueado el diseño. Cargue resultados cuando corra la duración mínima."
          : u.to === "in_reading"
            ? " Ahora cargue los resultados de cada variante y me pregunta qué opino."
            : "";
      return experimentDone(target, programId, `¡Movido! Ya está en su nuevo estado.${tip}`);
    }
    case "metric_value": {
      if (!programId || u.value == null || !u.week) return { ok: false, error: "falta el valor o la semana." };
      const res = await saveWeeklyValues(programId, { week_start: u.week, rows: [{ metric_id: target.id, value: u.value, note: null }] });
      if (!res.ok) return { ok: false, error: res.error };
      return {
        ok: true,
        text: `Anotado: ${target.label} = ${u.value.toLocaleString("es-CO")} la semana del ${u.week}.`,
        links: [{ label: "Ver la carga semanal", href: `/programas/${programId}/carga?semana=${u.week}` }],
        last: { kind: "program", id: programId, label: "el programa", href: `/programas/${programId}`, programId },
      };
    }
    case "pilot_incident": {
      if (!u.text || !u.date || !u.impact) return { ok: false, error: "falta qué pasó, la fecha o el impacto." };
      const res = await logIncident(target.id, { occurred_on: u.date, description: u.text, expected_impact: u.impact });
      if (!res.ok) return { ok: false, error: res.error };
      return pilotDone(target, "Anotado el incidente. Se tiene en cuenta al leer el piloto.");
    }
    case "pilot_start": {
      if (!u.date) return { ok: false, error: "falta la fecha." };
      const res = await startPilot(target.id, u.date);
      if (!res.ok) return { ok: false, error: res.error };
      return pilotDone(target, "¡Arrancó! Cargue datos al menos cada semana y, si algo raro pasa, me cuenta y lo anoto como incidente.");
    }
    case "pilot_reading": {
      if (!u.date) return { ok: false, error: "falta la fecha." };
      const res = await moveToReading(target.id, u.date);
      if (!res.ok) return { ok: false, error: res.error };
      return pilotDone(target, "Pasó a lectura. Cuando tenga los datos completos, pídame la lectura y le cuento qué dicen los números.");
    }
  }
}

function experimentDone(target: UpdateTarget, programId: string, text: string): CommitResult {
  const href = `/programas/${programId}/ejercicios/${target.id}`;
  return { ok: true, text, links: [{ label: "Abrir el ejercicio", href }], last: { kind: "experiment", id: target.id, label: target.label, href, programId } };
}

function pilotDone(target: UpdateTarget, text: string): CommitResult {
  const href = `/pilotos/${target.id}`;
  return { ok: true, text, links: [{ label: "Abrir el piloto", href }], last: { kind: "pilot", id: target.id, label: target.label, href } };
}
