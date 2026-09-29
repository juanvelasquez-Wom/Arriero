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
  OFF_TOPIC_TEXT,
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
import {
  adviceSystem,
  brainstormSystem,
  buildExtractInput,
  EXTRACT_PREFILL,
  extractSystem,
  needsRefs,
  OFF_TOPIC_MARK,
  parseBrainstorm,
  parseExtraction,
} from "@/domain/tia-copilot-prompt";
import { SOURCE_LABEL } from "@/domain/insights";
import { costUsd, usdCop } from "@/domain/tia-cost";
import type { PilotRole, PilotStatus } from "@/domain/pilots/types";
import { createClient } from "@/lib/supabase/server";
import { addComment } from "@/server/actions/comments";
import { transitionExperiment } from "@/server/actions/experiments";
import { saveWeeklyValues } from "@/server/actions/metric-values";
import { createPilot, logIncident, moveToReading, savePilotDesign, startPilot } from "@/server/actions/pilots";
import { addIdea, createIdeaSession } from "@/server/actions/ideas";
import { createInsight } from "@/server/actions/insights";
import { createProblem } from "@/server/actions/problems";
import { saveQuickStart } from "@/server/actions/setup";
import { getActionActor, getSessionUser, type ProgramContext, type ProgramSummary, type SessionUser } from "@/server/auth";
import { analyzePilotDetail } from "@/server/pilot-reading";
import { getIdeaSession, listIdeaSessions } from "@/server/queries/ideas";
import { listInsights } from "@/server/queries/insights";
import { listPilots, loadPilotCatalogs, loadPilotDetail } from "@/server/queries/pilots";
import { listLines, listMyPrograms } from "@/server/queries/programs";
import { listStages } from "@/server/queries/structure";
import { askTia, supportsTemperature, TiaError, tiaConfigured, tiaFastModel, tiaModel, type TiaUsage } from "./client";
import { programContextForTia } from "./context";
import { ensureTiaAvailable, recordTiaUsage } from "./run";
import { pilotSummary, programsSummary } from "./summary";

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
  sessionId: string | null;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** De qué habla la pantalla donde está la persona (sin confiar en ella: RLS decide qué se lee). */
export function scopeFromPath(path: string): Scope {
  const program = path.match(new RegExp(`^/programas/(${UUID})`, "i"))?.[1] ?? null;
  const experiment = path.match(new RegExp(`/ejercicios/(${UUID})`, "i"))?.[1] ?? null;
  const pilot = path.match(new RegExp(`^/pilotos/(${UUID})`, "i"))?.[1] ?? null;
  const session = path.match(new RegExp(`^/ideas/(${UUID})`, "i"))?.[1] ?? null;
  return { programId: program, pilotId: pilot, experimentId: experiment, sessionId: session };
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
  const [pilotRole, programs, pilots, catalogs, experimentsRes, metricsRes, sessions] = await Promise.all([
    pilotRoleOf(user),
    needRefs ? listMyPrograms(user.id).catch(() => []) : Promise.resolve([]),
    needRefs ? listPilots().catch(() => []) : Promise.resolve([]),
    needChannels ? loadPilotCatalogs().catch(() => null) : Promise.resolve(null),
    needRefs ? experimentsQuery : none,
    needRefs ? metricsQuery : none,
    needRefs ? listIdeaSessions(user.id).then((d) => d.items).catch(() => []) : Promise.resolve([]),
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
    ...sessions
      .filter((s) => s.phase === "open")
      .slice(0, 10)
      .map((s) => ({ ref: refFor("session", s.id), kind: "session" as const, id: s.id, label: s.title, status: s.phase })),
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
  return (
    r.id === scope.programId ||
    r.id === scope.pilotId ||
    r.id === scope.experimentId ||
    r.id === scope.sessionId ||
    (!!scope.programId && r.programId === scope.programId)
  );
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
  const hello = `¡Quiubo, ${firstName(user.name)}! Soy La Tía. Dígame qué quiere hacer y yo le voy pidiendo lo que falta: armo proyectos, pilotos, insights y aguaceros, anoto avances, le hago el resumen ejecutivo y le doy mi opinión. Solo de Arriero, eso sí.`;
  const chips = startChips(loaded.ctx);
  // En un aguacero, lo primero que se ofrece es que llueva.
  if (loaded.scope.sessionId) chips.unshift({ label: "Proponga ideas para este aguacero", action: { t: "brainstorm", sessionId: loaded.scope.sessionId }, primary: true });
  const out: TiaOut[] = [{ text: hello, chips }];
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
  const hasSubject = !!subjectFromScope(loaded.scope, state);
  const route = routeMessage(state, message, loaded.ctx, glossaryAnswer, hasSubject);
  switch (route.t) {
    case "summary":
      return summarize(state, route.period, loaded, spend);
    case "insights":
      return searchInsights(state, route.query, loaded, spend);
    case "brainstorm":
      return brainstorm(state, loaded, spend);
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
  if (x.mode === "off") return offTopic(state, loaded, spend);
  if (x.mode === "summary") return summarize(state, /\bmes\b|mensual/i.test(message) ? "mes" : "semana", loaded, spend);
  if (x.mode === "advice") return advise(x.question ?? message, state, loaded, spend);

  let next = state;
  if (x.mode && x.mode !== state.mode) {
    next = { ...state, mode: x.mode, asked: null, confirming: false, skipped: [] };
    if (x.mode === "update") next.update = {};
  }
  if (!next.mode) {
    return { state: next, out: [{ text: "No le entendí bien qué quiere hacer. ¿Me ayuda escogiendo una opción?", chips: startChips(loaded.ctx) }], spend };
  }
  // Con el mensaje: se descarta lo que el modelo completó sin que la persona lo dijera.
  let { state: patched, applied } = applyPatch(next, x.patch, loaded.ctx, message);
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
    case "summary":
      return summarize(state, chip.period ?? "semana", loaded, spend);
    case "brainstorm":
      return brainstorm(state, loaded, spend, chip.sessionId);
    case "addIdea": {
      const session = loaded.ctx.refs.find((r) => r.kind === "session" && r.id === chip.sessionId) ?? (chip.sessionId === loaded.scope.sessionId ? { id: chip.sessionId } : null);
      const text = typeof chip.text === "string" ? chip.text.trim().slice(0, 200) : "";
      if (!session || text.length < 3) return { state, out: [{ text: "Esa idea ya no la puedo anotar. Escríbamela, porfa.", tone: "warn" }], spend };
      const res = await addIdea(session.id, { title: text, anonymous: false });
      if (!res.ok) return { state, out: [{ text: `No pude anotarla: ${res.error}`, tone: "warn" }], spend };
      return {
        state,
        out: [{ text: `Anotada: «${text}». Llueve sobre mojado, pero llueve.`, tone: "ok", links: [{ label: "Ver el aguacero", href: `/ideas/${session.id}` }] }],
        spend,
      };
    }
  }
}

function offTopic(state: CopilotState, loaded: Loaded, spend: CopilotSpend[]): CopilotReply {
  return { state: { ...state, asked: state.asked === ADVICE_FIELD ? null : state.asked }, out: [{ text: OFF_TOPIC_TEXT, chips: startChips(loaded.ctx) }], spend };
}

// ---------------------------------------------------------------------------
// Sin Claude: resúmenes ejecutivos y búsqueda de insights

async function summarize(state: CopilotState, period: "semana" | "mes", loaded: Loaded, spend: CopilotSpend[]): Promise<CopilotReply> {
  const subject = subjectFromScope(loaded.scope, state);
  const result =
    subject?.kind === "pilot"
      ? await pilotSummary(subject.id).catch(() => null)
      : await programsSummary({ programId: subject?.programId ?? (subject?.kind === "program" ? subject.id : null), period }).catch(() => null);
  const chips: Chip[] = [
    { label: period === "semana" ? "El del mes" : "El de la semana", action: { t: "summary", period: period === "semana" ? "mes" : "semana" } },
    { label: "¿Qué opina, Tía?", action: { t: "advice", about: "last" } },
  ];
  if (!result) return { state, out: [{ text: "Todavía no hay programas con datos para resumir. Cargue la semana y vuelva, que la mula no inventa.", chips: startChips(loaded.ctx) }], spend };
  const note = "\n\nHecho con los números de Arriero, sin inventar nada (y sin gastar un peso en IA).";
  const last = subject ?? state.last;
  return { state: { ...state, last }, out: [{ text: result.text + note, links: result.links, chips: last ? chips : chips.slice(0, 1) }], spend };
}

async function searchInsights(state: CopilotState, query: string, loaded: Loaded, spend: CopilotSpend[]): Promise<CopilotReply> {
  const data = await listInsights(loaded.user.id).catch(() => null);
  const words = normalizeText(query)
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  const hits = (data?.items ?? [])
    .filter((i) => i.status !== "archived")
    .map((i) => {
      const hay = normalizeText(`${i.title} ${i.detail ?? ""} ${i.tags.join(" ")} ${i.line_hint ?? ""} ${i.channel ?? ""}`);
      return { i, score: words.filter((w) => hay.includes(w)).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.i.votes - a.i.votes)
    .slice(0, 5);
  if (!hits.length)
    return { state, out: [{ text: `No encontré insights sobre «${query}» en el carriel. ¿Lo anotamos usted y yo?`, chips: [{ label: "Anotar un insight", action: { t: "mode", mode: "insight" } }] }], spend };
  const text = [`Esto hay en el carriel sobre «${query}»:`, ...hits.map(({ i }) => `- **${i.title}** · ${SOURCE_LABEL[i.source]}${i.votes ? ` · ${i.votes} ${i.votes === 1 ? "voto" : "votos"}` : ""}`)].join("\n");
  return { state, out: [{ text, links: hits.slice(0, 3).map(({ i }) => ({ label: clip(i.title, 40) ?? "Ver", href: `/insights/${i.id}` })) }], spend };
}

/** Lluvia de ideas: Sonnet propone 5 ideas (sin cifras) y cada una se anota con un botón. */
async function brainstorm(state: CopilotState, loaded: Loaded, spend: CopilotSpend[], sessionId?: string): Promise<CopilotReply> {
  const id = sessionId ?? loaded.scope.sessionId ?? (state.last?.kind === "session" ? state.last.id : null);
  if (!id) {
    const open = loaded.ctx.refs.filter((r) => r.kind === "session").slice(0, 5);
    return {
      state,
      out: [
        {
          text: open.length ? "¿Para qué aguacero le propongo ideas?" : "No hay aguaceros abiertos. ¿Armamos uno?",
          chips: open.length ? open.map((r) => ({ label: r.label, action: { t: "brainstorm", sessionId: r.id } })) : [{ label: "Armar una lluvia de ideas", action: { t: "mode", mode: "session" } }],
        },
      ],
      spend,
    };
  }
  const detail = await getIdeaSession(id, loaded.user.id).catch(() => null);
  if (!detail) return { state, out: [{ text: "No encontré ese aguacero o no lo puede ver.", tone: "warn" }], spend };
  if (detail.session.phase !== "open") return { state, out: [{ text: "Ese aguacero ya no recibe ideas: está en votación o cerrado." }], spend };
  const res = await callTia(
    {
      feature: "copilot_ideas",
      programId: null,
      model: tiaModel(),
      system: brainstormSystem({ reto: detail.session.title, contexto: clip(detail.session.context, 400), ya_anotadas: detail.ideas.slice(0, 30).map((i) => clip(i.title, 80) ?? "") }),
      message: "Hágale pues.",
      maxTokens: 300,
    },
    spend,
  );
  if (!res.ok) return { state, out: [{ text: res.error, tone: "warn" }], spend };
  const ideas = parseBrainstorm(res.text);
  if (!ideas.length) return { state, out: [{ text: "Se me secó el aguacero. Intente de nuevo en un momento." }], spend };
  return {
    state: { ...state, last: { kind: "session", id, label: detail.session.title, href: `/ideas/${id}` } },
    out: [
      {
        text: `Para «${detail.session.title}» se me ocurren estas (toque la que quiera anotar; quedan a su nombre):\n${ideas.map((i) => `- ${i}`).join("\n")}`,
        chips: [...ideas.map((i) => ({ label: `Anotar: ${clip(i, 60)}`, action: { t: "addIdea" as const, sessionId: id, text: i } })), { label: "Otras ideas", action: { t: "brainstorm", sessionId: id } }],
      },
    ],
    spend,
  };
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

async function callTia(
  opts: { feature: TiaFeature; programId: string | null; model: string; system: string; message: string; maxTokens: number; cacheSystem?: boolean; temperature?: number; prefill?: string },
  spend: CopilotSpend[],
) {
  const available = await ensureTiaAvailable(opts.programId, opts.feature);
  if (!available.ok) return { ok: false as const, error: available.error };
  try {
    const reply = await askTia({
      model: opts.model,
      system: opts.system,
      cacheSystem: opts.cacheSystem,
      // Respuestas cortas: sin "pensar" por dentro (en Sonnet 5.5 eso gastaba ~330 tokens por respuesta).
      effort: "low",
      // El arranque ("{") solo lo aceptan los modelos anteriores a Claude 5 (Haiku 4.5 sí).
      messages: opts.prefill && supportsTemperature(opts.model)
        ? [{ role: "user", content: opts.message }, { role: "assistant", content: opts.prefill }]
        : [{ role: "user", content: opts.message }],
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });
    await recordTiaUsage(opts.programId, opts.feature, reply.usage);
    spend.push(spendOf(reply.usage));
    if (process.env.NODE_ENV !== "production") {
      const u = reply.usage;
      console.info(`[tia-uso] ${opts.feature} ${u.model} entrada=${u.inputTokens} cache_lee=${u.cacheReadTokens ?? 0} cache_escribe=${u.cacheWriteTokens ?? 0} salida=${u.outputTokens} usd=${costUsd(u).toFixed(5)} max=${opts.maxTokens} fin=${reply.stopReason}`);
    }
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
      // Con un modo activo, solo los campos de ese modo: instrucciones más cortas.
      system: extractSystem(state.mode),
      message: buildExtractInput({ state, message, today: loaded.ctx.today, refs }),
      maxTokens: 300,
      temperature: 0,
      prefill: EXTRACT_PREFILL,
    },
    spend,
  );
  if (!res.ok) return { ok: false as const, error: res.error };
  if (process.env.NODE_ENV !== "production") console.info(`[tia-uso] intérprete devolvió: ${res.text.slice(0, 600)}`);
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
      maxTokens: smart ? 500 : 350,
    },
    spend,
  );
  const chips: Chip[] = [{ label: "Otra pregunta", action: { t: "advice" } }, ...startChips(loaded.ctx).slice(0, 2)];
  if (!res.ok) return { state, out: [{ text: res.error, tone: "warn" }], spend };
  // Segunda barrera: el modelo también rechaza lo que no es de Arriero.
  if (res.text.includes(OFF_TOPIC_MARK)) return offTopic(state, loaded, spend);
  const text = data ? withNumberCheck(res.text, data) : res.text;
  return { state: { ...state, asked: state.mode ? state.asked : null }, out: [{ text: text || "Me quedé sin palabras. Pregúnteme de otra forma.", chips: state.mode ? undefined : chips }], spend };
}

function subjectFromScope(scope: Scope, state: CopilotState): CreatedRef | null {
  if (scope.pilotId) return { kind: "pilot", id: scope.pilotId, label: "este piloto", href: `/pilotos/${scope.pilotId}` };
  if (scope.sessionId) return { kind: "session", id: scope.sessionId, label: "este aguacero", href: `/ideas/${scope.sessionId}` };
  if (scope.programId) return { kind: "program", id: scope.programId, label: "este programa", href: `/programas/${scope.programId}`, programId: scope.programId };
  return state.last;
}

/** Datos compactos para opinar (recortados para gastar pocos tokens). */
async function briefFor(subject: CreatedRef, loaded: Loaded): Promise<unknown> {
  if (subject.kind === "session") {
    const d = await getIdeaSession(subject.id, loaded.user.id);
    if (!d) return null;
    return {
      hoy: loaded.ctx.today,
      aguacero: { reto: d.session.title, contexto: clip(d.session.context, 300), fase: d.session.phase, fecha_limite: d.session.deadline, ideas: d.ideas.length },
      ideas: d.ideas.slice(0, 25).map((i) => ({ idea: clip(i.title, 100), decision: i.decision })),
    };
  }
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
    state.mode === "project"
      ? await commitProject(state, loaded)
      : state.mode === "pilot"
        ? await commitPilot(state, loaded)
        : state.mode === "insight"
          ? await commitInsight(state)
          : state.mode === "session"
            ? await commitSession(state)
            : await commitUpdate(state, loaded);
  if (!result.ok) {
    return {
      state: { ...state, confirming: true },
      out: [{ text: `No pude guardarlo: ${result.error}`, tone: "warn", chips: [{ label: "Cambiar algo", action: { t: "edit" } }, { label: "Cancelar", action: { t: "reset" } }] }],
      spend,
    };
  }
  const done: CopilotState = { ...emptyCopilotState(), last: result.last };
  const first: Chip =
    result.last.kind === "session"
      ? { label: "Proponga ideas, Tía", action: { t: "brainstorm", sessionId: result.last.id }, primary: true }
      : { label: "¿Qué opina, Tía?", action: { t: "advice", about: "last" }, primary: true };
  const chips: Chip[] = [first, ...startChips(loaded.ctx).slice(0, 3)];
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

async function commitInsight(state: CopilotState): Promise<CommitResult> {
  const i = state.insight;
  if (!i.title || !i.source) return { ok: false, error: "falta el insight o de dónde sale." };
  const res = await createInsight({ title: i.title, detail: i.detail ?? undefined, source: i.source, tags: [] });
  if (!res.ok) return { ok: false, error: res.error };
  const href = `/insights/${res.data.id}`;
  return {
    ok: true,
    text: "¡Al carriel! Ya lo ve todo el equipo; si otros lo votan, se calienta. De ahí puede nacer una oportunidad de mejora, un proyecto o un piloto.",
    links: [{ label: "Ver el insight", href }],
    last: { kind: "insight", id: res.data.id, label: i.title, href },
  };
}

async function commitSession(state: CopilotState): Promise<CommitResult> {
  const s = state.session;
  if (!s.title) return { ok: false, error: "falta el reto." };
  const res = await createIdeaSession({ title: s.title, context: s.context ?? null, deadline: s.deadline ?? null });
  if (!res.ok) return { ok: false, error: res.error };
  const href = `/ideas/${res.data.id}`;
  return {
    ok: true,
    text: "¡Armado el aguacero! Ya puede llover: compártalo con el equipo. Si quiere, yo le suelto las primeras ideas.",
    links: [{ label: "Abrir el aguacero", href }],
    last: { kind: "session", id: res.data.id, label: s.title, href },
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
    case "idea": {
      if (!u.text) return { ok: false, error: "falta la idea." };
      const res = await addIdea(target.id, { title: u.text, anonymous: false });
      if (!res.ok) return { ok: false, error: res.error };
      const href = `/ideas/${target.id}`;
      return { ok: true, text: "¡Anotada! Una gota más en el aguacero.", links: [{ label: "Ver el aguacero", href }], last: { kind: "session", id: target.id, label: target.label, href } };
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
