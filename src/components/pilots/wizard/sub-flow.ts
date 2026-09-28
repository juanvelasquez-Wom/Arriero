// Pantallas cortas dentro de cada paso del asistente de pilotos: un tema por
// pantalla. Lógica pura (sin React): qué pantallas tiene cada paso, qué campos
// muestra cada una y a cuál volver cuando algo no pasa la validación.
import type { PilotStepKey } from "@/domain/pilots/flow";

export interface SubScreen {
  key: string;
  /** Nombre corto (puntos de avance y lectores de pantalla). */
  label: string;
  title: string;
  subtitle?: string;
  /** Campos del formulario (primer nivel) que se editan en esta pantalla. */
  fields: readonly string[];
}

export const PILOT_SUB_SCREENS = {
  problema: [
    {
      key: "problema",
      label: "Problema",
      title: "¿Qué está pasando en medios?",
      subtitle: "El problema, a quién le duele y el dato que lo muestra.",
      fields: ["problem", "problem_evidence"],
    },
    {
      key: "cambio",
      label: "Cambio",
      title: "¿Qué quiere probar y en qué medio?",
      subtitle: "El cambio que cree que lo mejora y dónde lo va a hacer.",
      fields: ["hypothesis_change", "hypothesis_scope"],
    },
    {
      key: "efecto",
      label: "Efecto",
      title: "¿Qué espera mover, cuánto y por qué?",
      subtitle: "Con esto queda la hipótesis completa, escrita antes de ver los números.",
      fields: ["hypothesis_metric", "hypothesis_expected_pct", "hypothesis_reason"],
    },
    {
      key: "nombre",
      label: "Nombre",
      title: "Póngale nombre al piloto",
      subtitle: "Corto y claro: así aparece en el portafolio.",
      fields: ["title"],
    },
    {
      key: "vinculos",
      label: "Vínculos",
      title: "¿Viene de un ejercicio de Arriero?",
      subtitle: "Opcional. Vincúlelo y elija quién responde por el piloto.",
      fields: [],
    },
  ],
  prueba: [
    {
      key: "variable",
      label: "Variable",
      title: "¿Qué va a cambiar?",
      subtitle: "La variable es lo único distinto entre los grupos.",
      fields: ["variable_id"],
    },
    {
      key: "tipo",
      label: "Tipo de prueba",
      title: "¿Cómo lo va a probar?",
      subtitle: "Cada variable tiene un tipo de prueba que la lee bien. Le marcamos el recomendado.",
      fields: ["test_type", "design_justification"],
    },
    {
      key: "grupos",
      label: "Grupos",
      title: "¿Qué grupos comparan?",
      subtitle: "El control es la referencia; las variantes llevan el cambio.",
      fields: ["design_config", "arms"],
    },
    {
      key: "medios",
      label: "Medios",
      title: "¿Dónde corre el piloto?",
      subtitle: "Cuenta, campaña, audiencia, destino y ciudades sirven para avisar cruces con otros pilotos.",
      fields: ["media"],
    },
    {
      key: "fechas",
      label: "Fechas y presupuesto",
      title: "¿Cuándo y con cuánta plata?",
      subtitle: "Fechas planeadas e inversión total del piloto.",
      fields: ["planned_start", "planned_end", "planned_budget_cop"],
    },
  ],
  metricas: [
    {
      key: "principal",
      label: "Métrica principal",
      title: "¿Qué métrica define quién gana?",
      subtitle: "Una sola. Mejor de negocio que de plataforma.",
      fields: ["primary_metric_id"],
    },
    {
      key: "guardrails",
      label: "Guardrails",
      title: "¿Qué no se puede dañar?",
      subtitle: "De 1 a 3 guardrails. Si uno se rompe, el piloto no escala aunque gane.",
      fields: ["guardrails"],
    },
    {
      key: "potencia",
      label: "Potencia",
      title: "¿La prueba alcanza a ver el efecto?",
      subtitle: "La calculadora de potencia le dice cuántos días necesita y qué tan pequeño es el efecto que alcanza a ver.",
      fields: ["power_inputs"],
    },
  ],
  reglas: [
    {
      key: "escalar",
      label: "Escalar",
      title: "¿Cuándo se escala?",
      subtitle: "Lo que tiene que pasar para llevarlo a la operación normal.",
      fields: ["scale_min_probability", "scale_min_lift_pct", "guardrails_block_scale"],
    },
    {
      key: "apagar",
      label: "Apagar",
      title: "¿Y cuándo se apaga?",
      subtitle: "Lo que queda en el medio se ajusta. Así se lee la regla completa.",
      fields: ["kill_max_probability"],
    },
  ],
  medicion: [
    {
      key: "eventos",
      label: "Eventos",
      title: "¿Qué eventos tienen que disparar?",
      subtitle: "Se verifican antes de lanzar: el piloto no sale a prueba con eventos por verificar.",
      fields: ["items"],
    },
    {
      key: "revision",
      label: "Revisión",
      title: "Así queda el piloto",
      subtitle: "Revise el diseño completo y envíelo al aprobador.",
      fields: [],
    },
  ],
} as const satisfies Record<PilotStepKey, readonly SubScreen[]>;

export const subScreenKeys = (step: PilotStepKey): string[] => PILOT_SUB_SCREENS[step].map((s) => s.key);

/**
 * Primera pantalla (en orden) que tiene alguno de los campos con error. Los
 * errores llegan con la ruta completa ("arms.0.name") o como objeto anidado de
 * react-hook-form; se mira el primer nivel. null si ninguno cae en una pantalla.
 */
export function firstScreenWithError(step: PilotStepKey, errorKeys: string[]): number | null {
  const roots = new Set(errorKeys.map((k) => k.split(".")[0]));
  const screens: readonly SubScreen[] = PILOT_SUB_SCREENS[step];
  const i = screens.findIndex((s) => s.fields.some((f) => roots.has(f)));
  return i < 0 ? null : i;
}

/**
 * Avance total del asistente (0–1) según el paso y la pantalla actual: los 5
 * pasos pesan lo mismo y cada uno se reparte entre sus pantallas.
 */
export function overallProgress(stepIndex: number, stepCount: number, screen: number, screens: number): number {
  if (stepCount <= 0) return 0;
  const inside = screens > 0 ? screen / screens : 0;
  return Math.min(1, Math.max(0, (stepIndex + inside) / stepCount));
}

/** Nombre sugerido a partir de la hipótesis: "Videos UGC en CTWA Pospago". */
export function suggestPilotTitle(change: string | null | undefined, scope: string | null | undefined): string {
  const c = (change ?? "").trim();
  const s = (scope ?? "").trim();
  if (!c) return "";
  const text = s ? `${c} en ${s}` : c;
  const capped = text.charAt(0).toLocaleUpperCase("es-CO") + text.slice(1);
  return capped.length > 160 ? `${capped.slice(0, 157).trimEnd()}…` : capped;
}
