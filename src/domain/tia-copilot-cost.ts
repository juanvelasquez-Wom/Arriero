// Cuánto vale que La Tía cree un proyecto, un piloto o anote un avance.
// Se estima con los textos reales que se le mandan a Claude (mismas funciones que
// usa el servidor) y un recorrido típico: un mensaje libre al empezar y el resto
// con botones o respuestas que se entienden sin Claude.
import { approxTokens, estimateFlow, type CallEstimate, type FlowEstimate } from "./tia-cost";
import { emptyCopilotState, refFor, type CopilotState, type RefItem } from "./tia-copilot";
import { adviceSystem, buildExtractInput, EXTRACT_SYSTEM } from "./tia-copilot-prompt";

const HAIKU = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-5-5";
const TODAY = "2026-09-28";

/** Salida típica del intérprete: un JSON corto (real: 57 a 148 tokens). */
const EXTRACT_OUT = 110;
/** Salida típica de una opinión con effort "low" (real: 405 a 409 tokens). */
const ADVICE_OUT = 410;

function extractCall(what: string, state: CopilotState, message: string, refs: RefItem[] = []): CallEstimate {
  return {
    what,
    model: HAIKU,
    inputTokens: approxTokens(EXTRACT_SYSTEM) + approxTokens(buildExtractInput({ state, message, today: TODAY, refs })),
    outputTokens: EXTRACT_OUT,
  };
}

function adviceCall(what: string, data: unknown, question: string): CallEstimate {
  return { what, model: SONNET, inputTokens: approxTokens(adviceSystem(data)) + approxTokens(question), outputTokens: ADVICE_OUT };
}

/** Datos de ejemplo del tamaño de lo que La Tía recibe para opinar sobre un proyecto recién creado. */
const SAMPLE_PROGRAM_BRIEF = {
  hoy: TODAY,
  programa: { id: "x", nombre: "Pospago y recargas · oct 2026", objetivo: null, inicio: TODAY, fin: "2027-03-28", es_ejemplo: false },
  metricas_norte: [
    { linea: "Pospago", metrica: "Altas digitales semanales", unidad: "altas", debe: "subir", frente_a_la_meta: "no_data", ultimo_valor: null, esperado_hoy: null, brecha: null, meta: null, horizonte: "H1", ultimas_semanas: [] },
    { linea: "Recargas y paquetes", metrica: "Recargas digitales semanales", unidad: "recargas", debe: "subir", frente_a_la_meta: "no_data", ultimo_valor: null, esperado_hoy: null, brecha: null, meta: null, horizonte: "H1", ultimas_semanas: [] },
  ],
  oportunidades: [{ titulo: "El 40 % abandona en el pago del eCommerce", etapa: "Conversión", impacto: "high", estado: "to_validate", ejercicios: 0 }],
  ejercicios: [],
  aprendizajes: [],
  calendario: [
    { tipo: "peak", nombre: "Black Friday y Cyber", inicio: "2026-11-27", fin: "2026-11-30" },
    { tipo: "freeze", nombre: "Congelamiento Black Friday", inicio: "2026-11-23", fin: "2026-12-06" },
    { tipo: "decision", nombre: "Punto de decisión", inicio: "2027-01-15", fin: "2027-01-15" },
  ],
};

const SAMPLE_PILOT_BRIEF = {
  hoy: TODAY,
  piloto: {
    titulo: "Clic a WhatsApp en vez de landing · Meta",
    estado: "draft",
    oportunidad: "Los leads de la landing de pospago cierran poco: muchos no contestan la llamada y se pierden.",
    evidencia: "Tasa de cierre de leads de landing 6 % en agosto (CRM).",
    hipotesis: { cambio: "Anuncios de clic a WhatsApp en vez de la landing", metrica: "Ventas", esperado_pct: 15 },
    tipo_de_prueba: "ab_platform",
    fechas: { inicio: "2026-10-05", fin: "2026-11-01" },
    presupuesto_cop: 20000000,
    grupos: [
      { nombre: "Control (lo de hoy)", control: true, reparto: 50 },
      { nombre: "Prueba (el cambio)", control: false, reparto: 50 },
    ],
    medios: ["Meta"],
    chequeo_pendiente: 0,
    incidentes: [],
    mediciones: 0,
  },
  lectura: null,
};

function sampleRefs(n: number): RefItem[] {
  return Array.from({ length: n }, (_, i) => {
    const id = `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`;
    const kind = i % 4 === 0 ? "pilot" : i % 4 === 1 ? "metric" : "experiment";
    return { ref: refFor(kind, id), kind, id, label: `Nombre de ejemplo de un ${kind} número ${i}`, programName: "Pospago y recargas", status: kind === "metric" ? null : "in_test" };
  });
}

export interface CopilotCostSummary {
  project: FlowEstimate;
  projectWithAdvice: FlowEstimate;
  projectWorst: FlowEstimate;
  pilot: FlowEstimate;
  pilotWithAdvice: FlowEstimate;
  pilotWorst: FlowEstimate;
  update: FlowEstimate;
  advice: FlowEstimate;
}

export function copilotCostScenarios(rate?: number): CopilotCostSummary {
  const start = emptyCopilotState();
  const inProject: CopilotState = { ...start, mode: "project", asked: "months", project: { lines: [{ k: "pospago" }] } };
  const inPilot: CopilotState = { ...start, mode: "pilot", asked: "change", pilot: { problem: "Los leads de la landing cierran poco" } };
  const projectMsg = "Quiero un proyecto de growth para pospago y recargas, de seis meses, arrancando el lunes, con el calendario de telco";
  const pilotMsg =
    "Quiero probar anuncios de clic a WhatsApp en Meta en vez de la landing de pospago, porque los leads de la landing no contestan. Cierran el 6 % según el CRM. Arrancamos el lunes, 4 semanas, 20 millones";
  const projectFirst = extractCall("Entender el primer mensaje", start, projectMsg);
  const pilotFirst = extractCall("Entender el primer mensaje", start, pilotMsg);
  const advProject = adviceCall("Consejo sobre el arranque (opcional)", SAMPLE_PROGRAM_BRIEF, "¿Qué opina de «el proyecto nuevo» y qué debería hacer ahora?");
  const advPilot = adviceCall("Revisión del diseño (opcional)", SAMPLE_PILOT_BRIEF, "¿Qué opina de «Clic a WhatsApp» y qué debería hacer ahora?");
  const unclear = (s: CopilotState, what: string) => extractCall(what, s, "pues más o menos lo que le dije, algo así como medio año o lo que usted vea");

  return {
    project: estimateFlow("project", "Crear un proyecto", [projectFirst], rate),
    projectWithAdvice: estimateFlow("projectWithAdvice", "Crear un proyecto y pedir consejo", [projectFirst, advProject], rate),
    projectWorst: estimateFlow("projectWorst", "Crear un proyecto escribiendo todo a mano", [projectFirst, unclear(inProject, "Respuesta ambigua"), unclear(inProject, "Respuesta ambigua"), unclear(inProject, "Cambio antes de crear"), advProject], rate),
    pilot: estimateFlow("pilot", "Crear un piloto", [pilotFirst, extractCall("Aclarar un dato", inPilot, "más o menos lo del cambio de landing a WhatsApp que le conté")], rate),
    pilotWithAdvice: estimateFlow("pilotWithAdvice", "Crear un piloto y pedir revisión", [pilotFirst, extractCall("Aclarar un dato", inPilot, "más o menos lo del cambio de landing a WhatsApp que le conté"), advPilot], rate),
    pilotWorst: estimateFlow(
      "pilotWorst",
      "Crear un piloto escribiendo todo a mano",
      [pilotFirst, ...Array.from({ length: 5 }, (_, i) => unclear(inPilot, `Respuesta ambigua ${i + 1}`)), advPilot],
      rate,
    ),
    update: estimateFlow("update", "Anotar un avance", [extractCall("Entender el avance", start, "El piloto de WhatsApp arrancó ayer", sampleRefs(40))], rate),
    advice: estimateFlow("advice", "Una pregunta de opinión", [advProject], rate),
  };
}
