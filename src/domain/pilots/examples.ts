// Tres pilotos de ejemplo, inventados y marcados como ejemplo, con fechas
// relativas al día en que se cargan. Los datos salen de un generador con
// semilla: siempre dan la misma lectura. Se borran con un clic.
import { addDays, weekStart } from "../dates";
import type { IsoDate } from "../types";
import { mulberry32, normal } from "./random";
import { DEFAULT_DECISION_RULES, type ChecklistPlatform, type DecisionRules, type PilotStatus, type PilotTestType, type PowerInputs } from "./types";
import type { Decision, ImpactLevel, Verdict } from "../types";

export interface ExampleArm {
  key: string;
  name: string;
  is_control: boolean;
  split_pct: number | null;
  cities: string[];
}

export interface ExampleValue {
  arm: string;
  metric: string;
  unit_label: string;
  period_start: IsoDate;
  value: number;
}

export interface ExamplePilot {
  title: string;
  status: PilotStatus;
  problem: string;
  problem_evidence: string;
  hypothesis_change: string;
  hypothesis_scope: string;
  hypothesis_metric: string;
  hypothesis_expected_pct: number;
  hypothesis_reason: string;
  /** Nombre de la variable en el catálogo. */
  variable: string;
  test_type: PilotTestType;
  design_config: { granularity: "day" | "week"; pre_start?: IsoDate; holdout_pct?: number; notes?: string };
  /** Nombres de métricas del catálogo. */
  primary_metric: string;
  guardrails: { metric: string; limit_pct: number }[];
  power_inputs: PowerInputs;
  decision_rules: DecisionRules;
  planned_start: IsoDate;
  planned_end: IsoDate;
  actual_start: IsoDate | null;
  actual_end: IsoDate | null;
  planned_budget_cop: number;
  media: { media: string; account: string; campaign: string; audience: string | null; destination: string; cities: string[] }[];
  arms: ExampleArm[];
  checklist: { platform: ChecklistPlatform; event_name: string; evidence: string }[];
  incidents: { occurred_on: IsoDate; description: string; expected_impact: ImpactLevel }[];
  values: ExampleValue[];
  decision?: { verdict: Verdict; decision: Decision; justification: string; learning: string };
}

const days = (from: IsoDate, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const r0 = (x: number) => Math.max(0, Math.round(x));

/** Serie diaria con ruido: base × (1 + cv·N(0,1)). */
function noisy(rng: () => number, base: number, cv: number) {
  return base * (1 + cv * normal(rng));
}

export function buildExamplePilots(today: IsoDate): ExamplePilot[] {
  const rng = mulberry32(20261001);

  // 1 · A/B de creatividades en CTWA: video UGC vs. estático (decidido: escalar).
  const s1 = addDays(today, -45);
  const e1 = addDays(s1, 27);
  const v1: ExampleValue[] = [];
  for (const d of days(s1, 28)) {
    for (const [arm, rate, conv] of [
      ["control", 0.058, 410],
      ["ugc", 0.071, 400],
    ] as const) {
      const c = r0(noisy(rng, conv, 0.12));
      v1.push({ arm, metric: "Conversaciones iniciadas", unit_label: "", period_start: d, value: c });
      v1.push({ arm, metric: "Ventas", unit_label: "", period_start: d, value: r0(c * noisy(rng, rate, 0.15)) });
      v1.push({ arm, metric: "Inversión", unit_label: "", period_start: d, value: r0(noisy(rng, 1_150_000, 0.05)) });
    }
  }

  // 2 · Geo: +40 % de inversión en ciudades intermedias (en prueba).
  const s2 = weekStart(addDays(today, -21));
  const pre2 = addDays(s2, -35);
  const e2 = addDays(s2, 41);
  const testCities = ["Pereira", "Manizales", "Armenia"];
  const controlCities = ["Ibagué", "Neiva", "Villavicencio", "Popayán"];
  const v2: ExampleValue[] = [];
  const cityBase: Record<string, number> = { Pereira: 210, Manizales: 180, Armenia: 150, Ibagué: 190, Neiva: 160, Villavicencio: 200, Popayán: 140 };
  for (let w = 0; w < 8; w++) {
    const monday = addDays(pre2, w * 7);
    if (monday > today) break;
    const post = monday >= s2;
    for (const city of [...testCities, ...controlCities]) {
      const isTest = testCities.includes(city);
      const trend = 1 + 0.01 * w;
      const lift = isTest && post ? 1.13 : 1;
      const arm = isTest ? "test" : "control";
      v2.push({ arm, metric: "Ventas", unit_label: city, period_start: monday, value: r0(noisy(rng, cityBase[city] * trend * lift, 0.05)) });
      const spend = cityBase[city] * 28_000 * (isTest && post ? 1.4 : 1);
      v2.push({ arm, metric: "Inversión", unit_label: city, period_start: monday, value: r0(noisy(rng, spend, 0.03)) });
    }
  }

  // 3 · A/B en plataforma: CTWA directo vs. landing hacia WhatsApp (en lectura).
  const s3 = addDays(today, -35);
  const e3 = addDays(s3, 27);
  const v3: ExampleValue[] = [];
  for (const d of days(s3, 28)) {
    for (const [arm, conv, rate, spend] of [
      ["directo", 520, 0.052, 1_400_000],
      ["landing", 380, 0.082, 1_400_000],
    ] as const) {
      const c = r0(noisy(rng, conv, 0.1));
      v3.push({ arm, metric: "Ventas", unit_label: "", period_start: d, value: r0(c * noisy(rng, rate, 0.18)) });
      v3.push({ arm, metric: "Inversión", unit_label: "", period_start: d, value: r0(noisy(rng, spend, 0.04)) });
    }
  }

  const checklistMeta = [
    { platform: "pixel" as const, event_name: "Conversación iniciada", evidence: "Events Manager: dispara en la prueba del anuncio." },
    { platform: "capi" as const, event_name: "Purchase (venta offline)", evidence: "Carga diaria del CRM verificada con 3 ventas de prueba." },
    { platform: "gtm" as const, event_name: "Etiqueta de clic a WhatsApp", evidence: "Vista previa de GTM: la etiqueta dispara." },
  ];

  return [
    {
      title: "Video UGC vs. estático en CTWA Pospago",
      status: "decided",
      problem: "El costo por venta de CTWA Pospago subió 22 % en el último trimestre y la tasa de venta por conversación está estancada en 5,8 %.",
      problem_evidence: "Tablero de Meta y ventas del CRM, julio a septiembre: CPA de $118.000 a $144.000.",
      hypothesis_change: "anuncios en video UGC (clientes reales contando su cambio a WOM)",
      hypothesis_scope: "CTWA Pospago, prospección en Meta",
      hypothesis_metric: "la tasa de venta por conversación",
      hypothesis_expected_pct: 15,
      hypothesis_reason: "el testimonio de pares genera más confianza que la pieza de oferta y llega gente con más intención",
      variable: "Formato (video, estático, carrusel, UGC)",
      test_type: "ab_creative",
      design_config: { granularity: "day", notes: "Mismo presupuesto y público para las dos piezas." },
      primary_metric: "Tasa de venta por conversación",
      guardrails: [{ metric: "Costo por conversación", limit_pct: 15 }],
      power_inputs: { baseline: 0.058, daily_volume_per_arm: 400, planned_days: 28, target_mde_pct: 15, daily_spend_cop: 2_300_000, alpha: 0.05, power: 0.8 },
      decision_rules: DEFAULT_DECISION_RULES,
      planned_start: s1,
      planned_end: e1,
      actual_start: s1,
      actual_end: e1,
      planned_budget_cop: 64_400_000,
      media: [{ media: "Meta Ads", account: "WOM Colombia", campaign: "CTWA Pospago · Prospección", audience: "Advantage+ 25–45", destination: "WhatsApp Pospago", cities: [] }],
      arms: [
        { key: "control", name: "Estático de oferta", is_control: true, split_pct: 50, cities: [] },
        { key: "ugc", name: "Video UGC", is_control: false, split_pct: 50, cities: [] },
      ],
      checklist: checklistMeta,
      incidents: [{ occurred_on: addDays(s1, 9), description: "Meta pausó el video UGC medio día por revisión de política.", expected_impact: "low" }],
      values: v1,
      decision: {
        verdict: "winner",
        decision: "scale",
        justification: "La probabilidad de ganar superó 90 % y el costo por conversación no se salió del guardrail.",
        learning: "En CTWA, el video UGC con clientes reales vende más por conversación que la pieza de oferta. Probarlo también en Recargas.",
      },
    },
    {
      title: "Más inversión en Meta en ciudades intermedias",
      status: "in_test",
      problem: "No sabemos si subir la inversión en ciudades intermedias trae ventas nuevas o solo compra las mismas ventas más caras.",
      problem_evidence: "Las ventas por WhatsApp pasan fuera de la plataforma: la atribución de Meta no alcanza para decidir.",
      hypothesis_change: "40 % más de inversión en Meta",
      hypothesis_scope: "Pereira, Manizales y Armenia",
      hypothesis_metric: "las ventas semanales",
      hypothesis_expected_pct: 10,
      hypothesis_reason: "hay demanda sin cubrir: la frecuencia actual es baja y el alcance no se ha saturado",
      variable: "Niveles de presupuesto (saturación)",
      test_type: "geo",
      design_config: { granularity: "week", pre_start: pre2, notes: "Control: ciudades de tamaño parecido, sin cambios de inversión." },
      primary_metric: "Ventas",
      guardrails: [{ metric: "Costo por venta (CPA)", limit_pct: 25 }],
      power_inputs: { baseline: 180, daily_cv: 0.08, planned_days: 42, target_mde_pct: 10, daily_spend_cop: 3_300_000, alpha: 0.05, power: 0.8 },
      decision_rules: { ...DEFAULT_DECISION_RULES, scale_min_lift_pct: 5 },
      planned_start: s2,
      planned_end: e2,
      actual_start: s2,
      actual_end: null,
      planned_budget_cop: 140_000_000,
      media: [
        {
          media: "Meta Ads",
          account: "WOM Colombia",
          campaign: "Ciudades intermedias · Alcance",
          audience: null,
          destination: "WhatsApp Portabilidad",
          cities: [...testCities, ...controlCities],
        },
      ],
      arms: [
        { key: "test", name: "Ciudades con +40 % de inversión", is_control: false, split_pct: null, cities: testCities },
        { key: "control", name: "Ciudades de control", is_control: true, split_pct: null, cities: controlCities },
      ],
      checklist: checklistMeta.slice(1),
      incidents: [],
      values: v2,
    },
    {
      title: "CTWA directo vs. landing hacia WhatsApp en Portabilidad",
      status: "in_reading",
      problem: "Muchas conversaciones de CTWA Portabilidad no terminan en venta: el asesor gasta tiempo en gente que no cumple requisitos.",
      problem_evidence: "El 61 % de las conversaciones de agosto no pasó del primer mensaje (reporte del BSP).",
      hypothesis_change: "una landing corta con requisitos antes de abrir WhatsApp",
      hypothesis_scope: "Portabilidad en Meta",
      hypothesis_metric: "el costo por venta",
      hypothesis_expected_pct: -12,
      hypothesis_reason: "llegan menos conversaciones, pero de gente que ya sabe que cumple y viene a comprar",
      variable: "CTWA directo vs. landing hacia WhatsApp vs. eCommerce",
      test_type: "ab_platform",
      design_config: { granularity: "day" },
      primary_metric: "Costo por venta (CPA)",
      guardrails: [{ metric: "Ventas", limit_pct: 10 }],
      power_inputs: { baseline: 52_000, daily_cv: 0.2, planned_days: 28, target_mde_pct: 12, daily_spend_cop: 2_800_000, alpha: 0.05, power: 0.8 },
      decision_rules: DEFAULT_DECISION_RULES,
      planned_start: s3,
      planned_end: e3,
      actual_start: s3,
      actual_end: e3,
      planned_budget_cop: 78_400_000,
      media: [
        { media: "Meta Ads", account: "WOM Colombia", campaign: "Portabilidad · Conversión", audience: "Intereses telco", destination: "WhatsApp Portabilidad", cities: [] },
      ],
      arms: [
        { key: "directo", name: "CTWA directo", is_control: true, split_pct: 50, cities: [] },
        { key: "landing", name: "Landing → WhatsApp", is_control: false, split_pct: 50, cities: [] },
      ],
      checklist: [
        ...checklistMeta,
        { platform: "ga4" as const, event_name: "generate_lead (clic a WhatsApp en la landing)", evidence: "DebugView de GA4 con el evento." },
      ],
      incidents: [{ occurred_on: addDays(s3, 15), description: "La landing estuvo caída 2 horas por un despliegue del sitio.", expected_impact: "medium" }],
      values: v3,
    },
  ];
}
