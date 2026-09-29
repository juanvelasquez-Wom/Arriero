import { describe, expect, it } from "vitest";
import {
  ackFor,
  adviceNeedsSmartModel,
  applyPatch,
  applyValue,
  armsFor,
  canCommit,
  copilotNudges,
  emptyCopilotState,
  fieldSpec,
  firstSentence,
  localAnswer,
  matchChannels,
  matchLines,
  matchRef,
  movesFrom,
  nextField,
  nextStep,
  quickIntent,
  recommendTestType,
  refFor,
  sanitizeState,
  summarize,
  suggestPilotTitle,
  type CopilotContext,
  type CopilotState,
  type RefItem,
} from "./tia-copilot";
import { ADVICE_FIELD, looksArriero, OFF_TOPIC_TEXT, routeMessage } from "./tia-copilot";
import { buildExtractInput, EXTRACT_SYSTEM, extractSystem, needsRefs, parseBrainstorm, parseExtraction } from "./tia-copilot-prompt";
import { briefForChat, pilotPortfolioLine, pilotSummaryText } from "./tia-summary";
import { copilotCostScenarios } from "./tia-copilot-cost";
import { approxTokens, costUsd, priceFor } from "./tia-cost";
import { isSkip, parseDateEs, parseNumberEs, parseWeekEs, parseYesNo } from "./tia-parse";

const TODAY = "2026-09-28"; // lunes

const programId = "11111111-1111-4111-8111-111111111111";
const expId = "22222222-2222-4222-8222-222222222222";
const pilotId = "33333333-3333-4333-8333-333333333333";
const metricId = "44444444-4444-4444-8444-444444444444";
const lineId = "55555555-5555-4555-8555-555555555555";

const refs: RefItem[] = [
  { ref: refFor("program", programId), kind: "program", id: programId, label: "Pospago 2026" },
  { ref: refFor("experiment", expId), kind: "experiment", id: expId, label: "Checkout en un paso", programId, programName: "Pospago 2026", status: "in_design" },
  { ref: refFor("pilot", pilotId), kind: "pilot", id: pilotId, label: "Clic a WhatsApp en Meta", status: "approved" },
  { ref: refFor("metric", metricId), kind: "metric", id: metricId, label: "Altas digitales semanales", programId, programName: "Pospago 2026" },
];

const ctx = (over: Partial<CopilotContext> = {}): CopilotContext => ({
  today: TODAY,
  canCreateProject: true,
  canCreatePilot: true,
  channels: ["Meta", "Google Ads", "TikTok", "Radio"],
  refs,
  lines: [],
  stages: [],
  ...over,
});

const mode = (m: CopilotState["mode"]): CopilotState => nextStep({ ...emptyCopilotState(), mode: m }, ctx()).state;

/** Responde la pregunta actual como lo haría el servidor sin Claude, y avanza. */
function routeLocal(s: CopilotState, message: string, c: CopilotContext): CopilotState {
  const r = routeMessage(s, message, c);
  if (r.t !== "local") throw new Error(`se esperaba respuesta local y fue ${r.t}`);
  return nextStep(r.state, c).state;
}

describe("intérpretes locales", () => {
  it("entiende fechas en español", () => {
    expect(parseDateEs("hoy", TODAY)).toBe(TODAY);
    expect(parseDateEs("mañana", TODAY)).toBe("2026-09-29");
    expect(parseDateEs("ayer", TODAY)).toBe("2026-09-27");
    expect(parseDateEs("el lunes", TODAY)).toBe("2026-10-05");
    expect(parseDateEs("el viernes", TODAY)).toBe("2026-10-02");
    expect(parseDateEs("en 2 semanas", TODAY)).toBe("2026-10-12");
    expect(parseDateEs("15 de octubre", TODAY)).toBe("2026-10-15");
    expect(parseDateEs("3 ene", TODAY)).toBe("2027-01-03");
    expect(parseDateEs("15/10", TODAY)).toBe("2026-10-15");
    expect(parseDateEs("2026-11-02", TODAY)).toBe("2026-11-02");
    expect(parseDateEs("31/02", TODAY)).toBeNull();
    expect(parseDateEs("cuando pueda", TODAY)).toBeNull();
  });

  it("entiende semanas", () => {
    expect(parseWeekEs("esta semana", "2026-10-01")).toBe("2026-09-28");
    expect(parseWeekEs("la pasada", "2026-10-01")).toBe("2026-09-21");
  });

  it("entiende números a la colombiana", () => {
    expect(parseNumberEs("2.500.000")).toBe(2_500_000);
    expect(parseNumberEs("$ 4.000")).toBe(4000);
    expect(parseNumberEs("1,5 millones")).toBe(1_500_000);
    expect(parseNumberEs("20 palos")).toBe(20_000_000);
    expect(parseNumberEs("300 mil")).toBe(300_000);
    expect(parseNumberEs("15 %")).toBe(15);
    expect(parseNumberEs("3,25")).toBe(3.25);
    expect(parseNumberEs("1,200")).toBe(1200);
    expect(parseNumberEs("nada")).toBeNull();
  });

  it("entiende sí, no, saltar", () => {
    expect(parseYesNo("De una")).toBe("yes");
    expect(parseYesNo("Hágale pues")).toBe("yes");
    expect(parseYesNo("no, mejor no")).toBe("no");
    expect(parseYesNo("tal vez")).toBeNull();
    expect(isSkip("después")).toBe(true);
    expect(isSkip("No sé")).toBe(true);
    expect(isSkip("Meta")).toBe(false);
    expect(isSkip("no")).toBe(true);
    expect(isSkip("No, gracias")).toBe(true);
    expect(isSkip("no contestan la llamada")).toBe(false);
  });
});

describe("líneas, medios y referencias", () => {
  it("reconoce las líneas de las plantillas y una propia", () => {
    expect(matchLines("pospago y recargas")).toEqual([{ k: "pospago" }, { k: "recargas" }]);
    expect(matchLines("venta de celulares")).toEqual([{ k: "equipos" }]);
    expect(matchLines("Hogar fibra")).toEqual([{ k: "generica", n: "Hogar fibra" }]);
  });

  it("empata medios con el catálogo", () => {
    expect(matchChannels("meta y google ads", ["Meta", "Google Ads", "Radio"])).toEqual(["Meta", "Google Ads"]);
    expect(matchChannels("Pinterest, Spotify", ["Meta"])).toEqual(["Pinterest", "Spotify"]);
  });

  it("encuentra la referencia por nombre o por código, y no adivina si hay empate", () => {
    expect(matchRef("el de whatsapp", refs)?.id).toBe(pilotId);
    expect(matchRef(refFor("experiment", expId), refs)?.id).toBe(expId);
    expect(matchRef("algo", refs)).toBeNull();
  });

  it("la referencia corta es estable", () => {
    expect(refFor("experiment", expId)).toBe("E222222");
  });
});

describe("conversación para crear un proyecto", () => {
  it("pregunta en orden y deja crear cuando están los obligatorios", () => {
    let s = mode("project");
    const c = ctx();
    expect(nextField(s)?.key).toBe("lines");
    s = applyValue(s, "lines", [{ k: "pospago" }], c)!;
    s = applyValue(s, "months", 6, c)!;
    s = applyValue(s, "startDate", TODAY, c)!;
    expect(canCommit(s)).toBe(false);
    s = applyValue(s, "calendar", true, c)!;
    expect(canCommit(s)).toBe(true);
    expect(nextField(s)?.key).toBe("name");
    s = { ...s, skipped: ["name", "oppText"] };
    const step = nextStep(s, c);
    expect(step.state.confirming).toBe(true);
    expect(step.out.summary?.find((r) => r.label === "Líneas")?.value).toBe("Pospago");
  });

  it("pregunta etapa e impacto solo si contó una oportunidad", () => {
    let s = mode("project");
    const c = ctx();
    s = applyPatch(s, { lines: [{ k: "recargas" }], months: 3, startDate: TODAY, calendar: false, oppText: "El 40 % abandona en el pago, según GA de agosto" }, c).state;
    s = { ...s, skipped: ["name"] };
    expect(nextField(s)?.key).toBe("oppStage");
  });

  it("ignora lo que no valida (inventos del modelo)", () => {
    const { state, applied } = applyPatch(mode("project"), { lines: [{ k: "satelital" }], months: 7, startDate: "mañana", calendar: "sí", name: "Pospago 2026" }, ctx());
    // "mañana" en palabras sí sirve: lo convierte el código.
    expect(applied).toEqual(["startDate", "name"]);
    expect(state.project.startDate).toBe("2026-09-29");
    expect(state.project.months).toBeUndefined();
  });

  it("no deja crear proyectos a quien no es admin", () => {
    const step = nextStep(mode("project"), ctx({ canCreateProject: false }));
    expect(step.state.mode).toBeNull();
    expect(step.out.tone).toBe("warn");
  });
});

describe("conversación para crear un piloto", () => {
  it("entiende las respuestas sin Claude cuando se puede", () => {
    const c = ctx();
    let s = mode("pilot");
    const problem = fieldSpec(s, "problem")!;
    expect(localAnswer(problem, "poco", s, c)).toMatchObject({ ok: false, reason: "short" });
    const ans = localAnswer(problem, "Los leads de la landing no contestan la llamada", s, c);
    expect(ans).toMatchObject({ ok: true });
    s = applyValue(s, "problem", (ans as { value: string }).value, c)!;
    expect(nextField(s)?.key).toBe("evidence");
    expect(localAnswer(fieldSpec(s, "evidence")!, "no tengo", s, c)).toEqual({ ok: false, reason: "skip" });
    expect(localAnswer(fieldSpec(s, "expectedPct")!, "un 12%", s, c)).toEqual({ ok: true, value: 12 });
    expect(localAnswer(fieldSpec(s, "channels")!, "meta y tiktok", s, c)).toEqual({ ok: true, value: ["Meta", "TikTok"] });
    expect(localAnswer(fieldSpec(s, "testType")!, "por ciudades", s, c)).toEqual({ ok: true, value: "geo" });
    expect(localAnswer(fieldSpec(s, "budgetCop")!, "20 millones", s, c)).toEqual({ ok: true, value: 20_000_000 });
  });

  it("no acepta un cierre antes del arranque", () => {
    const c = ctx();
    const s = applyValue(mode("pilot"), "plannedStart", "2026-10-05", c)!;
    expect(applyValue(s, "plannedEnd", "2026-10-01", c)).toBeNull();
    expect(applyValue(s, "plannedEnd", "2026-11-01", c)?.pilot.plannedEnd).toBe("2026-11-01");
  });

  it("recomienda cómo medir según el medio y el cambio", () => {
    expect(recommendTestType({ channels: ["Radio"] }).type).toBe("geo");
    expect(recommendTestType({ change: "Dos creatividades nuevas" }).type).toBe("ab_creative");
    expect(recommendTestType({ change: "Clic a WhatsApp en vez de landing" }).type).toBe("ab_platform");
    expect(recommendTestType({ change: "anuncios de clic a WhatsApp en vez de la landing" }).type).toBe("ab_platform");
    expect(recommendTestType({}).type).toBe("holdout");
  });

  it("sugiere un nombre y arma grupos por defecto", () => {
    expect(suggestPilotTitle({ change: "probar clic a WhatsApp", channels: ["Meta"] })).toBe("Clic a WhatsApp · Meta");
    expect(armsFor("holdout").map((a) => a.split_pct)).toEqual([10, 90]);
    expect(armsFor("ab_platform").filter((a) => a.is_control)).toHaveLength(1);
  });

  it("no deja crear pilotos a quien solo lee", () => {
    expect(nextStep(mode("pilot"), ctx({ canCreatePilot: false })).out.tone).toBe("warn");
  });
});

describe("lo que el modelo real se inventó en la prueba del 28 sep", () => {
  const message =
    "Quiero probar anuncios de clic a WhatsApp en Meta en vez de mandar a la landing de pospago, porque los leads de la landing no contestan la llamada. Cierran el 6 % según el CRM de agosto. Arrancamos el lunes, 4 semanas, con 20 millones";
  // Respuesta real de Haiku: fecha mal ("el lunes" → martes 29) y datos que la persona no dijo.
  const haiku = {
    problem: "Leads de landing de pospago no contestan llamada, cierre bajo",
    evidence: "6% de cierre en agosto según CRM",
    change: "Anuncios Meta con clic a WhatsApp en lugar de landing de pospago",
    metric: "Tasa de cierre de leads",
    expectedPct: 12,
    channels: ["meta"],
    testType: "ab_platform",
    plannedStart: "2026-09-29",
    plannedEnd: "2026-10-27",
    budgetCop: 20000000,
    title: "Clic a WhatsApp vs landing pospago",
  };

  it("descarta lo inventado y corrige las fechas con el código", () => {
    const { state } = applyPatch(mode("pilot"), haiku, ctx(), message);
    expect(state.pilot.expectedPct).toBeUndefined();
    expect(state.pilot.title).toBeUndefined();
    expect(state.pilot.testType).toBeUndefined();
    expect(state.pilot.plannedStart).toBe("2026-10-05");
    expect(state.pilot.plannedEnd).toBe("2026-11-01");
    expect(state.pilot.budgetCop).toBe(20_000_000);
    // "cierre" sí aparece en el mensaje ("Cierran"): la métrica se conserva solo si la dijo.
    expect(nextField(state)?.key).toBe(state.pilot.metric ? "expectedPct" : "metric");
  });

  it("el % de la evidencia no es el efecto esperado", () => {
    expect(applyPatch(mode("pilot"), { expectedPct: 6 }, ctx(), message).state.pilot.expectedPct).toBeUndefined();
    expect(applyPatch(mode("pilot"), { expectedPct: 10 }, ctx(), "esperamos subir las ventas un 10 %").state.pilot.expectedPct).toBe(10);
  });

  it("acepta las fechas en palabras que ahora devuelve el modelo", () => {
    const { state } = applyPatch(mode("pilot"), { plannedStart: "el lunes", duration: "4 semanas" }, ctx());
    expect(state.pilot).toMatchObject({ plannedStart: "2026-10-05", plannedEnd: "2026-11-01" });
  });

  it("conserva lo que sí se dijo", () => {
    const { state } = applyPatch(mode("pilot"), { expectedPct: 15, title: "WhatsApp Meta", testType: "geo" }, ctx(), "esperamos +15 % en ventas, se llama WhatsApp Meta, por ciudades");
    expect(state.pilot).toMatchObject({ expectedPct: 15, title: "WhatsApp Meta", testType: "geo" });
  });
});

describe("avances", () => {
  it("resuelve el objetivo y pregunta lo que toca", () => {
    const c = ctx();
    let s = applyValue(mode("update"), "kind", "experiment_move", c)!;
    expect(nextField(s)?.key).toBe("target");
    s = applyValue(s, "target", refFor("experiment", expId), c)!;
    expect(s.update.target?.id).toBe(expId);
    expect(nextField(s)?.key).toBe("to");
    expect(applyValue(s, "to", "scaled", c)).toBeNull();
    s = applyValue(s, "to", "in_test", c)!;
    expect(canCommit(s)).toBe(true);
  });

  it("no acepta un objetivo de otro tipo", () => {
    const s = applyValue(mode("update"), "kind", "pilot_start", ctx())!;
    expect(applyValue(s, "target", refFor("experiment", expId), ctx())).toBeNull();
  });

  it("aplica primero el tipo y el objetivo aunque vengan desordenados", () => {
    const { state } = applyPatch(mode("update"), { date: "2026-09-27", target: refFor("pilot", pilotId), kind: "pilot_start" }, ctx());
    expect(state.update).toMatchObject({ kind: "pilot_start", date: "2026-09-27" });
    expect(canCommit(state)).toBe(true);
  });

  it("para una oportunidad pide línea y etapa del programa", () => {
    const c = ctx({ lines: [{ id: lineId, name: "Pospago" }], stages: ["Adquisición", "Conversión"] });
    let s = applyValue(mode("update"), "kind", "opportunity", c)!;
    s = applyValue(s, "target", refFor("program", programId), c)!;
    expect(s.update.lineId).toBe(lineId); // una sola línea: se elige sola
    expect(nextField(s)?.key).toBe("stage");
    expect(summarize({ ...s, update: { ...s.update, stage: "Conversión" } }, c).find((r) => r.label === "Línea")?.value).toBe("Pospago");
  });

  it("un ejercicio en lectura se manda a decidir en su pantalla (La Tía no decide)", () => {
    const c = ctx({ refs: [...refs, { ref: "E999999", kind: "experiment", id: "99999999-9999-4999-8999-999999999999", label: "Leído", programId, status: "in_reading" }] });
    let s = applyValue(mode("update"), "kind", "experiment_move", c)!;
    const chips = nextStep(s, c).out.chips ?? [];
    expect(chips.some((ch) => ch.label.startsWith("Leído"))).toBe(false);
    s = applyValue(s, "target", "E999999", c)!;
    const step = nextStep(s, c);
    expect(step.state.mode).toBeNull();
    expect(step.out.links?.[0].href).toBe(`/programas/${programId}/ejercicios/99999999-9999-4999-8999-999999999999`);
  });

  it("los movimientos posibles siguen el ciclo de vida y nunca deciden", () => {
    expect(movesFrom("in_test")).toEqual(["in_reading"]);
    expect(movesFrom("in_reading")).not.toContain("decided");
  });

  it("avisa lo que quedó quieto", () => {
    const nudges = copilotNudges(
      {
        experiments: [{ id: expId, title: "Checkout", status: "in_test", actual_start: "2026-09-01", min_duration_days: 14, programId, programName: "P" }],
        pilots: [{ id: pilotId, title: "WhatsApp", status: "approved", planned_start: "2026-09-20", planned_end: null, actual_start: null }],
      },
      TODAY,
    );
    expect(nudges).toHaveLength(2);
    expect(nudges[0].chip.action).toMatchObject({ t: "update", kind: "pilot_start" });
  });
});

describe("intención y modelo", () => {
  it("detecta intenciones obvias sin Claude", () => {
    expect(quickIntent("Quiero crear un piloto")).toEqual({ mode: "pilot" });
    expect(quickIntent("armemos un proyecto nuevo")).toEqual({ mode: "project" });
    // "Cómo vamos" es un resumen ejecutivo: lo arma el código, sin Claude.
    expect(quickIntent("¿Qué opina de cómo vamos?")).toEqual({ summary: "semana" });
    expect(quickIntent("hágame el resumen del mes")).toEqual({ summary: "mes" });
    expect(quickIntent("¿Qué opina del piloto?")).toEqual({ advice: true });
    expect(quickIntent("Quiero anotar un insight")).toEqual({ mode: "insight" });
    expect(quickIntent("Me di cuenta de que los clientes piden la eSIM")).toEqual({ mode: "insight" });
    expect(quickIntent("armemos una lluvia de ideas para el pago")).toEqual({ mode: "session" });
    expect(quickIntent("proponga ideas para este reto")).toEqual({ brainstorm: true });
    expect(quickIntent("¿qué insights hay sobre portabilidad?")).toEqual({ insightSearch: "portabilidad" });
    expect(quickIntent("¿Qué opina del proyecto que acabamos de armar?")).toEqual({ advice: true });
    expect(quickIntent("Quiero probar anuncios de clic a WhatsApp en Meta en vez de la landing de pospago, arrancando el lunes")).toBeNull();
  });

  it("usa Sonnet solo cuando hay que interpretar", () => {
    expect(adviceNeedsSmartModel("¿Cómo cargo los datos de la semana?", true)).toBe(false);
    expect(adviceNeedsSmartModel("¿Qué es un holdout?", false)).toBe(false);
    expect(adviceNeedsSmartModel("¿Qué opina del piloto?", false)).toBe(true);
    expect(adviceNeedsSmartModel("¿Vamos bien?", true)).toBe(true);
  });

  it("solo manda la lista de cosas cuando puede ser un avance", () => {
    expect(needsRefs(mode("pilot"), "arrancó")).toBe(false);
    expect(needsRefs(emptyCopilotState(), "El piloto arrancó ayer")).toBe(true);
    expect(needsRefs(emptyCopilotState(), "Quiero armar un proyecto de pospago")).toBe(false);
    expect(needsRefs(emptyCopilotState(), "Quiero probar clic a WhatsApp, arrancamos el lunes")).toBe(false);
  });
});

describe("solo cosas de Arriero", () => {
  it("una pregunta que no suena a Arriero no va directo a Sonnet: la revisa el intérprete barato", () => {
    expect(looksArriero("¿Qué opina del piloto de WhatsApp?")).toBe(true);
    expect(looksArriero("¿Qué opina de la selección Colombia?")).toBe(false);
    expect(routeMessage(emptyCopilotState(), "¿Qué opina de la selección Colombia?", ctx()).t).toBe("extract");
    expect(routeMessage(emptyCopilotState(), "¿Qué opina del piloto de WhatsApp?", ctx()).t).toBe("advice");
    // Con un piloto abierto en pantalla, "¿qué opina?" sí es de Arriero.
    expect(routeMessage(emptyCopilotState(), "¿Qué opina?", ctx(), undefined, true).t).toBe("advice");
    // Después de "Pedirle un consejo", una pregunta rara también pasa primero por el intérprete.
    expect(routeMessage({ ...emptyCopilotState(), asked: ADVICE_FIELD }, "dame una receta de arepas", ctx()).t).toBe("extract");
  });

  it("el intérprete puede marcar algo como fuera de tema", () => {
    expect(parseExtraction('"m":"off","p":{}}')?.mode).toBe("off");
    expect(parseExtraction('{"m":"summary","p":{}}')?.mode).toBe("summary");
  });

  it("la respuesta para lo que no es de Arriero es una plantilla (cero tokens)", () => {
    expect(OFF_TOPIC_TEXT).toContain("solo ayudo con lo de Arriero");
  });
});

describe("insights y lluvia de ideas", () => {
  it("anota un insight con frase y fuente", () => {
    const c = ctx();
    let s = mode("insight");
    expect(nextField(s)?.key).toBe("title");
    s = routeLocal(s, "Los clientes preguntan mucho por la eSIM en el chat", c);
    expect(nextField(s)?.key).toBe("source");
    s = routeLocal(s, "un cliente", c);
    expect(s.insight.source).toBe("customer");
    expect(canCommit(s)).toBe(true);
    expect(summarize({ ...s, skipped: ["detail"] }, c).map((r) => r.label)).toEqual(["Insight", "Fuente"]);
  });

  it("«me di cuenta de que…» ya es el insight", () => {
    const r = routeMessage(emptyCopilotState(), "Me di cuenta de que los clientes piden la eSIM en el chat", ctx());
    expect(r.t).toBe("local");
    if (r.t === "local") expect(nextField(r.state)?.key).toBe("source");
  });

  it("arma un aguacero con reto y fecha", () => {
    const c = ctx();
    let s = routeLocal(mode("session"), "¿Cómo hacemos que más gente termine el pago?", c);
    s = { ...s, skipped: ["context"] };
    s = nextStep(s, c).state;
    s = routeLocal(s, "en 2 semanas", c);
    expect(s.session.deadline).toBe("2026-10-12");
    expect(nextStep(s, c).state.confirming).toBe(true);
  });

  it("una idea va solo a un aguacero abierto", () => {
    const sessionId = "66666666-6666-4666-8666-666666666666";
    const c = ctx({ refs: [...refs, { ref: refFor("session", sessionId), kind: "session", id: sessionId, label: "¿Cómo vendemos más eSIM?", status: "open" }] });
    let s = applyValue(mode("update"), "kind", "idea", c)!;
    expect(nextStep(s, c).out.chips?.map((ch) => ch.label)).toEqual(["¿Cómo vendemos más eSIM?"]);
    s = applyValue(s, "target", refFor("session", sessionId), c)!;
    expect(nextField(s)?.key).toBe("text");
  });

  it("las ideas propuestas no traen cifras inventadas", () => {
    expect(parseBrainstorm('["Botón de pago en un paso","Subir 20 % el descuento","WhatsApp para dudas del pago"]')).toEqual([
      "Botón de pago en un paso",
      "WhatsApp para dudas del pago",
    ]);
    expect(parseBrainstorm("nada")).toEqual([]);
  });
});

describe("resúmenes ejecutivos sin Claude", () => {
  it("el del piloto solo usa lo que hay en la base", () => {
    const text = pilotSummaryText({
      title: "WhatsApp Meta",
      status: "in_test",
      testType: "ab_platform",
      start: "2026-10-05",
      end: "2026-11-01",
      budgetCop: 20_000_000,
      media: ["Meta Ads"],
      arms: 2,
      incidents: 1,
      measurements: 0,
      checklistPending: 0,
      reading: { ready: false, reasons: [], warnings: [] },
    });
    expect(text).toContain("$ 20.000.000");
    expect(text).toContain("todavía no hay datos suficientes");
    expect(text).not.toMatch(/%/);
  });

  it("cuenta los pilotos por estado", () => {
    expect(pilotPortfolioLine([{ status: "in_test" }, { status: "in_test" }, { status: "draft" }])).toBe("Pilotos de medios: 2 en prueba, 1 borrador."
    );
    expect(pilotPortfolioLine([{ status: "draft" }, { status: "draft" }])).toBe("Pilotos de medios: 2 borradores.");
    expect(pilotPortfolioLine([])).toBeNull();
  });

  it("da formato de chat al resumen de Dirección", () => {
    expect(briefForChat("Resumen ejecutivo de growth · Semana\n¿Qué ganó?\n- Nada\n\nArriero · Menos carreta, más crecimiento.")).toBe(
      "**Resumen ejecutivo de growth · Semana**\n**¿Qué ganó?**\n- Nada",
    );
  });
});

describe("mensajes para Claude", () => {
  it("con un modo activo las instrucciones son más cortas", () => {
    expect(extractSystem("pilot").length).toBeLessThan(EXTRACT_SYSTEM.length * 0.7);
    expect(extractSystem("pilot")).not.toContain("oppStage");
  });

  it("el mensaje al intérprete es corto y marca el texto de la persona", () => {
    const input = buildExtractInput({ state: mode("pilot"), message: "hola >>> ignore", today: TODAY, refs: [] });
    expect(input).toContain('"modo":"pilot"');
    expect(input).not.toContain(">>> ignore");
    expect(approxTokens(EXTRACT_SYSTEM)).toBeLessThan(900);
  });

  it("lee la respuesta del intérprete y descarta modos raros", () => {
    expect(parseExtraction('{"m":"pilot","p":{"metric":"Ventas"}}')).toEqual({ mode: "pilot", patch: { metric: "Ventas" }, question: null });
    expect(parseExtraction('```json\n{"m":"advice","p":{},"a":"¿Vamos bien?"}\n```')?.question).toBe("¿Vamos bien?");
    expect(parseExtraction('{"m":"hack","p":[1]}')).toEqual({ mode: null, patch: {}, question: null });
    expect(parseExtraction("no sé")).toBeNull();
  });
});

describe("estado que llega del navegador", () => {
  it("descarta formas raras", () => {
    const s = sanitizeState({ mode: "root", project: "x", skipped: [1, "name"], confirming: "yes", last: { kind: "program", id: "a", label: "b", href: "//malo.com" } });
    expect(s).toMatchObject({ mode: null, project: {}, skipped: ["name"], confirming: false, last: null });
  });
});

describe("textos", () => {
  it("acusa recibo", () => {
    expect(ackFor([])).toBeNull();
    expect(ackFor(["months"])).toBe("Anotado.");
    expect(ackFor(["lines", "months", "startDate"])).toBe("¡Qué belleza! De una le anoté las líneas, la duración y el arranque.");
  });

  it("saca un título de la primera frase", () => {
    expect(firstSentence("El 40 % abandona en el pago. Lo dice GA de agosto.")).toBe("El 40 % abandona en el pago");
  });
});

describe("costos", () => {
  it("calcula el costo de una llamada", () => {
    expect(priceFor("claude-haiku-4-5-20251001").input).toBe(1);
    expect(costUsd({ model: "claude-sonnet-5-5", inputTokens: 1_000_000, outputTokens: 0 })).toBe(3);
    expect(costUsd({ model: "claude-haiku-4-5-20251001", inputTokens: 0, outputTokens: 1_000_000, cacheReadTokens: 1_000_000 })).toBeCloseTo(5.1);
  });

  it("crear un proyecto o un piloto con La Tía cuesta centavos de dólar", () => {
    const s = copilotCostScenarios(4000);
    expect(s.project.usd).toBeLessThan(0.005);
    expect(s.pilot.usd).toBeLessThan(0.01);
    expect(s.pilotWithAdvice.usd).toBeLessThan(0.03);
    expect(s.pilotWorst.usd).toBeGreaterThan(s.pilot.usd);
  });
});
