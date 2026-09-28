// El vistazo de dirección: lo que un CMO necesita en diez segundos.
// Una respuesta grande a "¿Estamos creciendo?", cuatro semáforos (crece,
// preocupa, ganó, hay que decidir) y máximo tres cosas para hacer esta semana.
// Se arma con el resumen ejecutivo (`buildExecutiveBrief`), la respuesta de
// `directionHeadline` y los pilotos de medios visibles. Funciones puras.
import type { BriefItem, BriefKey, ExecutiveBrief } from "./executive";
import { bogotaDate, type GrowthAnswer } from "./rollup";

export type GlanceVerdict = "yes" | "slow" | "mixed" | "no" | "unknown";

/** Ilustraciones de marca que usa el vistazo (son nombres de `BrandIcon`). */
export type GlanceArt =
  | "mula-sombrero"
  | "mula-cargada"
  | "camino"
  | "tinto"
  | "mula-datos"
  | "cafe-crecimiento"
  | "embudo"
  | "diana"
  | "arriero";

export type GlanceCardKey = "growing" | "worrying" | "won" | "decide";

export interface GlanceCard {
  key: GlanceCardKey;
  label: string;
  value: number;
  sentence: string;
  art: GlanceArt;
  /** Pregunta del comité donde está el detalle. */
  question: BriefKey;
  /** Enlace directo cuando el detalle vive fuera del resumen (p. ej. solo pilotos por decidir). */
  href?: string;
  /** Amarillo: es lo que exige atención. */
  attention: boolean;
  /** Tono del número: bueno, malo o neutro (el color nunca va solo: la frase lo dice). */
  tone: "good" | "bad" | "neutral";
}

export interface GlanceAction {
  text: string;
  detail: string;
  href?: string;
  question?: BriefKey;
}

export interface ExecutiveGlance {
  verdict: GlanceVerdict;
  title: string;
  quip: string;
  detail: string;
  art: GlanceArt;
  cards: GlanceCard[];
  actions: GlanceAction[];
}

export interface GlancePilot {
  id: string;
  title: string;
  status: string;
  decision: string | null;
  decided_at: string | null;
}

export interface GlanceHeadline {
  answer: GrowthAnswer;
  northStarsEvaluated: number;
  northStarsOnTrack: number;
  includesDemo: boolean;
}

const VERDICT: Record<GlanceVerdict, { title: string; art: GlanceArt; quips: readonly string[] }> = {
  yes: {
    title: "¡Sí, y se nota!",
    art: "mula-sombrero",
    quips: ["La mula va subiendo sin pedir permiso.", "Hoy se puede tomar el tinto con calma.", "Así sí da gusto madrugar."],
  },
  slow: {
    title: "Sí, pero despacio",
    art: "mula-cargada",
    quips: ["Vamos bien, pero a paso de mula cansada.", "Sin afán… aunque un poquito de afán no sobra.", "Se avanza, pero falta el ganador que lo demuestre."],
  },
  mixed: {
    title: "Más o menos",
    art: "camino",
    quips: ["Unas van pa'rriba y otras pa'bajo, como la trocha.", "Ni tan tan, ni muy muy.", "Hay camino, pero con huecos."],
  },
  no: {
    title: "No, y hay que hablar",
    art: "tinto",
    quips: ["Pida el tinto doble: esta reunión va para largo.", "Ese camino no era. Toca buscar otro.", "La mula se sentó. Hay que ver por qué."],
  },
  unknown: {
    title: "Todavía no se sabe",
    art: "mula-datos",
    quips: ["Sin dato no hay camino: la mula está esperando el mapa.", "La mula no sabe si va subiendo o bajando.", "Un dato vale más que diez opiniones, y aquí faltan datos."],
  },
};

/** Índice estable a partir de un texto (la fecha): la frase cambia de un día a otro, no en cada recarga. */
export function stablePick<T>(list: readonly T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return list[Math.abs(h) % list.length];
}

/**
 * La respuesta grande:
 * - Con metas evaluadas manda `directionHeadline`: "yes" se vuelve "Sí, pero despacio" si no hubo ganadores en el periodo.
 * - Sin metas evaluadas se lee el movimiento del periodo: algo cae → "Más o menos"; solo sube → "Sí, pero despacio"; nada → "Todavía no se sabe".
 */
export function glanceVerdict(input: { answer: GrowthAnswer; growing: number; falling: number; winners: number }): GlanceVerdict {
  const { answer, growing, falling, winners } = input;
  if (answer === "yes") return winners > 0 ? "yes" : "slow";
  if (answer === "mixed" || answer === "no") return answer;
  if (falling > 0) return "mixed";
  if (growing > 0) return "slow";
  return "unknown";
}

const quote = (s: string | undefined) => (s ? `«${s}»` : "");
const andMore = (n: number) => (n > 1 ? ` y ${n - 1} más` : "");

function inPeriod(ts: string | null, start: string, end: string): boolean {
  const d = bogotaDate(ts);
  return !!d && d >= start && d <= end;
}

export function buildExecutiveGlance(input: {
  brief: ExecutiveBrief;
  headline: GlanceHeadline;
  /** Pilotos visibles, ya filtrados (reales, o de ejemplo si no hay reales). */
  pilots?: GlancePilot[];
  /** Semilla de la frase (la fecha de hoy). */
  seed: string;
}): ExecutiveGlance {
  const { brief, headline, seed } = input;
  const pilots = input.pilots ?? [];
  const section = (k: BriefKey): BriefItem[] => brief.sections.find((s) => s.key === k)?.items ?? [];
  const growing = section("growing");
  const falling = section("falling");
  const running = section("running");
  const results = section("results");
  const decide = section("decide");
  const next = section("next");
  const risks = section("risks");
  const value = section("value")[0];

  const wonExperiments = results.filter((r) => r.tone === "good");
  const wonPilots = pilots.filter((p) => p.status === "decided" && p.decision === "scale" && inPeriod(p.decided_at, brief.period.start, brief.period.end));
  const pilotsToDecide = pilots.filter((p) => p.status === "in_reading");
  const winners = wonExperiments.length + wonPilots.length;
  const toDecide = decide.length + pilotsToDecide.length;

  const verdict = glanceVerdict({ answer: headline.answer, growing: growing.length, falling: falling.length, winners });
  const copy = VERDICT[verdict];
  const detail =
    (headline.northStarsEvaluated
      ? `${headline.northStarsOnTrack} de ${headline.northStarsEvaluated} métrica${headline.northStarsEvaluated === 1 ? "" : "s"} norte van en la meta.`
      : "Las métricas norte todavía no tienen meta o valores para comparar.") + (headline.includesDemo ? " Con datos del programa de ejemplo." : "");

  // Nombre del primer ganador (ejercicio o piloto).
  const firstWinner = wonExperiments[0]?.subject ?? wonPilots[0]?.title;
  const firstToDecide = decide[0]?.subject ?? pilotsToDecide[0]?.title;

  const cards: GlanceCard[] = [
    {
      key: "growing",
      label: "Lo que crece",
      value: growing.length,
      sentence: growing.length ? `${growing[0].subject}${andMore(growing.length)} ${growing.length > 1 ? "van" : "va"} bien.` : "Nada va por encima de lo esperado todavía.",
      art: "cafe-crecimiento",
      question: "growing",
      attention: false,
      tone: growing.length ? "good" : "neutral",
    },
    {
      key: "worrying",
      label: "Lo que preocupa",
      value: falling.length,
      sentence: falling.length ? `${falling[0].subject}${andMore(falling.length)} ${falling.length > 1 ? "van" : "va"} atrás.` : "¡Eso! Nada va atrás.",
      art: "embudo",
      question: "falling",
      attention: false,
      tone: falling.length ? "bad" : "neutral",
    },
    {
      key: "won",
      label: "Lo que ganó",
      value: winners,
      sentence: winners
        ? `${quote(firstWinner)}${andMore(winners)} le ${winners > 1 ? "ganaron" : "ganó"} al control.${value?.tone === "good" ? ` Valor: ${value.text}.` : ""}`
        : "Nada ganó en el periodo. Perder también enseña.",
      art: "diana",
      question: "results",
      href: !wonExperiments.length && wonPilots.length ? "/pilotos" : undefined,
      attention: false,
      tone: winners ? "good" : "neutral",
    },
    {
      key: "decide",
      label: "Lo que hay que decidir",
      value: toDecide,
      sentence: toDecide ? `${quote(firstToDecide)}${andMore(toDecide)} ${toDecide > 1 ? "esperan" : "espera"} veredicto.` : "Nada esperando decisión. ¡Qué juicio!",
      art: "arriero",
      question: "decide",
      href: !decide.length && pilotsToDecide.length ? "/pilotos" : undefined,
      attention: toDecide > 0,
      tone: "neutral",
    },
  ];

  const actions: GlanceAction[] = [];
  if (toDecide) {
    actions.push({
      text: `Decidir ${quote(firstToDecide)}${andMore(toDecide)}`,
      detail: "Ya terminó la prueba. Sin veredicto no se aprende nada.",
      href: decide[0]?.href ?? (pilotsToDecide[0] ? `/pilotos/${pilotsToDecide[0].id}` : undefined),
    });
  }
  if (falling.length) {
    actions.push({
      text: `Convertir ${quote(falling[0].subject)} en oportunidad de mejora`,
      detail: "Va atrás de la meta: toca entender por qué antes de meterle plata.",
      href: falling[0].href,
    });
  }
  if (!running.length) {
    actions.push(
      next.length
        ? { text: `Lanzar ${quote(next[0].subject)}`, detail: "No hay pruebas corriendo: la mula está quieta.", href: next[0].href }
        : brief.programs[0]
          ? { text: "Priorizar la siguiente idea", detail: "No hay pruebas corriendo ni nada en fila.", href: `/programas/${brief.programs[0].id}/ejercicios` }
          : { text: "Priorizar la siguiente idea", detail: "No hay pruebas corriendo ni nada en fila.", question: "next" },
    );
  }
  if (verdict === "unknown" && brief.programs[0]) {
    actions.push({
      text: "Cargar los valores de la semana y las metas",
      detail: "Sin datos en las métricas norte no hay cómo responder.",
      href: `/programas/${brief.programs[0].id}/carga`,
    });
  }
  if (risks.length) actions.push({ text: risks[0].text, detail: "Planee alrededor: en un congelamiento no se lanza nada.", href: risks[0].href });
  if (value?.tone === "attention") {
    actions.push({ text: "Ponerle valor en pesos a los ganadores", detail: "A algunas métricas les falta el valor por unidad.", question: "value" });
  }
  if (!actions.length) {
    actions.push({ text: "Nada urgente: sigan probando", detail: "Revisen el detalle para el comité el lunes con el tinto.", question: "running" });
  }

  return {
    verdict,
    title: copy.title,
    quip: stablePick(copy.quips, seed),
    detail,
    art: copy.art,
    cards,
    actions: actions.slice(0, 3),
  };
}
