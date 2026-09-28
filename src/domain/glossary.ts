// Glosario único de la app: lenguaje simple primero, detalle opcional después.
// Se muestra con <Term> (burbuja ⓘ) en tablas, tarjetas y etiquetas fuera del asistente.

export interface GlossaryEntry {
  /** Nombre como aparece en pantalla. */
  label: string;
  /** Qué significa, en una o dos frases, sin jerga. */
  simple: string;
  /** Detalle opcional para quien quiere saber cómo se calcula. */
  detail?: string;
}

export const GLOSSARY = {
  ice: {
    label: "ICE",
    simple: "Puntaje de 1 a 10 que ordena las ideas: qué tanto mueve la métrica (Impacto), qué tan seguros estamos (Confianza) y qué tan fácil es hacerlo (Facilidad).",
    detail: "ICE = promedio de Impacto, Confianza y Facilidad, a un decimal.",
  },
  impact: { label: "Impacto", simple: "Cuánto movería la métrica si funciona. 10 = muchísimo." },
  confidence: { label: "Confianza", simple: "Qué tan seguros estamos de que va a funcionar, según la evidencia. 10 = casi seguro." },
  ease: { label: "Facilidad", simple: "Qué tan fácil y barato es hacerlo. 10 = se hace en un día sin ayuda de nadie." },
  filters: {
    label: "Filtros",
    simple: "Ajustes al ICE: suma si se puede leer antes de los picos de venta y resta si el resultado no depende solo del equipo.",
    detail: "Puntaje final = ICE + bono de calendario − penalidad de control. Los valores se cambian en Configuración → Reglas de priorización.",
  },
  finalScore: { label: "Puntaje final", simple: "El ICE con los filtros aplicados. El backlog se ordena por este número, de mayor a menor." },
  calendarFit: {
    label: "Calendario",
    simple: "Si las fechas del ejercicio no cruzan picos de venta ni congelamientos, se puede leer a tiempo y suma puntos.",
  },
  control: {
    label: "Control",
    simple: "Qué tanto depende el resultado del equipo: nuestro (solo nosotros), compartido (con otra área) o externo (de un tercero). Lo que no es nuestro resta puntos.",
  },
  controlVariant: {
    label: "Control (variante)",
    simple: "La versión de siempre, sin cambios. Contra ella se compara lo nuevo para saber si de verdad mejoró.",
  },
  variant: { label: "Variante", simple: "Cada versión que se prueba. Una es el control; las demás son lo nuevo." },
  hypothesis: {
    label: "Hipótesis",
    simple: "La apuesta del ejercicio en tres partes: SI hacemos este cambio, ENTONCES pasa esto con la métrica, PORQUE creemos esto.",
  },
  decisionRule: {
    label: "Regla de decisión",
    simple: "Lo que tiene que pasar para decir que ganó, escrito antes de lanzar para no acomodar la lectura después.",
  },
  minDuration: { label: "Duración mínima", simple: "Los días que la prueba tiene que correr antes de leerla. Leer antes puede engañar." },
  winRate: {
    label: "Tasa de acierto",
    simple: "De cada 10 ejercicios cerrados, cuántos ganaron. Una tasa baja no es mala: también se aprende de lo que no funcionó.",
  },
  diffVsControl: {
    label: "Diferencia vs control",
    simple: "Cuánto mejor (o peor) le fue a la variante frente a la versión de siempre, en porcentaje.",
  },
  probabilityToWin: {
    label: "Probabilidad de ganar",
    simple: "Qué tan probable es que la variante de verdad sea mejor que el control y no sea suerte. Por encima de 95 % es confiable; por debajo de 80 %, todavía no se sabe.",
    detail: "Se calcula con la muestra y las conversiones de cada variante (modelo beta-binomial). Solo aplica a pruebas A/B.",
  },
  sampleSize: {
    label: "Muestra necesaria",
    simple: "Cuántas personas tienen que pasar por cada variante para poder detectar el cambio que esperamos, sin confundirlo con suerte.",
    detail: "Cálculo con 95 % de confianza y 80 % de potencia, a partir de la tasa actual y el cambio mínimo que queremos detectar.",
  },
  estimatedValue: {
    label: "Valor estimado",
    simple: "Cuánta plata representa la mejora si se escala: unidades extra por semana × valor de cada unidad.",
  },
  testType: {
    label: "Tipo de prueba",
    simple: "A/B: se reparte la gente al azar entre versiones (la más confiable). Por geografía: unas ciudades con el cambio y otras sin él. Antes y después: se compara con el periodo anterior (la menos confiable).",
  },
  bau: { label: "Escalado a BAU", simple: "El ejercicio ganó y ya es parte de la operación normal del día a día." },
  verdict: { label: "Veredicto", simple: "La lectura del resultado frente a la regla: ganó, perdió o no se puede concluir." },
  decision: { label: "Decisión", simple: "Qué se hace con el resultado: escalarlo, ajustarlo y volver a probar, o apagarlo." },
  northStar: { label: "Métrica norte", simple: "El número que la línea de negocio quiere hacer crecer. Todo lo demás existe para moverlo." },
  inputMetric: { label: "Métrica de entrada", simple: "Un número que el equipo puede mover y que empuja la métrica norte." },
  baseline: { label: "Línea base", simple: "Dónde estaba la métrica al empezar. Sirve para saber cuánto se avanzó." },
  target: { label: "Meta", simple: "A dónde queremos llevar la métrica al final de cada horizonte." },
  targetStatus: {
    label: "Frente a la meta",
    simple: "Compara el último valor cargado con el camino esperado entre la línea base y la meta. Verde: vamos bien. Amarillo: un poco atrás. Rojo: muy atrás.",
  },
  freeze: { label: "Congelamiento", simple: "Días en que no se lanza nada nuevo para no arriesgar las ventas de temporada." },
  horizon: { label: "Horizonte", simple: "Un tramo del programa con su propia meta (por ejemplo, H1 hasta enero)." },
  evidence: { label: "Evidencia", simple: "Los datos que muestran que la oportunidad de mejora existe. Sin evidencia, es una corazonada." },
  unitValue: {
    label: "Valor por unidad",
    simple: "Cuánto vale para el negocio una unidad de esta métrica (por ejemplo, una alta ≈ $250.000). Con esto Arriero calcula el valor en pesos de cada resultado.",
  },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
