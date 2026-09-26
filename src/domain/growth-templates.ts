// Plantillas de telecomunicaciones y reglas de propuesta del asistente de
// configuración (horizontes a partir del punto de decisión, congelamientos
// alrededor de los picos). Todo editable por el usuario.
import { addDays } from "./dates";
import type { IsoDate, MetricBranch, MetricDirection } from "./types";

export interface MetricSuggestion {
  name: string;
  unit: string;
  direction: MetricDirection;
  definition: string;
}

export interface LineTemplate {
  key: string;
  name: string;
  summary: string;
  northStar: MetricSuggestion;
  efficiency: MetricSuggestion;
  tree: Record<MetricBranch, MetricSuggestion[]>;
  /** Qué significa cada etapa del embudo en esta línea y qué métrica la mide. */
  funnel: Record<(typeof DEFAULT_STAGES)[number], { description: string; metric?: string }>;
}

export const DEFAULT_STAGES = ["Adquisición", "Activación", "Conversión", "Recuperación y recurrencia"] as const;

const m = (name: string, unit: string, direction: MetricDirection, definition: string): MetricSuggestion => ({
  name,
  unit,
  direction,
  definition,
});

export const TELCO_TEMPLATES: LineTemplate[] = [
  {
    key: "pospago",
    name: "Pospago",
    summary: "Planes con factura mensual vendidos por eCommerce y WhatsApp.",
    northStar: m("Altas digitales semanales", "altas", "up", "Nuevas líneas pospago vendidas por canales digitales en la semana."),
    efficiency: m("Costo por alta", "COP", "down", "Inversión en medios de la línea dividida entre las altas digitales."),
    tree: {
      demand_volume: [
        m("Conversaciones iniciadas en WhatsApp", "conversaciones", "up", "Personas que abren una conversación desde un anuncio o el sitio."),
        m("Costo por conversación", "COP", "down", "Inversión en anuncios Click-to-WhatsApp dividida entre las conversaciones."),
        m("Visitas a la página de planes", "visitas", "up", "Sesiones que llegan a la página de planes pospago."),
      ],
      conversion: [
        m("Tasa de conversación a venta", "%", "up", "Porcentaje de conversaciones que terminan en una alta."),
        m("Checkout completado", "%", "up", "Porcentaje de quienes empiezan el checkout y lo terminan."),
        m("Aprobación de validación de identidad", "%", "up", "Porcentaje de clientes que pasan la validación de identidad."),
      ],
      efficiency: [m("Costo por lead", "COP", "down", "Inversión dividida entre los contactos calificados.")],
      recovery_recurrence: [
        m("Checkouts abandonados recuperados", "%", "up", "Porcentaje de abandonos del checkout que se rescatan (p. ej. por WhatsApp)."),
      ],
    },
    funnel: {
      Adquisición: { description: "La persona ve un anuncio o llega al eCommerce y abre una conversación.", metric: "Conversaciones iniciadas en WhatsApp" },
      Activación: { description: "Explora planes, pide información o empieza el checkout.", metric: "Visitas a la página de planes" },
      Conversión: { description: "Completa la compra: validación de identidad, pago y activación de la línea.", metric: "Tasa de conversación a venta" },
      "Recuperación y recurrencia": { description: "Rescate de quienes abandonan el checkout o la conversación.", metric: "Checkouts abandonados recuperados" },
    },
  },
  {
    key: "portabilidad",
    name: "Portabilidad prepago",
    summary: "Clientes de otros operadores que se pasan con su mismo número.",
    northStar: m("Portaciones digitales semanales", "portaciones", "up", "Portaciones prepago completadas por canales digitales en la semana."),
    efficiency: m("Costo por portación", "COP", "down", "Inversión en medios de la línea dividida entre las portaciones completadas."),
    tree: {
      demand_volume: [
        m("Solicitudes de portación iniciadas", "solicitudes", "up", "Personas que empiezan el proceso de portación en línea."),
        m("Costo por conversación", "COP", "down", "Inversión en anuncios dividida entre las conversaciones iniciadas."),
      ],
      conversion: [
        m("Portaciones aprobadas sobre solicitadas", "%", "up", "Porcentaje de solicitudes que terminan en portación exitosa."),
        m("Tiempo de portación", "días", "down", "Días promedio entre la solicitud y la línea activa."),
      ],
      efficiency: [m("Costo por solicitud", "COP", "down", "Inversión dividida entre las solicitudes de portación.")],
      recovery_recurrence: [m("Portaciones rechazadas rescatadas", "%", "up", "Porcentaje de solicitudes rechazadas que se recuperan.")],
    },
    funnel: {
      Adquisición: { description: "La persona ve la oferta de portación y llega al canal digital.", metric: "Costo por conversación" },
      Activación: { description: "Empieza la solicitud de portación con sus datos.", metric: "Solicitudes de portación iniciadas" },
      Conversión: { description: "La portación se aprueba y la línea queda activa.", metric: "Portaciones aprobadas sobre solicitadas" },
      "Recuperación y recurrencia": { description: "Rescate de solicitudes rechazadas o abandonadas.", metric: "Portaciones rechazadas rescatadas" },
    },
  },
  {
    key: "recargas",
    name: "Recargas y paquetes",
    summary: "Recargas de saldo y compra de paquetes en canales digitales.",
    northStar: m("Clientes con recarga digital recurrente", "clientes", "up", "Clientes con dos o más recargas digitales en los últimos 30 días."),
    efficiency: m("Costo por recarga digital", "COP", "down", "Inversión dividida entre las recargas digitales."),
    tree: {
      demand_volume: [
        m("Primeras recargas digitales", "recargas", "up", "Clientes que recargan por primera vez en un canal digital."),
        m("Visitas al canal de recargas", "visitas", "up", "Sesiones que llegan a la página o app de recargas."),
      ],
      conversion: [
        m("Recargas completadas sobre iniciadas", "%", "up", "Porcentaje de recargas iniciadas que se pagan."),
        m("Compra de paquete sobre recarga", "%", "up", "Porcentaje de recargas que incluyen un paquete."),
      ],
      efficiency: [m("Costo por recarga", "COP", "down", "Inversión dividida entre las recargas digitales.")],
      recovery_recurrence: [
        m("Tasa de segunda recarga a 30 días", "%", "up", "Porcentaje de clientes que recargan de nuevo dentro de los 30 días."),
        m("Clientes reactivados", "clientes", "up", "Clientes sin recargar en 60 días que vuelven a hacerlo."),
      ],
    },
    funnel: {
      Adquisición: { description: "El cliente llega al canal digital de recargas.", metric: "Visitas al canal de recargas" },
      Activación: { description: "Hace su primera recarga digital.", metric: "Primeras recargas digitales" },
      Conversión: { description: "Completa el pago de la recarga o del paquete.", metric: "Recargas completadas sobre iniciadas" },
      "Recuperación y recurrencia": { description: "Vuelve a recargar: la recurrencia es el crecimiento de esta línea.", metric: "Tasa de segunda recarga a 30 días" },
    },
  },
  {
    key: "equipos",
    name: "Equipos móviles",
    summary: "Venta de celulares por eCommerce, de contado o en cuotas.",
    northStar: m("Equipos vendidos por eCommerce semanales", "unidades", "up", "Unidades vendidas en la tienda en línea en la semana."),
    efficiency: m("Costo por venta de equipo", "COP", "down", "Inversión en medios dividida entre las unidades vendidas."),
    tree: {
      demand_volume: [
        m("Visitas a fichas de equipos", "visitas", "up", "Sesiones que ven la ficha de un equipo."),
        m("Tráfico pagado al eCommerce", "visitas", "up", "Sesiones que llegan desde anuncios."),
      ],
      conversion: [
        m("Ficha a carrito", "%", "up", "Porcentaje de visitas a la ficha que agregan el equipo al carrito."),
        m("Carrito a compra de equipo", "%", "up", "Porcentaje de carritos con un equipo que terminan en compra."),
      ],
      efficiency: [m("Costo por venta", "COP", "down", "Inversión dividida entre las ventas de equipos.")],
      recovery_recurrence: [m("Carritos abandonados recuperados", "%", "up", "Porcentaje de carritos abandonados que se rescatan.")],
    },
    funnel: {
      Adquisición: { description: "La persona llega a la tienda en línea desde un anuncio o búsqueda.", metric: "Tráfico pagado al eCommerce" },
      Activación: { description: "Ve la ficha del equipo y lo agrega al carrito.", metric: "Ficha a carrito" },
      Conversión: { description: "Paga el equipo en el checkout.", metric: "Carrito a compra de equipo" },
      "Recuperación y recurrencia": { description: "Rescate de carritos abandonados.", metric: "Carritos abandonados recuperados" },
    },
  },
];

/** Sugerencias para una línea propia (sin plantilla). */
export const GENERIC_TEMPLATE: LineTemplate = {
  key: "generica",
  name: "",
  summary: "",
  northStar: m("Ventas digitales semanales", "ventas", "up", "Ventas cerradas por canales digitales en la semana."),
  efficiency: m("Costo por venta", "COP", "down", "Inversión en medios dividida entre las ventas digitales."),
  tree: {
    demand_volume: [m("Visitas o conversaciones iniciadas", "visitas", "up", "Personas que llegan al canal digital.")],
    conversion: [m("Tasa de conversión", "%", "up", "Porcentaje de visitas o conversaciones que terminan en venta.")],
    efficiency: [m("Costo por lead", "COP", "down", "Inversión dividida entre los contactos calificados.")],
    recovery_recurrence: [m("Clientes que vuelven a comprar", "%", "up", "Porcentaje de clientes que repiten la compra.")],
  },
  funnel: {
    Adquisición: { description: "La persona llega al canal digital." },
    Activación: { description: "Muestra intención: explora, pregunta o empieza la compra." },
    Conversión: { description: "Completa la compra." },
    "Recuperación y recurrencia": { description: "Rescate de abandonos y compras repetidas." },
  },
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Plantilla que corresponde a una línea por su nombre (o la genérica). */
export function templateForLine(lineName: string): LineTemplate {
  const n = normalize(lineName);
  return TELCO_TEMPLATES.find((t) => normalize(t.name) === n || n.includes(t.key)) ?? GENERIC_TEMPLATE;
}

// -----------------------------------------------------------------------------
// Propuestas del calendario
// -----------------------------------------------------------------------------

/** Días de congelamiento sugeridos antes y después de un pico. */
export const FREEZE_BEFORE_DAYS = 4;
export const FREEZE_AFTER_DAYS = 6;

/** Congelamiento propuesto para un pico: unos días antes y después. */
export function suggestFreeze(
  peak: { start_date: IsoDate; end_date: IsoDate },
  before = FREEZE_BEFORE_DAYS,
  after = FREEZE_AFTER_DAYS,
): { start_date: IsoDate; end_date: IsoDate } {
  return { start_date: addDays(peak.start_date, -before), end_date: addDays(peak.end_date, after) };
}

export interface ProposedHorizon {
  name: string;
  start_date: IsoDate;
  end_date: IsoDate;
}

/**
 * Horizontes propuestos: H1 desde el inicio del programa hasta el punto de
 * decisión y H2 desde el día siguiente hasta el fin. Sin punto de decisión (o
 * fuera del rango), un único H1 que cubre todo el programa.
 */
export function proposeHorizons(start: IsoDate, end: IsoDate, decision: IsoDate | null): ProposedHorizon[] {
  if (!decision || decision <= start || decision >= end) {
    return [{ name: "H1", start_date: start, end_date: end }];
  }
  return [
    { name: "H1", start_date: start, end_date: decision },
    { name: "H2", start_date: addDays(decision, 1), end_date: end },
  ];
}

/** Verifica que los horizontes queden dentro del programa y no se crucen. */
export function horizonProblems(program: { start: IsoDate; end: IsoDate }, horizons: ProposedHorizon[]): string[] {
  const problems: string[] = [];
  const sorted = [...horizons].sort((a, b) => a.start_date.localeCompare(b.start_date));
  for (const h of sorted) {
    if (h.end_date < h.start_date) problems.push(`${h.name}: la fecha de fin es anterior al inicio.`);
    if (h.start_date < program.start || h.end_date > program.end) problems.push(`${h.name} se sale de las fechas del programa.`);
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start_date <= sorted[i - 1].end_date) problems.push(`${sorted[i - 1].name} y ${sorted[i].name} se cruzan.`);
  }
  return problems;
}
