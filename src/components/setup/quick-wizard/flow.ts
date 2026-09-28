// Lógica pura del arranque rápido como asistente: pantallas, textos y qué se
// valida antes de avanzar. La validación definitiva la hace la server action.
import type { QuickLineInput } from "@/domain/quick-start";

export const QUICK_STEPS = ["nombre", "lineas", "fechas", "calendario", "resumen"] as const;
export type QuickStepKey = (typeof QUICK_STEPS)[number];

export const STEP_TEXT: Record<QuickStepKey, { label: string; title: string; subtitle: string }> = {
  nombre: {
    label: "Nombre",
    title: "¿Cómo se llama su proyecto de growth?",
    subtitle: "En Arriero le decimos programa: un plan con fechas, líneas de negocio y metas. Póngale un nombre que el equipo reconozca.",
  },
  lineas: {
    label: "Líneas",
    title: "¿Qué líneas de negocio va a crecer?",
    subtitle: "Marque una o varias. Cada una trae su métrica norte, su árbol y su embudo sugeridos.",
  },
  fechas: {
    label: "Fechas",
    title: "¿Cuándo arranca y cuánto dura?",
    subtitle: "Le dejamos hoy y seis meses: tiempo de probar antes de los picos y escalar después.",
  },
  calendario: {
    label: "Calendario",
    title: "¿Le ponemos el calendario típico de telco?",
    subtitle: "Black Friday–Cyber y diciembre con sus congelamientos (ahí no se lanzan pruebas), más un punto de decisión.",
  },
  resumen: {
    label: "Resumen",
    title: "Así queda su programa",
    subtitle: "Revise y arránquele. Si algo no cuadra, cámbielo aquí mismo.",
  },
};

/** Validación de cada pantalla antes de avanzar (la definitiva la hace la server action). */
export function validateQuickStep(
  step: QuickStepKey,
  s: { lines: QuickLineInput[]; customOn: boolean; lineName: string; startDate: string },
): Record<string, string> {
  if (step === "lineas") {
    if (!s.lines.length) return { lines: "Elija al menos una línea de negocio. Sin línea no hay camino." };
    if (s.customOn && s.lineName.trim().length < 2) return { lineName: "Escriba el nombre de su línea de negocio." };
  }
  if (step === "fechas" && !/^\d{4}-\d{2}-\d{2}$/.test(s.startDate)) return { startDate: "Elija la fecha en que arranca el programa." };
  return {};
}

/** En qué pantalla se corrige cada campo que devuelve el servidor. */
export function stepForField(field: string): QuickStepKey {
  if (field === "name") return "nombre";
  if (field.startsWith("lines") || field === "lineName") return "lineas";
  if (field === "startDate" || field === "months") return "fechas";
  if (field === "useTelcoCalendar") return "calendario";
  return "resumen";
}

