// Flujo del asistente de configuración del programa.
//
// Camino principal (lo mínimo para operar):
//   programa → calendario (con los horizontes adentro) → líneas → una pantalla
//   por línea ("Configurar {línea}": métrica norte, árbol y embudo) → resumen.
// Opcionales, desde el resumen: equipo y reglas de priorización (los valores por
// defecto sirven para arrancar).
//
// programs.setup_step guarda el último paso principal completado:
//   1 programa · 2 calendario guardado sin horizontes (solo programas creados con
//   el asistente anterior) · 3 calendario y horizontes · 4 líneas · 5 cierre
//   (con setup_completed_at).
// El paso de calendario guarda eventos y horizontes juntos y marca 3 de una vez.
// El avance dentro de cada línea se deduce de los datos (métrica norte y árbol).

export type SetupStepKey = "programa" | "calendario" | "lineas" | "linea" | "resumen" | "equipo" | "puntaje";

/** Pasos del camino principal (la pantalla por línea cuelga de "Líneas"). */
export const MAIN_STEPS: { key: SetupStepKey; label: string; short: string }[] = [
  { key: "programa", label: "El programa", short: "Programa" },
  { key: "calendario", label: "Calendario y horizontes", short: "Calendario" },
  { key: "lineas", label: "Líneas de negocio", short: "Líneas" },
  { key: "resumen", label: "Resumen", short: "Resumen" },
];

/** Pasos opcionales: se abren desde el resumen y vuelven a él. */
export const OPTIONAL_STEPS: { key: SetupStepKey; label: string }[] = [
  { key: "equipo", label: "Equipo" },
  { key: "puntaje", label: "Reglas de priorización" },
];

export const isOptionalStep = (key: SetupStepKey) => OPTIONAL_STEPS.some((s) => s.key === key);

/** Paso principal → número guardado en setup_step al completarlo. */
export const STEP_NUMBER: Partial<Record<SetupStepKey, number>> = {
  programa: 1,
  calendario: 3,
  lineas: 4,
};

export interface SetupState {
  setupStep: number;
  completed: boolean;
  hasDates: boolean;
  lines: { id: string; hasNorthStar: boolean; hasInputs: boolean }[];
}

export interface StepRef {
  key: SetupStepKey;
  lineId?: string;
}

/** Secuencia del camino principal: una pantalla por línea entre "Líneas" y "Resumen". */
export function stepSequence(lines: { id: string }[]): StepRef[] {
  return [
    { key: "programa" },
    { key: "calendario" },
    { key: "lineas" },
    ...lines.map((l) => ({ key: "linea" as const, lineId: l.id })),
    { key: "resumen" },
  ];
}

export const sameStep = (a: StepRef, b: StepRef) => a.key === b.key && (a.lineId ?? null) === (b.lineId ?? null);

export function nextStep(current: StepRef, lines: { id: string }[]): StepRef | null {
  if (isOptionalStep(current.key)) return { key: "resumen" };
  const seq = stepSequence(lines);
  const i = seq.findIndex((s) => sameStep(s, current));
  return i >= 0 && i < seq.length - 1 ? seq[i + 1] : null;
}

export function previousStep(current: StepRef, lines: { id: string }[]): StepRef | null {
  if (isOptionalStep(current.key)) return { key: "resumen" };
  const seq = stepSequence(lines);
  const i = seq.findIndex((s) => sameStep(s, current));
  return i > 0 ? seq[i - 1] : null;
}

const lineReady = (l: SetupState["lines"][number]) => l.hasNorthStar && l.hasInputs;

/** Con las líneas creadas ya se puede ir al resumen y terminar después ("Terminar después"). */
export function canFinishEarly(state: SetupState): boolean {
  return state.completed || (state.hasDates && state.setupStep >= 4 && state.lines.length > 0);
}

/** Dónde retomar el asistente según lo que ya está guardado. */
export function resumeStep(state: SetupState): StepRef {
  if (state.completed) return { key: "resumen" };
  if (!state.hasDates || state.setupStep < 1) return { key: "programa" };
  if (state.setupStep < 3) return { key: "calendario" };
  if (state.setupStep < 4 || state.lines.length === 0) return { key: "lineas" };
  const pending = state.lines.find((l) => !lineReady(l));
  return pending ? { key: "linea", lineId: pending.id } : { key: "resumen" };
}

/** ¿Este paso ya quedó hecho? (para los chulitos y la barra de avance). */
export function isStepDone(step: StepRef, state: SetupState): boolean {
  if (state.completed && step.key !== "linea") return true;
  switch (step.key) {
    case "programa":
      return state.hasDates && state.setupStep >= 1;
    case "calendario":
      return state.setupStep >= 3;
    case "lineas":
      return state.setupStep >= 4 && state.lines.length > 0;
    case "linea": {
      const l = state.lines.find((x) => x.id === step.lineId);
      return !!l && lineReady(l);
    }
    case "resumen":
      return state.completed;
    default:
      return false;
  }
}

/** Porcentaje del camino principal que ya está hecho (0–100). */
export function setupProgress(state: SetupState): number {
  const seq = stepSequence(state.lines);
  const done = seq.filter((s) => isStepDone(s, state)).length;
  return Math.round((done / seq.length) * 100);
}

/**
 * ¿Se puede entrar a este paso? No se saltan los pasos de los que dependen los
 * datos (fechas → calendario → líneas). Con las líneas creadas se abre todo: cada
 * línea es independiente y el resumen muestra lo pendiente.
 */
export function isReachable(step: StepRef, state: SetupState): boolean {
  if (state.completed || canFinishEarly(state)) return true;
  if (isOptionalStep(step.key) || step.key === "resumen" || step.key === "linea") return false;
  const seq = stepSequence(state.lines);
  const target = seq.findIndex((s) => sameStep(s, step));
  const limit = seq.findIndex((s) => sameStep(s, resumeStep(state)));
  return target >= 0 && (limit < 0 || target <= limit);
}

export function stepHref(programId: string, step: StepRef): string {
  const base = `/programas/${programId}/configuracion?paso=${step.key}`;
  return step.lineId ? `${base}&linea=${step.lineId}` : base;
}

/** Claves del asistente anterior que siguen llegando por enlaces viejos. */
const LEGACY: Record<string, SetupStepKey> = {
  horizontes: "calendario",
  "linea-norte": "linea",
  "linea-arbol": "linea",
  "linea-embudo": "linea",
};

const KEYS: SetupStepKey[] = ["programa", "calendario", "lineas", "linea", "resumen", "equipo", "puntaje"];

export function parseStep(paso: unknown, linea: unknown): StepRef | null {
  if (typeof paso !== "string") return null;
  const key = LEGACY[paso] ?? (KEYS.includes(paso as SetupStepKey) ? (paso as SetupStepKey) : null);
  if (!key) return null;
  if (key === "linea") return typeof linea === "string" ? { key, lineId: linea } : null;
  return { key };
}
