// Textos de ayuda del asistente, escritos para alguien que nunca ha trabajado
// con un modelo de growth. Voz de ARRIERO: de usted, cercana y sin carreta.
// Ejemplos de telecomunicaciones.
import type { SetupStepKey } from "@/domain/setup-flow";

export interface StepHelp {
  title: string;
  what: string;
  why: string;
  example: string;
  tip?: string;
}

export const STEP_HELP: Record<SetupStepKey, StepHelp> = {
  programa: {
    title: "¿Qué es un programa?",
    what: "Es el plan de crecimiento de un periodo, por ejemplo de octubre a abril. Reúne las líneas de negocio, su calendario comercial y el equipo que va a probar mejoras.",
    why: "Con inicio y fin toca medir y decidir, nada de probar por probar. Todo lo que se pruebe dentro del programa empuja hacia el mismo destino.",
    example: "\"Plan de acción digital oct 2026 – abr 2027\": crecer las ventas digitales eficientes de pospago, portabilidad, recargas y equipos.",
  },
  calendario: {
    title: "¿Por qué un calendario comercial?",
    what: "Son las fechas que mandan en el negocio: los picos de venta (Black Friday, diciembre), los congelamientos alrededor de ellos y el punto de decisión.",
    why: "En los picos lo primero es vender (ahí no hay tiempo de inventos), así que no se lanzan pruebas (congelamiento). En el punto de decisión se revisa qué funcionó para escalarlo y liberar la siguiente inversión.",
    example: "Pico Black Friday del 27 al 30 de noviembre → congelamiento del 23 de noviembre al 6 de diciembre. Punto de decisión: 18 de enero.",
    tip: "Cuando agregue un pico, la app le propone el congelamiento. Si no le cuadra, ajústelo sin afán.",
  },
  horizontes: {
    title: "¿Qué es un horizonte?",
    what: "Un horizonte es un tramo del programa con su propia meta. Se llaman H1, H2… Normalmente H1 va hasta el punto de decisión y H2 es lo que viene después.",
    why: "Las metas no son iguales todo el año: en H1 se prueba y se aprende; en H2 se escala lo que funcionó. Cada métrica tendrá un objetivo por horizonte.",
    example: "H1: 1 de agosto – 18 de enero (probar antes de los picos). H2: 19 de enero – 30 de abril (escalar lo ganador).",
    tip: "Se los propusimos a partir de su punto de decisión. Ajústelos si su plan tiene otros tramos.",
  },
  lineas: {
    title: "¿Qué es una línea de negocio?",
    what: "Cada negocio que se mide por aparte porque funciona distinto: un pospago no se vende igual que una recarga.",
    why: "Cada línea tiene su métrica norte, su árbol de métricas y su embudo. Así los problemas y los ejercicios quedan donde corresponden.",
    example: "Pospago, Portabilidad prepago, Recargas y paquetes y Equipos móviles.",
    tip: "Elija las plantillas que le sirvan: traen de ñapa métricas y embudo sugeridos, que después revisa.",
  },
  "linea-norte": {
    title: "¿Qué es la métrica norte?",
    what: "Es el número que representa el valor que esta línea quiere crecer. Uno solo. Va acompañado de una métrica de eficiencia, que dice cuánto cuesta crecer.",
    why: "Pone a todo el equipo a mirar para el mismo lado: si un ejercicio no la mueve, directa o indirectamente, no vale la pena. La eficiencia evita crecer a cualquier costo.",
    example: "Pospago: norte \"Altas digitales semanales\" (hoy 420, meta H1 520); eficiencia \"Costo por alta\" (hoy $185.000, meta $160.000, debe bajar).",
    tip: "La línea base es dónde está hoy. ¿No tiene el dato todavía? Márquelo y lo completa después, sin afán.",
  },
  "linea-arbol": {
    title: "¿Qué es el árbol de métricas?",
    what: "La métrica norte es un resultado: no se mueve de forma directa. El árbol la parte en métricas de entrada que el equipo sí puede mover, agrupadas en cuatro ramas.",
    why: "Los ejercicios atacan estas métricas de entrada. Si sube la conversión o baja el costo por conversación, sube la métrica norte.",
    example: "Altas digitales ← volumen de demanda (conversaciones iniciadas) × conversión (conversación a venta) · eficiencia (costo por lead) · recuperación (checkouts rescatados).",
    tip: "No cargue por cargar: marque las sugeridas que ya mide y agregue las suyas. Mejor pocas y claras que muchas.",
  },
  "linea-embudo": {
    title: "¿Qué es el embudo?",
    what: "El recorrido del cliente, desde que llega hasta que compra y vuelve. Tiene cuatro etapas: adquisición, activación, conversión, y recuperación y recurrencia.",
    why: "Sirve para ver por dónde se pierde valor. Cada problema que registre va en una etapa, y así se ve dónde hay que experimentar.",
    example: "Pospago · Conversión: \"completa la compra: validación de identidad, pago y activación\". Métrica: tasa de conversación a venta.",
    tip: "Revise qué significa cada etapa en esta línea y qué métrica la mide.",
  },
  equipo: {
    title: "¿Quién va en este viaje?",
    what: "Las personas que trabajan en el programa y su rol. El equipo interno es dueño del resultado; la agencia ejecuta los ejercicios que se le asignan.",
    why: "Los permisos dependen del rol: quién decide, quién edita y quién solo mira. Así nadie cambia lo que no le toca.",
    example: "Owner: gerente digital. Colaboradores: analistas del equipo. Agencia: quien produce creativos y pauta. Lector: dirección.",
    tip: "Puede saltarse este paso e invitar después desde Configuración → Equipo. La mula no pregunta, avanza.",
  },
  puntaje: {
    title: "¿Qué se prueba primero?",
    what: "Cada ejercicio se califica con ICE: Impacto (cuánto movería la métrica), Confianza (qué tan seguros estamos) y Facilidad (qué tan rápido se lanza), de 1 a 10.",
    why: "Al ICE se le suman dos filtros del modelo: un bono si se puede leer antes de los picos (calendario) y una penalidad si depende de terceros (control). El puntaje final ordena el backlog.",
    example: "ICE 7,7 + 1 (se lee antes del pico) − 0 (depende de nosotros) = 8,7.",
    tip: "Los valores por defecto sirven para arrancar. No le dé más vueltas: cámbielos solo si su equipo lo decide.",
  },
  resumen: {
    title: "¿Y ahora por dónde es?",
    what: "¡Eso! El programa quedó listo. El siguiente paso es registrar un problema con evidencia: dónde se está perdiendo valor, y con qué datos lo sabe.",
    why: "Los ejercicios nacen de problemas, nunca de ideas sueltas. De cada problema sale una hipótesis SI / ENTONCES / PORQUE que se prioriza y se prueba.",
    example: "\"El costo por conversación subió 35% en seis semanas: los mismos tres creativos llevan 8 semanas activos.\"",
  },
};

/** Explicaciones cortas de campos (burbujas ⓘ). */
export const FIELD_HELP = {
  programName: "Un nombre que el equipo reconozca. Suele incluir el periodo.",
  programDates: "Desde cuándo y hasta cuándo va el plan. Los ejercicios y las metas quedan dentro de estas fechas.",
  peak: "Fechas de mucha venta. Durante un pico no se lanzan pruebas para no arriesgar ventas.",
  freeze: "Periodo en el que no se lanza ningún ejercicio. La app avisa al planear y bloquea el lanzamiento dentro de él.",
  decision: "Fecha en la que se revisan los resultados y se decide qué escalar. Separa H1 de H2.",
  horizon: "Tramo del programa con su propia meta. H1 suele terminar en el punto de decisión.",
  northStar: "El número que la línea quiere crecer. Uno solo por línea.",
  efficiency: "Cuánto cuesta lograr la métrica norte. Evita crecer a cualquier costo.",
  baseline: "El valor de hoy (o el promedio reciente). Es el punto de partida para medir el avance.",
  target: "El valor al que quiere llegar al final de ese horizonte.",
  direction: "Si lo bueno es que el número suba (ventas) o que baje (costos).",
  unit: "En qué se mide: altas, clientes, %, COP…",
  branch: "Las cuatro formas de mover la métrica norte: traer más demanda, convertir mejor, gastar mejor y recuperar o hacer volver al cliente.",
  stageMetric: "La métrica del árbol que mejor muestra qué pasa en esta etapa.",
  calendarBonus: "Se suma si el ejercicio se puede leer antes de los picos comerciales.",
  sharedPenalty: "Se resta si el ejercicio depende en parte de otra área o proveedor.",
  externalPenalty: "Se resta si depende de un tercero que no controlamos (p. ej. validación de identidad).",
} as const;

/** Recorrido guiado inicial: el modelo en cinco ideas. */
export const WELCOME_IDEAS = [
  {
    title: "Una métrica norte por línea",
    text: "Un solo número que representa el valor que quiere crecer. Si un cambio no lo mueve, no vale la pena.",
  },
  {
    title: "Un árbol que la explica",
    text: "La métrica norte se parte en métricas de entrada que el equipo sí puede mover: demanda, conversión, eficiencia y recurrencia.",
  },
  {
    title: "Un embudo para ubicar problemas",
    text: "El recorrido del cliente muestra por dónde se pierde valor. Cada problema, con evidencia, va en una etapa.",
  },
  {
    title: "Ejercicios pequeños y medidos",
    text: "De cada problema nace una hipótesis. Se prioriza con ICE, se prueba con un diseño fijado antes y se decide: escalar, ajustar o apagar.",
  },
  {
    title: "Un calendario que manda",
    text: "No se prueba en los picos de venta. Hay un punto de decisión formal, y cada ejercicio cerrado deja un aprendizaje para las demás líneas.",
  },
];
