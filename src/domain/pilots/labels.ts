// Textos visibles del módulo Pilotos (glosario en docs/pilotos/plan.md §3).
// Se reutilizan los términos de Arriero donde ya existen.
import type {
  ChecklistPlatform,
  ChecklistStatus,
  MeasurementSource,
  MediaDataMode,
  PilotMetricCalc,
  PilotMetricScope,
  PilotRole,
  PilotStatus,
  PilotTestType,
  PilotUnit,
  VariableCategory,
} from "./types";

export const PILOT_ROLE_LABEL: Record<PilotRole, string> = {
  approver: "Aprobador",
  creator: "Creador",
  reader: "Lector",
};

export const PILOT_ROLE_DESCRIPTION: Record<PilotRole, string> = {
  approver: "Aprueba o devuelve diseños, firma decisiones, edita catálogos y asigna roles.",
  creator: "Crea y edita pilotos en borrador, carga datos y registra incidentes.",
  reader: "Ve pilotos, resultados y aprendizajes, sin editar.",
};

export const PILOT_STATUS_LABEL: Record<PilotStatus, string> = {
  draft: "Borrador",
  in_review: "En revisión",
  approved: "Aprobado",
  in_test: "En prueba",
  in_reading: "En lectura",
  decided: "Decidido",
  cancelled: "Cancelado",
};

export const PILOT_TEST_TYPE_LABEL: Record<PilotTestType, string> = {
  ab_creative: "A/B de creatividades",
  ab_platform: "A/B en plataforma",
  holdout: "Holdout (grupo sin anuncios)",
  geo: "Por geografía",
  pre_post: "Antes / después",
};

export const PILOT_TEST_TYPE_HELP: Record<PilotTestType, string> = {
  ab_creative: "Dos o más piezas compiten con el mismo público y el mismo presupuesto. Sirve para formatos, ganchos, mensajes, CTA y copy.",
  ab_platform: "La plataforma divide el público en grupos que no se cruzan. Sirve para audiencias, pujas, placements, estructura y destinos.",
  holdout: "Una parte del público no ve la campaña; la diferencia es lo que la campaña de verdad aporta (incrementalidad).",
  geo: "Unas ciudades reciben el cambio y otras no. Ideal cuando la venta pasa fuera de la plataforma, como en WhatsApp.",
  pre_post: "Se compara antes y después contra una serie de control. Es el último recurso: la evidencia es débil.",
};

/** Qué pide cada tipo de prueba al configurarlo. */
export const PILOT_TEST_TYPE_SETUP: Record<PilotTestType, string> = {
  ab_creative: "Variantes (2 a N) y reparto del presupuesto.",
  ab_platform: "Variantes y reparto del tráfico.",
  holdout: "Porcentaje de holdout: qué parte del público se queda sin ver la campaña.",
  geo: "Ciudades de prueba, ciudades de control y periodo previo para comparar.",
  pre_post: "Serie de control y periodo previo.",
};

export const WEAK_EVIDENCE_LABEL = "Evidencia débil";

export const VARIABLE_CATEGORY_LABEL: Record<VariableCategory, string> = {
  creative: "Creatividad",
  audience: "Audiencia",
  structure: "Estructura y puja",
  placements: "Placements",
  destination: "Destino post-clic",
  channel: "Canal y mix",
  investment: "Inversión",
  signal: "Señal y medición",
  offer: "Oferta comercial",
};

export const MEDIA_DATA_MODE_LABEL: Record<MediaDataMode, string> = {
  manual: "Manual",
  mcp: "Conectado",
};

export const METRIC_CALC_LABEL: Record<PilotMetricCalc, string> = {
  sum: "Se carga (suma)",
  rate: "Tasa",
  cost_per: "Costo por unidad",
};

export const METRIC_SCOPE_LABEL: Record<PilotMetricScope, string> = {
  platform: "De plataforma",
  business: "De negocio",
};

export const PILOT_UNIT_LABEL: Record<PilotUnit, string> = {
  count: "Cantidad",
  cop: "Pesos (COP)",
  percent: "Porcentaje",
};

export const MEASUREMENT_SOURCE_LABEL: Record<MeasurementSource, string> = {
  manual: "Manual",
  csv: "CSV",
  mcp: "Integración",
};

export const CHECKLIST_PLATFORM_LABEL: Record<ChecklistPlatform, string> = {
  ga4: "GA4",
  gtm: "GTM",
  pixel: "Píxel",
  capi: "CAPI",
  other: "Otro",
};

export const CHECKLIST_STATUS_LABEL: Record<ChecklistStatus, string> = {
  pending: "Por verificar",
  ok: "Dispara bien",
  failed: "No dispara",
};

export const PLATFORM_METRIC_WARNING = "Esta métrica mide eficiencia en plataforma, no venta incremental.";

/** Explicaciones cortas de los términos técnicos (se muestran con InfoTip). */
export const PILOT_TERMS = {
  guardrail: {
    label: "Guardrail (métrica de cuidado)",
    simple: "Lo que no se puede dañar mientras se prueba. Ej.: el costo por conversación no sube más de 15 %.",
  },
  mde: {
    label: "MDE (efecto mínimo detectable)",
    simple: "El cambio más pequeño que esta prueba alcanza a ver. Si espera menos que esto, la prueba no lo va a notar.",
  },
  power: {
    label: "Potencia",
    simple: "Probabilidad de ver el efecto si de verdad existe. Lo normal es 80 %.",
  },
  alpha: {
    label: "Nivel de significancia (α)",
    simple: "Qué tanto riesgo aceptamos de ver un efecto que no existe. Lo normal es 5 %.",
  },
  lift: {
    label: "Diferencia vs. control (lift)",
    simple: "Cuánto mejor (o peor) le fue a la variante frente al control, en porcentaje.",
  },
  probabilityToWin: {
    label: "Probabilidad de ganar",
    simple: "Qué tan seguros estamos de que la variante le gana al control, con los datos que hay (modelo bayesiano).",
  },
  probabilityBest: {
    label: "Probabilidad de ser la mejor",
    simple: "Con varias variantes: qué tan seguros estamos de que cada una es la mejor de todas.",
  },
  credibleInterval: {
    label: "Rango probable (90 %)",
    simple: "Entre estos valores está, con 90 % de probabilidad, el efecto real.",
  },
  did: {
    label: "Diferencias en diferencias",
    simple: "Compara cuánto cambiaron las ciudades de prueba frente a cuánto cambiaron las de control en el mismo tiempo.",
  },
  placebo: {
    label: "Prueba placebo",
    simple: "Se hace de cuenta que una ciudad de control recibió el cambio. Si el efecto real es más grande que esos placebos, es creíble.",
  },
  syntheticControl: {
    label: "Control sintético",
    simple: "Una mezcla de ciudades de control que se parece a las de prueba antes del cambio; sirve de comparación más justa.",
  },
  holdout: {
    label: "Holdout",
    simple: "El grupo que no ve la campaña. Lo que vende ese grupo es lo que se vendería sin anuncios.",
  },
  incremental: {
    label: "Costo por resultado incremental",
    simple: "Cuánto costó cada venta que no habría pasado sin la campaña.",
  },
  decisionRules: {
    label: "Reglas de decisión",
    simple: "Qué resultado lleva a escalar, ajustar o apagar. Se escriben antes de lanzar para no acomodarlas después.",
  },
  checklist: {
    label: "Lista de chequeo de medición",
    simple: "Los eventos que tienen que disparar bien (GA4, GTM, píxel o CAPI) antes de lanzar. Sin medición, no hay lectura.",
  },
  designLock: {
    label: "Bloqueo del diseño",
    simple: "Desde que se aprueba, la hipótesis, las métricas, las reglas y los grupos no se cambian. Lo que pase se registra como incidente.",
  },
} as const;

export type PilotTermKey = keyof typeof PILOT_TERMS;
