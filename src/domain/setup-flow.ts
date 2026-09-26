// Flujo del asistente de configuración del programa. Pasos principales y,
// dentro de "Líneas", tres subpasos por cada línea (línea por línea).
//
// programs.setup_step guarda el último paso principal completado:
//   1 programa · 2 calendario · 3 horizontes · 4 líneas · 5 cierre (con setup_completed_at)
// El avance dentro de cada línea se deduce de los datos (métrica norte y árbol).

export type SetupStepKey =
  | "programa"
  | "calendario"
  | "horizontes"
  | "lineas"
  | "linea-norte"
  | "linea-arbol"
  | "linea-embudo"
  | "equipo"
  | "puntaje"
  | "resumen";

export const LINE_SUBSTEPS = ["linea-norte", "linea-arbol", "linea-embudo"] as const;
export type LineSubstep = (typeof LINE_SUBSTEPS)[number];

export const MAIN_STEPS: { key: SetupStepKey; label: string; short: string }[] = [
  { key: "programa", label: "El programa", short: "Programa" },
  { key: "calendario", label: "Calendario comercial", short: "Calendario" },
  { key: "horizontes", label: "Horizontes", short: "Horizontes" },
  { key: "lineas", label: "Líneas de negocio", short: "Líneas" },
  { key: "equipo", label: "Equipo", short: "Equipo" },
  { key: "puntaje", label: "Reglas de priorización", short: "Priorización" },
  { key: "resumen", label: "Resumen", short: "Resumen" },
];

export const SUBSTEP_LABEL: Record<LineSubstep, string> = {
  "linea-norte": "Métrica norte",
  "linea-arbol": "Árbol de métricas",
  "linea-embudo": "Embudo",
};

/** Paso principal → número guardado en setup_step al completarlo. */
export const STEP_NUMBER: Partial<Record<SetupStepKey, number>> = {
  programa: 1,
  calendario: 2,
  horizontes: 3,
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

/** Secuencia completa de pasos, con los tres subpasos por línea. */
export function stepSequence(lines: { id: string }[]): StepRef[] {
  const seq: StepRef[] = [{ key: "programa" }, { key: "calendario" }, { key: "horizontes" }, { key: "lineas" }];
  for (const l of lines) for (const s of LINE_SUBSTEPS) seq.push({ key: s, lineId: l.id });
  seq.push({ key: "equipo" }, { key: "puntaje" }, { key: "resumen" });
  return seq;
}

const same = (a: StepRef, b: StepRef) => a.key === b.key && (a.lineId ?? null) === (b.lineId ?? null);

export function nextStep(current: StepRef, lines: { id: string }[]): StepRef | null {
  const seq = stepSequence(lines);
  const i = seq.findIndex((s) => same(s, current));
  return i >= 0 && i < seq.length - 1 ? seq[i + 1] : null;
}

export function previousStep(current: StepRef, lines: { id: string }[]): StepRef | null {
  const seq = stepSequence(lines);
  const i = seq.findIndex((s) => same(s, current));
  return i > 0 ? seq[i - 1] : null;
}

/** Dónde retomar el asistente según lo que ya está guardado. */
export function resumeStep(state: SetupState): StepRef {
  if (state.completed) return { key: "resumen" };
  if (!state.hasDates || state.setupStep < 1) return { key: "programa" };
  if (state.setupStep < 2) return { key: "calendario" };
  if (state.setupStep < 3) return { key: "horizontes" };
  if (state.setupStep < 4 || state.lines.length === 0) return { key: "lineas" };
  for (const l of state.lines) {
    if (!l.hasNorthStar) return { key: "linea-norte", lineId: l.id };
    if (!l.hasInputs) return { key: "linea-arbol", lineId: l.id };
  }
  return { key: "equipo" };
}

/** Pasos finales que no dejan rastro en los datos: se abren juntos al terminar las líneas. */
const CLOSING_STEPS: SetupStepKey[] = ["equipo", "puntaje", "resumen"];

/** ¿Se puede entrar a este paso? (no se saltan pasos que aún no se completaron). */
export function isReachable(step: StepRef, state: SetupState): boolean {
  if (state.completed) return true;
  const resume = resumeStep(state);
  const seq = stepSequence(state.lines);
  const target = seq.findIndex((s) => same(s, step));
  if (target < 0) return false;
  if (CLOSING_STEPS.includes(step.key) && CLOSING_STEPS.includes(resume.key)) return true;
  const limit = seq.findIndex((s) => same(s, resume));
  return limit < 0 || target <= limit;
}

export function stepHref(programId: string, step: StepRef): string {
  const base = `/programas/${programId}/configuracion?paso=${step.key}`;
  return step.lineId ? `${base}&linea=${step.lineId}` : base;
}

export function parseStep(paso: unknown, linea: unknown): StepRef | null {
  const keys: SetupStepKey[] = [
    "programa",
    "calendario",
    "horizontes",
    "lineas",
    "linea-norte",
    "linea-arbol",
    "linea-embudo",
    "equipo",
    "puntaje",
    "resumen",
  ];
  if (typeof paso !== "string" || !keys.includes(paso as SetupStepKey)) return null;
  const key = paso as SetupStepKey;
  if ((LINE_SUBSTEPS as readonly string[]).includes(key)) {
    return typeof linea === "string" ? { key, lineId: linea } : null;
  }
  return { key };
}
