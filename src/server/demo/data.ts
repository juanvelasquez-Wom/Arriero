// Programa de ejemplo "Programa demo · Telco Andina". TODOS LOS DATOS SON INVENTADOS.
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
} from "@/domain/types";

export const DEMO_PROGRAM = {
  name: "Programa demo · Telco Andina",
  description:
    "Programa de ejemplo con datos inventados: tres líneas, calendario de picos y tres ejercicios en estados distintos para recorrer la app.",
  start_date: "2026-08-01",
  end_date: "2027-04-30",
  horizons: [
    { name: "H1", start_date: "2026-08-01", end_date: "2027-01-24" },
    { name: "H2", start_date: "2027-01-25", end_date: "2027-04-30" },
  ],
};

export const DEMO_CALENDAR: { type: CalendarEventType; name: string; start_date: string; end_date: string }[] = [
  { type: "peak", name: "Black Friday–Cyber", start_date: "2026-11-27", end_date: "2026-11-30" },
  { type: "freeze", name: "Congelamiento pico 1", start_date: "2026-11-23", end_date: "2026-12-06" },
  { type: "peak", name: "Temporada decembrina", start_date: "2026-12-14", end_date: "2026-12-31" },
  { type: "freeze", name: "Congelamiento decembrino", start_date: "2026-12-14", end_date: "2027-01-03" },
  { type: "decision", name: "Punto de decisión", start_date: "2027-01-18", end_date: "2027-01-18" },
];

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
  /** 12 valores semanales: 3 ago – 19 oct 2026. */
  weekly: number[];
}

export const DEMO_WEEKS_FROM = "2026-08-03";

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
    weekly: [425, 418, 410, 402, 398, 395, 390, 392, 396, 408, 421, 433],
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
    weekly: [184000, 186500, 189000, 192000, 195500, 198000, 201000, 200500, 199000, 193000, 187500, 181000],
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
    weekly: [9800, 10200, 10700, 11300, 11900, 12600, 13200, 13300, 13250, 12400, 11500, 10900],
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
    weekly: [12000, 12050, 11980, 12100, 12080, 12150, 12400, 12900, 13300, 13700, 14050, 14300],
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
    weekly: [18.0, 17.8, 18.2, 18.1, 17.9, 18.3, 18.1, 19.6, 20.4, 21.1, 21.6, 22.0],
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
  planned_start: string;
  planned_end: string;
  actual_start: string;
  actual_end: string | null;
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
  /** Marcas de tiempo históricas (se ajustan después de las transiciones). */
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
    planned_start: "2026-08-10",
    planned_end: "2026-09-13",
    actual_start: "2026-08-10",
    actual_end: "2026-09-13",
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
    timestamps: {
      design_locked_at: "2026-08-10T13:00:00Z",
      decided_at: "2026-09-14T15:00:00Z",
      status_changed_at: "2026-09-15T15:00:00Z",
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
    planned_start: "2026-10-05",
    planned_end: "2026-11-01",
    actual_start: "2026-10-05",
    actual_end: null,
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
    timestamps: { design_locked_at: "2026-10-05T13:00:00Z", status_changed_at: "2026-10-05T13:00:00Z", decided_at: null },
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
    planned_start: "2026-08-31",
    planned_end: "2026-09-27",
    actual_start: "2026-08-31",
    actual_end: "2026-09-27",
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
    timestamps: {
      design_locked_at: "2026-08-31T13:00:00Z",
      decided_at: "2026-09-28T15:00:00Z",
      status_changed_at: "2026-09-28T15:00:00Z",
    },
  },
];
