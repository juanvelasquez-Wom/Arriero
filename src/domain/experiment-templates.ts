// Plantillas de ejercicios por palanca (telco). Llenan solo lo que está vacío:
// nunca pisan lo que la persona ya escribió.
import type { MetricDirection, TestType } from "./types";

export interface ExperimentTemplate {
  key: string;
  name: string;
  description: string;
  /** `{metrica}` se reemplaza por el nombre de la métrica del árbol. */
  title: string;
  hypothesis_if: string;
  hypothesis_then: string;
  hypothesis_because: string;
  test_type: TestType;
  min_duration_days: number;
  /** Cambio relativo mínimo (en %) que usa la regla de decisión. */
  min_lift_pct: number;
  /** La primera es el control. */
  variants: string[];
}

export const EXPERIMENT_TEMPLATES: readonly ExperimentTemplate[] = [
  {
    key: "creative",
    name: "Creatividad en pauta",
    description: "Nuevos creativos o formatos en Meta, Google o TikTok contra los de siempre.",
    title: "Creatividad nueva en pauta para {metrica}",
    hypothesis_if: "reemplazamos los creativos actuales de [campaña] por [nuevo concepto o formato]",
    hypothesis_then: "mejora {metrica}",
    hypothesis_because: "se corta la fatiga creativa y el mensaje conecta mejor con [audiencia]",
    test_type: "ab",
    min_duration_days: 14,
    min_lift_pct: 10,
    variants: ["Creativos actuales", "Creativos nuevos"],
  },
  {
    key: "message",
    name: "Mensaje u oferta por WhatsApp o CRM",
    description: "Cambiar el texto, la oferta o el momento de un envío a la base.",
    title: "Mensaje nuevo por WhatsApp para {metrica}",
    hypothesis_if: "enviamos a [segmento] el mensaje [nuevo texto u oferta] en [momento]",
    hypothesis_then: "mejora {metrica}",
    hypothesis_because: "el cliente recibe una razón clara para actuar en el momento justo",
    test_type: "ab",
    min_duration_days: 14,
    min_lift_pct: 10,
    variants: ["Mensaje actual", "Mensaje nuevo"],
  },
  {
    key: "price",
    name: "Precio o cuotas",
    description: "Presentar el precio de otra forma: cuotas, descuento, bono o precio ancla.",
    title: "Precio en cuotas para {metrica}",
    hypothesis_if: "mostramos el precio de [producto] como [cuota mensual, descuento o bono]",
    hypothesis_then: "mejora {metrica}",
    hypothesis_because: "el precio se percibe más accesible y baja la barrera de compra",
    test_type: "ab",
    min_duration_days: 21,
    min_lift_pct: 10,
    variants: ["Precio actual", "Precio en cuotas"],
  },
  {
    key: "cro",
    name: "Ficha o landing (CRO)",
    description: "Cambios en la página: orden, textos, botón, formulario o pasos del checkout.",
    title: "Mejora de la ficha o landing para {metrica}",
    hypothesis_if: "cambiamos [elemento de la página] por [nueva versión]",
    hypothesis_then: "más visitas terminan en compra y mejora {metrica}",
    hypothesis_because: "se quita una fricción que hoy frena a [tipo de cliente]",
    test_type: "ab",
    min_duration_days: 14,
    min_lift_pct: 8,
    variants: ["Página actual", "Página nueva"],
  },
  {
    key: "recurrence",
    name: "Recordatorio de recurrencia",
    description: "Recordar la recarga, el pago o la renovación antes de que el cliente se enfríe.",
    title: "Recordatorio de recurrencia para {metrica}",
    hypothesis_if: "enviamos un recordatorio a los [N] días de [última recarga o compra] con [sugerencia]",
    hypothesis_then: "mejora {metrica}",
    hypothesis_because: "el cliente se acuerda a tiempo y no se va con la competencia",
    test_type: "ab",
    min_duration_days: 28,
    min_lift_pct: 10,
    variants: ["Sin recordatorio", "Con recordatorio"],
  },
  {
    key: "audience",
    name: "Audiencia o canal nuevo",
    description: "Probar un público, una ciudad o un canal que todavía no se trabaja.",
    title: "Audiencia o canal nuevo para {metrica}",
    hypothesis_if: "llevamos [la oferta] a [nueva audiencia, ciudad o canal]",
    hypothesis_then: "mejora {metrica} sin subir el costo",
    hypothesis_because: "hay demanda sin atender en [audiencia o canal]",
    test_type: "geo",
    min_duration_days: 28,
    min_lift_pct: 10,
    variants: ["Zona o canal actual", "Zona o canal nuevo"],
  },
];

export function findTemplate(key: string): ExperimentTemplate | undefined {
  return EXPERIMENT_TEMPLATES.find((t) => t.key === key);
}

/** Regla de decisión sugerida, con la dirección de la métrica. */
export function decisionRuleTemplate(metricName: string | null | undefined, direction: MetricDirection = "up", minLiftPct = 10): string {
  const metric = metricName?.trim() || "la métrica principal";
  const verb = direction === "down" ? "baja" : "sube";
  const pct = Number.isFinite(minLiftPct) && minLiftPct > 0 ? Math.round(minLiftPct * 10) / 10 : 10;
  return `Gana si ${metric} ${verb} al menos ${String(pct).replace(".", ",")} % frente al control, sin empeorar las métricas de control.`;
}

export interface TemplateVariant {
  id?: string;
  name: string;
  is_control: boolean;
  description: string;
}

export interface TemplateTarget {
  title: string;
  hypothesis_if: string;
  hypothesis_then: string;
  hypothesis_because: string;
  test_type: TestType | null;
  min_duration_days: number | null;
  decision_rule: string;
  variants: TemplateVariant[];
}

export type TemplateField = keyof TemplateTarget;

const DEFAULT_VARIANT_NAME = /^(Control|Variante [A-Z])$/;

/** Las variantes siguen como vienen por defecto (nombres automáticos, sin descripción). */
export function variantsAreDefault(variants: TemplateVariant[]): boolean {
  return variants.every((v) => DEFAULT_VARIANT_NAME.test(v.name.trim()) && !v.description.trim());
}

/**
 * Aplica la plantilla solo a los campos vacíos. Devuelve los valores nuevos y la
 * lista de campos que llenó (para avisarle a la persona).
 */
export function applyTemplate<T extends TemplateTarget>(
  values: T,
  template: ExperimentTemplate,
  context: { metricName?: string | null; direction?: MetricDirection } = {},
): { values: T; filled: TemplateField[] } {
  const metric = context.metricName?.trim() || "la métrica";
  const fill = (s: string) => s.replaceAll("{metrica}", metric);
  const next: T = { ...values };
  const filled: TemplateField[] = [];

  const texts = ["title", "hypothesis_if", "hypothesis_then", "hypothesis_because"] as const;
  for (const k of texts) {
    if (!values[k].trim()) {
      next[k] = fill(template[k]) as T[typeof k];
      filled.push(k);
    }
  }
  if (!values.test_type) {
    next.test_type = template.test_type;
    filled.push("test_type");
  }
  if (values.min_duration_days == null) {
    next.min_duration_days = template.min_duration_days;
    filled.push("min_duration_days");
  }
  if (!values.decision_rule.trim()) {
    next.decision_rule = decisionRuleTemplate(context.metricName, context.direction, template.min_lift_pct);
    filled.push("decision_rule");
  }
  if (variantsAreDefault(values.variants)) {
    const variants: TemplateVariant[] = template.variants.map((name, i) => ({
      ...(values.variants[i] ?? { description: "" }),
      name,
      is_control: i === 0,
    }));
    // Las variantes de más que ya existían se conservan (no se borra nada).
    for (const extra of values.variants.slice(template.variants.length)) variants.push({ ...extra, is_control: false });
    next.variants = variants;
    filled.push("variants");
  }
  return { values: next, filled };
}
