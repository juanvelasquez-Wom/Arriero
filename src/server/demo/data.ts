// Programa de ejemplo "Programa demo · Telco Andina". TODOS LOS DATOS SON INVENTADOS.
//
// Las fechas NO son fijas: salen del día en que se carga el ejemplo (`today`),
// para que siempre se vea "en curso": el programa arrancó hace 12 semanas, dos
// ejercicios ya se decidieron (hace unas 3 y 1 semanas), uno lleva 10 días en
// prueba y los picos, congelamientos y el punto de decisión están por venir.
import { addDays, weekStart } from "@/domain/dates";
import type {
  CalendarEventType,
  ControlLevel,
  Decision,
  ImpactLevel,
  MetricBranch,
  MetricDirection,
  MetricType,
  OwnerType,
  TestType,
  Verdict,
  IsoDate,
} from "@/domain/types";

export const DEMO_PROGRAM_TEXT = {
  name: "Programa demo · Telco Andina",
  description:
    "Programa de ejemplo con datos inventados: tres líneas, calendario de picos y tres ejercicios en estados distintos para recorrer la app.",
};

/** Semanas de valores cargados (terminan en la última semana completa). */
export const DEMO_WEEKS = 12;

/** Usuarios ficticios del ejemplo (se crean y se borran con el programa). */
export const DEMO_USERS = [
  { key: "internal", name: "Laura Gómez (demo)", role: "collaborator" as const, localPart: "laura.demo" },
  { key: "agency", name: "Agencia Creativa (demo)", role: "agency" as const, localPart: "agencia.demo" },
];

export const DEMO_EMAIL_DOMAIN = "telco-andina.example";

export type LineKey = "pospago" | "recargas" | "equipos";

export const DEMO_LINES: { key: LineKey; name: string }[] = [
  { key: "pospago", name: "Pospago" },
  { key: "recargas", name: "Recargas y paquetes" },
  { key: "equipos", name: "Equipos móviles" },
];

export type MetricKey =
  | "pos_ns"
  | "pos_eff"
  | "pos_cpc"
  | "rec_ns"
  | "rec_second"
  | "eq_ns"
  | "eq_cart";

export interface DemoMetric {
  key: MetricKey;
  line: LineKey;
  parent?: MetricKey;
  type: MetricType;
  branch: MetricBranch | null;
  name: string;
  definition: string;
  channel: string | null;
  unit: string;
  direction: MetricDirection;
  source: string;
  baseline: number;
  targetH1: number;
  /** 12 valores semanales, desde el inicio del programa hasta la última semana completa. */
  weekly: number[];
}

export const DEMO_METRICS: DemoMetric[] = [
  {
    key: "pos_ns",
    line: "pospago",
    type: "north_star",
    branch: null,
    name: "Altas digitales semanales",
    definition: "Altas de pospago cerradas en canales digitales (eCommerce y WhatsApp) en la semana.",
    channel: "Digital",
    unit: "altas",
    direction: "up",
    source: "CRM de ventas",
    baseline: 420,
    targetH1: 520,
    weekly: [425, 418, 410, 402, 398, 395, 390, 392, 390, 393, 405, 418],
  },
  {
    key: "pos_eff",
    line: "pospago",
    type: "efficiency",
    branch: null,
    name: "Costo por alta",
    definition: "Inversión en medios de la línea dividida entre las altas digitales de la semana.",
    channel: "Digital",
    unit: "COP",
    direction: "down",
    source: "Plataformas de medios + CRM",
    baseline: 185000,
    targetH1: 160000,
    weekly: [184000, 186500, 189000, 192000, 195500, 198000, 201000, 200500, 201500, 200000, 194000, 188500],
  },
  {
    key: "pos_cpc",
    line: "pospago",
    parent: "pos_ns",
    type: "input",
    branch: "demand_volume",
    name: "Costo por conversación",
    definition: "Inversión en anuncios Click-to-WhatsApp dividida entre las conversaciones iniciadas.",
    channel: "WhatsApp",
    unit: "COP",
    direction: "down",
    source: "Meta Ads",
    baseline: 9800,
    targetH1: 8000,
    weekly: [9800, 10200, 10700, 11300, 11900, 12600, 13200, 13300, 13250, 13300, 12600, 11900],
  },
  {
    key: "rec_ns",
    line: "recargas",
    type: "north_star",
    branch: null,
    name: "Clientes con recarga digital recurrente",
    definition: "Clientes que hicieron dos o más recargas digitales en los últimos 30 días.",
    channel: "Digital",
    unit: "clientes",
    direction: "up",
    source: "Plataforma de recargas",
    baseline: 12000,
    targetH1: 15000,
    weekly: [12000, 12050, 11980, 12100, 12080, 12150, 12200, 12260, 12300, 12800, 13350, 13900],
  },
  {
    key: "rec_second",
    line: "recargas",
    parent: "rec_ns",
    type: "input",
    branch: "recovery_recurrence",
    name: "Tasa de segunda recarga a 30 días",
    definition: "Porcentaje de clientes que hacen una segunda recarga dentro de los 30 días siguientes a la primera.",
    channel: "WhatsApp",
    unit: "%",
    direction: "up",
    source: "Plataforma de recargas",
    baseline: 18,
    targetH1: 22,
    weekly: [18.0, 17.8, 18.2, 18.1, 18.6, 18.9, 19.1, 18.9, 19.0, 20.4, 21.3, 22.0],
  },
  {
    key: "eq_ns",
    line: "equipos",
    type: "north_star",
    branch: null,
    name: "Equipos vendidos por eCommerce semanales",
    definition: "Unidades de equipos vendidas en la tienda en línea en la semana.",
    channel: "eCommerce",
    unit: "unidades",
    direction: "up",
    source: "Plataforma eCommerce",
    baseline: 150,
    targetH1: 190,
    weekly: [150, 148, 153, 151, 149, 155, 152, 150, 154, 151, 156, 153],
  },
  {
    key: "eq_cart",
    line: "equipos",
    parent: "eq_ns",
    type: "input",
    branch: "conversion",
    name: "Carrito a compra de equipo",
    definition: "Porcentaje de carritos con un equipo que terminan en compra.",
    channel: "eCommerce",
    unit: "%",
    direction: "up",
    source: "Analítica web",
    baseline: 24,
    targetH1: 28,
    weekly: [24.1, 23.8, 24.3, 24.0, 23.6, 24.2, 23.9, 24.4, 24.1, 23.8, 24.0, 24.2],
  },
];

/** Etapa del embudo (por nombre por defecto) vinculada a una métrica. */
export const DEMO_STAGE_METRICS: { line: LineKey; stage: string; metric: MetricKey }[] = [
  { line: "pospago", stage: "Adquisición", metric: "pos_cpc" },
  { line: "recargas", stage: "Recuperación y recurrencia", metric: "rec_second" },
  { line: "equipos", stage: "Conversión", metric: "eq_cart" },
];

export type ProblemKey = "p1" | "p2" | "p3";

export const DEMO_PROBLEMS: {
  key: ProblemKey;
  line: LineKey;
  stage: string;
  channel: string;
  title: string;
  evidence: string;
  root_cause: string;
  impact: ImpactLevel;
  control: ControlLevel;
}[] = [
  {
    key: "p1",
    line: "recargas",
    stage: "Recuperación y recurrencia",
    channel: "WhatsApp",
    title: "Pocos clientes hacen una segunda recarga en los primeros 30 días.",
    evidence: "Solo el 18% repite en 30 días; el 60% de los que no repiten no abrió ninguna comunicación posterior.",
    root_cause: "El cliente olvida recargar y no conoce los paquetes.",
    impact: "high",
    control: "ours",
  },
  {
    key: "p2",
    line: "pospago",
    stage: "Adquisición",
    channel: "WhatsApp",
    title: "El costo por conversación subió 35% en seis semanas.",
    evidence: "Los mismos tres creativos llevan 8 semanas activos y la frecuencia pasó de 1,8 a 3,4.",
    root_cause: "Fatiga creativa.",
    impact: "high",
    control: "ours",
  },
  {
    key: "p3",
    line: "equipos",
    stage: "Activación",
    channel: "eCommerce",
    title: "Muchas visitas a la ficha del equipo terminan sin agregar al carrito.",
    evidence: "El 70% de las salidas ocurre en los 10 segundos posteriores a ver el precio.",
    root_cause: "El precio total de contado se percibe alto.",
    impact: "medium",
    control: "ours",
  },
];

export interface DemoExperiment {
  key: "e1" | "e2" | "e3";
  problem: ProblemKey;
  metric: MetricKey;
  title: string;
  hypothesis_if: string;
  hypothesis_then: string;
  hypothesis_because: string;
  impact: number;
  confidence: number;
  ease: number;
  fits_calendar: boolean;
  control: ControlLevel;
  owner: "internal" | "agency";
  owner_type: OwnerType;
  test_type: TestType;
  primary_metric: string;
  control_metrics: string[];
  min_duration_days: number;
  decision_rule: string;
  variants: {
    name: string;
    is_control: boolean;
    description: string;
    sample: number | null;
    conversions: number | null;
    notes: string | null;
  }[];
  /** Estado final al que se lleva con las transiciones reales. */
  target: "scaled" | "in_test" | "decided";
  decide?: {
    verdict: Verdict;
    decision: Decision;
    rationale: string;
    learning: string;
    appliesTo: LineKey[];
    suggestedHypothesis: string | null;
  };
}

export type DemoExperimentKey = DemoExperiment["key"];

/** Fechas de un ejercicio del ejemplo, ya resueltas para el día de carga. */
export interface DemoExperimentDates {
  planned_start: IsoDate;
  planned_end: IsoDate;
  actual_start: IsoDate;
  actual_end: IsoDate | null;
  /** Marcas de tiempo históricas (se fijan después de las transiciones). */
  timestamps: { design_locked_at: string; status_changed_at: string; decided_at: string | null };
}

export const DEMO_EXPERIMENTS: DemoExperiment[] = [
  {
    key: "e1",
    problem: "p1",
    metric: "rec_second",
    title: "Recordatorio de recarga con paquete sugerido por WhatsApp",
    hypothesis_if:
      "enviamos por WhatsApp un recordatorio a los 25 días de la primera recarga con un paquete sugerido según su consumo",
    hypothesis_then: "sube la segunda recarga a 30 días",
    hypothesis_because: "el cliente se acuerda a tiempo y descubre un paquete que le sirve",
    impact: 8,
    confidence: 7,
    ease: 8,
    fits_calendar: true,
    control: "ours",
    owner: "internal",
    owner_type: "internal",
    test_type: "ab",
    primary_metric: "Segunda recarga a 30 días",
    control_metrics: ["Tasa de bloqueo del número de WhatsApp (no debe superar el 1,5%)"],
    min_duration_days: 28,
    decision_rule: "Escalar si la variante supera al control en al menos 10% relativo y el bloqueo no pasa de 1,5%.",
    variants: [
      { name: "Control", is_control: true, description: "Sin recordatorio", sample: 5000, conversions: 900, notes: null },
      {
        name: "Recordatorio con paquete",
        is_control: false,
        description: "Recordatorio el día 25 con un paquete sugerido según consumo",
        sample: 5000,
        conversions: 1150,
        notes: "Bloqueo del número: 0,9%.",
      },
    ],
    target: "scaled",
    decide: {
      verdict: "winner",
      decision: "scale",
      rationale: "La variante superó al control en +27,8% relativo y el bloqueo fue de 0,9%, por debajo del 1,5%.",
      learning:
        "Un recordatorio oportuno con una oferta concreta mueve la recurrencia sin desgastar el canal. El momento (día 25) importa más que el descuento.",
      appliesTo: ["pospago"],
      suggestedHypothesis: "Recordatorio oportuno por WhatsApp en Pospago, como recordatorio de pago o de beneficios.",
    },
  },
  {
    key: "e2",
    problem: "p2",
    metric: "pos_cpc",
    title: "Rotación de creativos en video vertical testimonial",
    hypothesis_if: "reemplazamos los tres creativos actuales por seis videos verticales testimoniales nuevos",
    hypothesis_then: "baja el costo por conversación",
    hypothesis_because: "se corta la fatiga creativa y el formato genera más interacción",
    impact: 7,
    confidence: 6,
    ease: 6,
    fits_calendar: true,
    control: "ours",
    owner: "agency",
    owner_type: "agency",
    test_type: "ab",
    primary_metric: "Costo por conversación",
    control_metrics: ["Tasa de conversación a venta (no debe caer más de 5% relativo)"],
    min_duration_days: 21,
    decision_rule:
      "Escalar si el costo por conversación de la variante es al menos 12% menor que el del control y la conversación a venta no cae más de 5%.",
    variants: [
      { name: "Control", is_control: true, description: "Creativos actuales (50% del presupuesto)", sample: null, conversions: null, notes: null },
      {
        name: "Seis videos testimoniales",
        is_control: false,
        description: "Seis videos verticales testimoniales nuevos (50% del presupuesto)",
        sample: null,
        conversions: null,
        notes: null,
      },
    ],
    target: "in_test",
  },
  {
    key: "e3",
    problem: "p3",
    metric: "eq_cart",
    title: "Precio en cuotas mensuales en la ficha del equipo",
    hypothesis_if: "mostramos el precio como cuota mensual en lugar del precio total",
    hypothesis_then: "más visitas terminan en compra",
    hypothesis_because: "el precio se percibe accesible",
    impact: 7,
    confidence: 5,
    ease: 9,
    fits_calendar: true,
    control: "ours",
    owner: "internal",
    owner_type: "internal",
    test_type: "geo",
    primary_metric: "Carrito a compra de equipo",
    control_metrics: ["Tasa de agregar al carrito"],
    min_duration_days: 21,
    decision_rule: "Escalar si la conversión de carrito a compra sube al menos 8% relativo.",
    variants: [
      { name: "Control · Ciudad Sur", is_control: true, description: "Precio total", sample: 2400, conversions: 600, notes: null },
      {
        name: "Variante · Ciudad Norte",
        is_control: false,
        description: "Cuota mensual",
        sample: 3100,
        conversions: 651,
        notes: "Los carritos subieron 29%, pero muchos abandonan al ver el total en el checkout.",
      },
    ],
    target: "decided",
    decide: {
      verdict: "loser",
      decision: "kill",
      rationale: "La conversión de carrito a compra cayó 16% relativo; la regla exigía una subida de al menos 8%.",
      learning:
        "La cuota atrae más interés, pero la sorpresa del precio total al final genera abandono. El problema es la coherencia del precio a lo largo del recorrido, no el precio en sí.",
      appliesTo: ["pospago"],
      suggestedHypothesis: "Mostrar cuota y total juntos desde la ficha.",
    },
  },
];

// ---------------------------------------------------------------------------
// Fechas relativas al día de carga

const at = (date: IsoDate, hourUtc: number) => `${date}T${String(hourUtc).padStart(2, "0")}:00:00Z`;

export interface DemoPlan {
  program: {
    name: string;
    description: string;
    start_date: IsoDate;
    end_date: IsoDate;
    horizons: { name: string; start_date: IsoDate; end_date: IsoDate }[];
  };
  calendar: { type: CalendarEventType; name: string; start_date: IsoDate; end_date: IsoDate }[];
  /** Lunes de la primera semana con valores (= inicio del programa). */
  weeksFrom: IsoDate;
  experimentDates: Record<DemoExperimentKey, DemoExperimentDates>;
}

/**
 * Todas las fechas del ejemplo a partir de `today` (YYYY-MM-DD, Bogotá):
 *  · Programa: arrancó el lunes de hace 12 semanas; los 12 valores semanales
 *    terminan en la última semana completa.
 *  · Ejercicio 1 (escalado): corrió 35 días y se decidió hace ~3 semanas.
 *  · Ejercicio 3 (perdedor): corrió 28 días y se decidió hace ~9 días.
 *  · Ejercicio 2 (en prueba): empezó hace 10 días; mínimo 21, termina en 4
 *    semanas, antes del primer congelamiento.
 *  · Picos y congelamientos en los próximos meses; el punto de decisión después.
 */
export function buildDemoPlan(today: IsoDate): DemoPlan {
  const start = addDays(weekStart(today), -7 * DEMO_WEEKS);
  const d = (offset: number) => addDays(today, offset);
  const decisionPoint = weekStart(d(112));
  const h1End = addDays(decisionPoint, 6);
  const end = addDays(decisionPoint, 100);

  return {
    program: {
      ...DEMO_PROGRAM_TEXT,
      start_date: start,
      end_date: end,
      horizons: [
        { name: "H1", start_date: start, end_date: h1End },
        { name: "H2", start_date: addDays(h1End, 1), end_date: end },
      ],
    },
    calendar: [
      { type: "peak", name: "Pico de descuentos (tipo Black Friday–Cyber)", start_date: d(56), end_date: d(59) },
      { type: "freeze", name: "Congelamiento pico 1", start_date: d(52), end_date: d(65) },
      { type: "peak", name: "Temporada alta de ventas", start_date: d(77), end_date: d(94) },
      { type: "freeze", name: "Congelamiento de temporada alta", start_date: d(77), end_date: d(97) },
      { type: "decision", name: "Punto de decisión", start_date: decisionPoint, end_date: decisionPoint },
    ],
    weeksFrom: start,
    experimentDates: {
      e1: {
        planned_start: d(-56),
        planned_end: d(-22),
        actual_start: d(-56),
        actual_end: d(-22),
        timestamps: { design_locked_at: at(d(-56), 13), decided_at: at(d(-20), 15), status_changed_at: at(d(-19), 15) },
      },
      e2: {
        planned_start: d(-10),
        planned_end: d(17),
        actual_start: d(-10),
        actual_end: null,
        timestamps: { design_locked_at: at(d(-10), 13), status_changed_at: at(d(-10), 13), decided_at: null },
      },
      e3: {
        planned_start: d(-38),
        planned_end: d(-11),
        actual_start: d(-38),
        actual_end: d(-11),
        timestamps: { design_locked_at: at(d(-38), 13), decided_at: at(d(-9), 15), status_changed_at: at(d(-9), 15) },
      },
    },
  };
}
