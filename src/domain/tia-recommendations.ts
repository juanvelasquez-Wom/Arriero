// "La Tía tiene una recomendación": tareas (prompts), esquemas de respuesta y
// reglas para aplicar sus propuestas al formulario. Todo puro y probado; la
// llamada a Claude vive en src/server/actions/tia-recommendations.ts.
//
// Regla de oro: La Tía propone y la persona decide. Aplicar una propuesta solo
// llena campos del formulario (y casi siempre solo los vacíos); nada se guarda
// solo y nunca se tocan el veredicto ni la decisión.
import { z } from "zod";
import { variantsAreDefault, type TemplateTarget } from "./experiment-templates";
import type { ExperimentReading } from "./results";
import { extractJson } from "./tia";
import { TEST_TYPES, type TestType } from "./types";

// ---------------------------------------------------------------------------
// Utilidades de normalización
// ---------------------------------------------------------------------------

/** Texto recortado y sin espacios de más; "" si no es texto. */
function text(max: number) {
  return z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : typeof v === "number" ? String(v) : ""))
    .transform((s) => (s.length > max ? `${s.slice(0, max - 1)}…` : s));
}

const requiredText = (max: number) => text(max).pipe(z.string().min(1));

/** Lista de textos: descarta lo que no sea texto o quede vacío. */
function textList(maxItems: number, maxLen: number) {
  return z
    .unknown()
    .optional()
    .transform((v) => (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? [v] : []))
    .transform((arr) =>
      arr
        .map((x) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim() : ""))
        .filter(Boolean)
        .slice(0, maxItems)
        .map((s) => (s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s)),
    );
}

/** Entero de 1 a 10 (acepta "7", 7.4); null si no se puede leer. */
export function toIceScore(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(1, Math.round(n)));
}

/** Tipo de prueba desde lo que diga Claude ("A/B", "geo", "antes y después"…). */
export function toTestType(v: unknown): TestType | null {
  if (typeof v !== "string") return null;
  const exact = v.trim().toLowerCase();
  if ((TEST_TYPES as readonly string[]).includes(exact)) return exact as TestType;
  const s = v
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z]/g, "");
  if (s.includes("antes") || s.includes("before")) return "before_after";
  if (s === "ab" || s.startsWith("ab") || s.includes("split")) return "ab";
  if (s.startsWith("geo") || s.includes("zona") || s.includes("ciudad") || s.includes("region")) return "geo";
  return null;
}

// ---------------------------------------------------------------------------
// Borrador que viene de la pantalla
// ---------------------------------------------------------------------------

export const hypothesisDraftSchema = z.object({
  problem_id: z.string().uuid("Elija primero el problema."),
  metric_id: z.string().uuid("Elija primero la métrica del árbol."),
  title: z.string().max(300).default(""),
  hypothesis_if: z.string().max(2000).default(""),
  hypothesis_then: z.string().max(2000).default(""),
  hypothesis_because: z.string().max(2000).default(""),
});
export type HypothesisDraft = z.infer<typeof hypothesisDraftSchema>;

export const iceDraftSchema = hypothesisDraftSchema.extend({
  control: z.enum(["ours", "shared", "external"]).default("ours"),
  planned_start: z.string().max(10).nullable().default(null),
  planned_end: z.string().max(10).nullable().default(null),
});
export type IceDraft = z.infer<typeof iceDraftSchema>;

export const designDraftSchema = iceDraftSchema.extend({
  test_type: z.enum(TEST_TYPES).nullable().default(null),
  min_duration_days: z.number().int().positive().max(3650).nullable().default(null),
  decision_rule: z.string().max(2000).default(""),
  control_metrics: z.array(z.string().max(300)).max(20).default([]),
  variants: z
    .array(z.object({ name: z.string().max(200), description: z.string().max(1000), is_control: z.boolean() }))
    .max(10)
    .default([]),
});
export type DesignDraft = z.infer<typeof designDraftSchema>;

/** Lo que la pantalla ya calculó para la lectura (para que Claude no recalcule). */
export const readingScreenSchema = z.object({
  experiment_id: z.string().uuid(),
  evidence: z.object({
    kind: z.enum(["probabilistic", "directional"]),
    bestName: z.string().max(200).nullable(),
    probabilityLabel: z.string().max(50).nullable(),
    bandLabel: z.string().max(200).nullable(),
    winnerNeedsWarning: z.boolean(),
    reliableWinner: z.boolean(),
  }),
  durationWarning: z.string().max(500).nullable(),
  missingResults: z.boolean(),
  decisionRule: z.string().max(2000).nullable(),
});
export type ReadingScreen = z.infer<typeof readingScreenSchema>;

// ---------------------------------------------------------------------------
// Tareas para Claude (se agregan a TIA_PERSONA con tiaSystem)
// ---------------------------------------------------------------------------

const JSON_ONLY =
  "Responda SOLO con JSON válido, sin texto antes ni después y sin bloque de código. Todos los textos en español, de usted, cortos.";

export const HYPOTHESES_TASK = `Proponga 3 hipótesis distintas para un ejercicio nuevo.
En "pantalla.borrador" está lo que la persona lleva escrito; en "pantalla.problema" el problema elegido con su evidencia, y en "pantalla.metrica" la métrica del árbol que el ejercicio debe mover.
Cada hipótesis:
- SI: un cambio concreto y lanzable (qué, a quién o en qué canal/segmento, cuándo).
- ENTONCES: el efecto esperado medido en la métrica elegida (use su nombre y su dirección).
- PORQUE: la razón, apoyada en la evidencia del problema.
- Revise "aprendizajes" y "ejercicios" del programa: no repita lo que ya perdió o no fue concluyente; si una opción se apoya en un aprendizaje o se aleja de algo que ya se probó, dígalo en "based_on".
- Si el borrador ya tiene texto, úselo como punto de partida en al menos una opción.
${JSON_ONLY}
Formato exacto:
[{"title": "título corto (máx. 90 caracteres)", "si": "…", "entonces": "…", "porque": "…", "why": "por qué vale la pena, en una frase", "based_on": "de qué dato, evidencia o aprendizaje sale (o qué evita repetir)"}]`;

export const REVIEW_TASK = `Revise la hipótesis de "pantalla.borrador" (SI / ENTONCES / PORQUE) para el problema "pantalla.problema" y la métrica "pantalla.metrica".
Revise cuatro cosas:
1. ¿Se puede medir en la métrica elegida? (el ENTONCES habla de esa métrica y de su dirección)
2. ¿El cambio (SI) es concreto y lanzable, no una intención general?
3. ¿Dice a qué segmento, canal o momento aplica?
4. ¿El PORQUE se apoya en la evidencia del problema?
"verdict": "clara" si pasa las cuatro, "mejorable" si falla una o dos, "vaga" si falla más.
"issues": una frase por cada punto que falla (vacío si es clara).
"improved": la misma idea, mejor escrita; no cambie la intención ni invente cifras (si hace falta un dato, déjelo entre [corchetes]).
${JSON_ONLY}
Formato exacto:
{"verdict": "clara" | "mejorable" | "vaga", "issues": ["…"], "improved": {"si": "…", "entonces": "…", "porque": "…"}}`;

export const ICE_TASK = `Sugiera una calificación ICE (1 a 10, enteros) para el ejercicio de "pantalla.borrador":
- impact: cuánto movería la métrica elegida si funciona (mire la brecha frente a la meta y el impacto del problema).
- confidence: qué tan sólida es la evidencia (evidencia del problema, aprendizajes parecidos, lo que ya ganó o perdió).
- ease: qué tan fácil y rápido es de lanzar (control nuestro o de terceros, calendario y congelamientos).
Es una sugerencia: el equipo pone la calificación. Explique cada número en una frase con el dato que lo sostiene.
${JSON_ONLY}
Formato exacto:
{"impact": 7, "confidence": 5, "ease": 8, "why": {"impact": "…", "confidence": "…", "ease": "…"}}`;

export const DESIGN_TASK = `Proponga el diseño de la prueba para el ejercicio de "pantalla.borrador" (métrica principal: "pantalla.metrica").
- test_type: "ab" si hay volumen para dividir al azar; "geo" si solo se puede por zona o ciudad; "before_after" si no se puede tener grupo de control simultáneo.
- min_duration_days: días mínimos (mínimo 7, preferible semanas completas) según el volumen de la métrica (ultimas_semanas de las métricas norte, línea base) y el calendario: no cruce congelamientos ("freeze") y avise si se lee cerca de un pico ("peak").
- decision_rule: qué resultado lleva a escalar, ajustar o apagar, con la métrica y su dirección, fijado antes de lanzar.
- variants: exactamente un control (is_control true) y una o dos variantes; nombre corto y qué ve o recibe cada grupo.
- risks: riesgos concretos (calendario, volumen, contaminación entre grupos, métricas de control que pueden empeorar).
${JSON_ONLY}
Formato exacto:
{"test_type": "ab" | "geo" | "before_after", "min_duration_days": 21, "decision_rule": "…", "variants": [{"name": "…", "description": "…", "is_control": true}], "risks": ["…"]}`;

export const READING_TASK = `Léale a la persona el resultado del ejercicio de "pantalla.ejercicio" en lenguaje sencillo, antes de que decida.
Use los números YA calculados en "pantalla.lectura" y "pantalla.evidencia" (probabilidad de ganar, intervalo, valor estimado, advertencia de duración): no los recalcule ni invente otros.
- Diga si la métrica se movió en la dirección buena (mire "direccion": "sube" o "baja" es lo bueno).
- Explique la probabilidad de ganar y el intervalo como se lo explicaría a alguien sin estadística; si es evidencia direccional, dígalo.
- Mencione el valor estimado si existe, y si falta un dato para calcularlo, cuál.
- Si hay advertencia de duración o faltan resultados, dígalo primero.
- Compare con la regla de decisión, pero NO diga cuál veredicto ni cuál decisión tomar: eso lo decide el equipo.
- Proponga un borrador de aprendizaje (qué aprendimos y por qué creemos que pasó, dejando [corchetes] donde el equipo deba completar) y a qué otras líneas del programa podría aplicar (use nombres exactos de "pantalla.otras_lineas").
${JSON_ONLY}
Formato exacto:
{"summary": "2 a 4 frases", "points": ["…"], "learning_draft": "…", "applies_to": ["nombre de línea"], "suggested_hypothesis": "SI … ENTONCES … PORQUE … (opcional, puede ir vacío)"}`;

// ---------------------------------------------------------------------------
// Esquemas de respuesta
// ---------------------------------------------------------------------------

export const hypothesisOptionSchema = z.object({
  title: text(120),
  si: requiredText(600),
  entonces: requiredText(400),
  porque: requiredText(600),
  why: text(400),
  based_on: text(400),
});
export type HypothesisOption = z.infer<typeof hypothesisOptionSchema>;

export const hypothesisReviewSchema = z.object({
  verdict: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" ? v.toLowerCase().trim() : ""))
    .pipe(z.enum(["clara", "mejorable", "vaga"])),
  issues: textList(6, 300),
  improved: z.object({ si: requiredText(600), entonces: requiredText(400), porque: requiredText(600) }),
});
export type HypothesisReview = z.infer<typeof hypothesisReviewSchema>;

const iceNumber = z.unknown().optional().transform(toIceScore).pipe(z.number());

export const iceSuggestionSchema = z.object({
  impact: iceNumber,
  confidence: iceNumber,
  ease: iceNumber,
  why: z
    .object({ impact: text(300), confidence: text(300), ease: text(300) })
    .catch({ impact: "", confidence: "", ease: "" }),
});
export type IceSuggestion = z.infer<typeof iceSuggestionSchema>;

export const designVariantSchema = z.object({
  name: requiredText(80),
  description: text(300),
  is_control: z.unknown().optional().transform((v) => v === true || v === "true"),
});

export const designSuggestionSchema = z
  .object({
    test_type: z.unknown().optional().transform(toTestType),
    min_duration_days: z
      .unknown()
      .optional()
      .transform((v) => {
        const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
        return Number.isFinite(n) && n >= 1 ? Math.min(365, Math.round(n)) : null;
      }),
    decision_rule: text(600),
    variants: z
      .unknown()
      .optional()
      .transform((v) => (Array.isArray(v) ? v : []))
      .transform((arr) =>
        arr
          .flatMap((x) => {
            const r = designVariantSchema.safeParse(x);
            return r.success ? [r.data] : [];
          })
          .slice(0, 4),
      ),
    risks: textList(6, 300),
  })
  .transform((d) => ({ ...d, variants: normalizeControl(d.variants) }));
export type DesignSuggestion = z.infer<typeof designSuggestionSchema>;

export const readingSuggestionSchema = z.object({
  summary: requiredText(1200),
  points: textList(8, 400),
  learning_draft: text(1500),
  applies_to: textList(10, 120),
  suggested_hypothesis: text(600),
});
export type ReadingSuggestion = z.infer<typeof readingSuggestionSchema>;

/** Deja exactamente un control: el primero marcado o, si no hay, el primero de la lista. */
export function normalizeControl<V extends { is_control: boolean }>(variants: V[]): V[] {
  if (!variants.length) return variants;
  const idx = Math.max(0, variants.findIndex((v) => v.is_control));
  return variants.map((v, i) => ({ ...v, is_control: i === idx }));
}

// ---------------------------------------------------------------------------
// Lectores de la respuesta de Claude (defensivos: null si no se entiende)
// ---------------------------------------------------------------------------

export function parseHypotheses(reply: string): HypothesisOption[] | null {
  const raw = extractJson<unknown>(reply);
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { options?: unknown }).options)
      ? (raw as { options: unknown[] }).options
      : null;
  if (!list) return null;
  const options = list.flatMap((x) => {
    const r = hypothesisOptionSchema.safeParse(x);
    return r.success ? [r.data] : [];
  });
  return options.length ? options.slice(0, 3) : null;
}

function parseWith<T>(schema: z.ZodType<T>, reply: string): T | null {
  const raw = extractJson<unknown>(reply);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = schema.safeParse(raw);
  return r.success ? r.data : null;
}

export const parseReview = (reply: string) => parseWith(hypothesisReviewSchema, reply);
export const parseIce = (reply: string) => parseWith(iceSuggestionSchema, reply);
export const parseReading = (reply: string) => parseWith(readingSuggestionSchema, reply);

export function parseDesign(reply: string): DesignSuggestion | null {
  const d = parseWith(designSuggestionSchema, reply);
  if (!d) return null;
  // Sin nada utilizable no es una propuesta.
  if (!d.test_type && d.min_duration_days == null && !d.decision_rule && d.variants.length < 2 && !d.risks.length) return null;
  return d;
}

// ---------------------------------------------------------------------------
// Aplicar propuestas al formulario (solo llenan; la persona guarda)
// ---------------------------------------------------------------------------

type HypothesisTarget = Pick<TemplateTarget, "title" | "hypothesis_if" | "hypothesis_then" | "hypothesis_because">;

/** "Usar esta": llena las tres partes; el título solo si está vacío. */
export function applyHypothesisOption<T extends HypothesisTarget>(values: T, option: Pick<HypothesisOption, "title" | "si" | "entonces" | "porque">): T {
  return {
    ...values,
    title: values.title.trim() || !option.title ? values.title : option.title,
    hypothesis_if: option.si,
    hypothesis_then: option.entonces,
    hypothesis_because: option.porque,
  };
}

/** "Aplicar la versión mejorada": reemplaza las tres partes (el título no se toca). */
export function applyImprovedHypothesis<T extends HypothesisTarget>(values: T, improved: HypothesisReview["improved"]): T {
  return { ...values, hypothesis_if: improved.si, hypothesis_then: improved.entonces, hypothesis_because: improved.porque };
}

/** "Usar estos valores": pone los tres sliders (la persona los puede mover). */
export function applyIceSuggestion<T extends { impact: number | null; confidence: number | null; ease: number | null }>(
  values: T,
  s: Pick<IceSuggestion, "impact" | "confidence" | "ease">,
): T {
  return { ...values, impact: s.impact, confidence: s.confidence, ease: s.ease };
}

export type DesignField = "test_type" | "min_duration_days" | "decision_rule" | "variants";

/**
 * "Aplicar" el diseño: solo llena lo vacío (tipo, duración, regla) y reemplaza
 * las variantes solo si siguen como vienen por defecto. Devuelve lo que llenó.
 */
export function applyDesignSuggestion<T extends Pick<TemplateTarget, "test_type" | "min_duration_days" | "decision_rule" | "variants">>(
  values: T,
  s: DesignSuggestion,
): { values: T; filled: DesignField[] } {
  const next: T = { ...values };
  const filled: DesignField[] = [];
  if (!values.test_type && s.test_type) {
    next.test_type = s.test_type;
    filled.push("test_type");
  }
  if (values.min_duration_days == null && s.min_duration_days != null) {
    next.min_duration_days = s.min_duration_days;
    filled.push("min_duration_days");
  }
  if (!values.decision_rule.trim() && s.decision_rule) {
    next.decision_rule = s.decision_rule;
    filled.push("decision_rule");
  }
  if (s.variants.length >= 2 && s.variants.some((v) => v.is_control) && variantsAreDefault(values.variants)) {
    // Conserva los id de las variantes ya guardadas para no borrarlas y recrearlas.
    next.variants = s.variants.map((v, i) => ({
      ...(values.variants[i]?.id ? { id: values.variants[i].id } : {}),
      name: v.name,
      description: v.description,
      is_control: v.is_control,
    })) as T["variants"];
    filled.push("variants");
  }
  return { values: next, filled };
}

/** Nombres de línea que dijo Claude → ids de las líneas del programa (sin la propia). */
export function matchLineIds(names: string[], lines: { id: string; name: string }[], ownLineId?: string): string[] {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  const wanted = new Set(names.map(norm));
  return lines.filter((l) => l.id !== ownLineId && wanted.has(norm(l.name))).map((l) => l.id);
}

const pct1 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 10);

/**
 * Lectura ya calculada por el dominio (results.ts + stats.ts + value.ts), en un
 * formato compacto para Claude: porcentajes con un decimal y valor en COP redondeado.
 */
export function readingForTia(reading: ExperimentReading) {
  return {
    tipo_de_evidencia: reading.kind === "probabilistic" ? "probabilística (A/B al azar)" : "direccional (sin reparto al azar)",
    variante_resumen: reading.headline?.name ?? null,
    variantes: reading.rows.map((r) => ({
      nombre: r.name,
      es_control: r.is_control,
      muestra: r.sample,
      conversiones: r.conversions,
      valor_metrica: r.metric_value,
      tasa_pct: pct1(r.rate),
      diferencia_vs_control_pct: pct1(r.diffVsControl),
      probabilidad_de_ganar_pct: pct1(r.stats?.probability),
      intervalo_95_pct: r.stats?.interval ? [pct1(r.stats.interval.low), pct1(r.stats.interval.high)] : null,
      banda: r.stats?.band?.label ?? null,
      valor_estimado_mensual_cop: r.value_estimate ? Math.round(r.value_estimate.monthly) : null,
      unidades_extra_por_semana: r.value_estimate ? Math.round(r.value_estimate.extraUnitsPerWeek * 10) / 10 : null,
      falta_para_valor:
        r.is_control || !r.value_missing
          ? null
          : r.value_missing === "lift"
            ? "diferencia frente al control"
            : r.value_missing === "volume"
              ? "volumen semanal de la métrica (línea base o valores cargados)"
              : "valor por unidad de la métrica",
    })),
  };
}

/** Etiqueta del veredicto de la revisión. */
export const REVIEW_VERDICT_LABEL: Record<HypothesisReview["verdict"], string> = {
  clara: "Clarita",
  mejorable: "Se puede mejorar",
  vaga: "Todavía muy vaga",
};
