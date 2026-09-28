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
    what: "Son las fechas que mandan en el negocio: los picos de venta (Black Friday, diciembre), los congelamientos alrededor de ellos y el punto de decisión. Con el punto de decisión el programa se parte en horizontes (H1, H2): tramos, cada uno con su propia meta.",
    why: "En los picos lo primero es vender (ahí no hay tiempo de inventos), así que no se lanzan pruebas (congelamiento). En el punto de decisión se revisa qué funcionó para escalarlo y liberar la siguiente inversión: en H1 se prueba y se aprende; en H2 se escala lo que funcionó.",
    example: "Pico Black Friday del 27 al 30 de noviembre → congelamiento del 23 de noviembre al 6 de diciembre. Punto de decisión: 18 de enero. H1 hasta el 18 de enero, H2 desde el 19.",
    tip: "Le dejamos listo lo típico de telco. Quite lo que no aplique y siga: los horizontes se acomodan solos al punto de decisión.",
  },
  lineas: {
    title: "¿Qué es una línea de negocio?",
    what: "Cada negocio que se mide por aparte porque funciona distinto: un pospago no se vende igual que una recarga.",
    why: "Cada línea tiene su métrica norte, su árbol de métricas y su embudo. Así las oportunidades de mejora y los ejercicios quedan donde corresponden.",
    example: "Pospago, Portabilidad prepago, Recargas y paquetes y Equipos móviles.",
    tip: "Elija las plantillas que le sirvan: traen de ñapa métricas y embudo sugeridos, que después revisa.",
  },
  linea: {
    title: "¿Qué se configura en cada línea?",
    what: "Tres cosas: la métrica norte (el número que la línea quiere crecer) con su eficiencia, el árbol de métricas de entrada que la explican y el embudo donde se ubican las oportunidades de mejora.",
    why: "Los ejercicios atacan métricas del árbol y las oportunidades de mejora se ubican en una etapa del embudo. Sin esto no hay dónde poner nada. Viene todo sugerido desde la plantilla: revise y siga.",
    example: "Pospago: norte \"Altas digitales semanales\", eficiencia \"Costo por alta\", árbol con conversaciones iniciadas y tasa de conversación a venta, embudo de cuatro etapas.",
    tip: "¿No tiene la línea base o las metas? Déjelas vacías: quedan en los pendientes y las completa después, sin afán.",
  },
  equipo: {
    title: "¿Quién va en este viaje?",
    what: "Las personas que trabajan en el programa y su rol. El equipo interno es dueño del resultado; la agencia ejecuta los ejercicios que se le asignan.",
    why: "Los permisos dependen del rol: quién decide, quién edita y quién solo mira. Así nadie cambia lo que no le toca.",
    example: "Owner: gerente digital. Colaboradores: analistas del equipo. Agencia: quien produce creativos y pauta. Lector: dirección.",
    tip: "Es opcional: puede invitar ahora o después, cuando el programa ya esté andando. La mula no pregunta, avanza.",
  },
  puntaje: {
    title: "¿Qué se prueba primero?",
    what: "Cada ejercicio se califica con ICE: Impacto (cuánto movería la métrica), Confianza (qué tan seguros estamos) y Facilidad (qué tan rápido se lanza), de 1 a 10.",
    why: "Al ICE se le suman dos filtros del modelo: un bono si se puede leer antes de los picos (calendario) y una penalidad si depende de terceros (control). El puntaje final ordena el backlog.",
    example: "ICE 7,7 + 1 (se lee antes del pico) − 0 (depende de nosotros) = 8,7.",
    tip: "Es opcional: los valores por defecto sirven para arrancar. No le dé más vueltas: cámbielos solo si su equipo lo decide.",
  },
  resumen: {
    title: "¿Y ahora por dónde es?",
    what: "¡Eso! El programa quedó listo. El siguiente paso es registrar una oportunidad de mejora con evidencia: dónde se está perdiendo valor, y con qué datos lo sabe.",
    why: "Los ejercicios nacen de oportunidades de mejora, nunca de ideas sueltas. De cada oportunidad sale una hipótesis SI / ENTONCES / PORQUE que se prioriza y se prueba.",
    example: "\"El costo por conversación subió 35% en seis semanas: los mismos tres creativos llevan 8 semanas activos.\"",
  },
};

/** Ayuda corta de cada sección de "Configurar {línea}". */
export const LINE_SECTION_HELP = {
  north:
    "La métrica norte es el número que representa el valor que esta línea quiere crecer. Uno solo. La eficiencia dice cuánto cuesta crecerlo, para no crecer a cualquier costo.",
  tree: "La métrica norte es un resultado: no se mueve directo. El árbol la parte en métricas de entrada que el equipo sí puede mover. Los ejercicios atacan estas. Mejor pocas y claras que muchas.",
  funnel: "El recorrido del cliente, desde que llega hasta que compra y vuelve. Cada oportunidad de mejora que registre va en una etapa, y así se ve dónde hay que experimentar.",
} as const;

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
    title: "Un embudo para ubicar oportunidades de mejora",
    text: "El recorrido del cliente muestra por dónde se pierde valor. Cada oportunidad de mejora, con evidencia, va en una etapa.",
  },
  {
    title: "Ejercicios pequeños y medidos",
    text: "De cada oportunidad de mejora nace una hipótesis. Se prioriza con ICE, se prueba con un diseño fijado antes y se decide: escalar, ajustar o apagar.",
  },
  {
    title: "Un calendario que manda",
    text: "No se prueba en los picos de venta. Hay un punto de decisión formal, y cada ejercicio cerrado deja un aprendizaje para las demás líneas.",
  },
];

/** Ayuda del formulario de arranque rápido. */
export const QUICK_START_HELP: StepHelp = {
  title: "¿Qué arma el arranque rápido?",
  what: "Con cuatro datos crea el programa completo para las líneas que elija: el calendario típico de telco (Black Friday–Cyber y diciembre, con sus congelamientos y el punto de decisión), los horizontes H1 y H2, la métrica norte con su eficiencia, las métricas de entrada del árbol y el embudo con sus cuatro etapas.",
  why: "Lo que da valor es registrar oportunidades de mejora y probar ejercicios, no llenar formularios. Con el mapa básico ya puede ubicar dónde se pierde valor; lo fino se completa después.",
  example: "\"Plan digital Pospago oct 2026 – mar 2027\", líneas Pospago y Recargas y paquetes, 6 meses desde hoy, con el calendario típico de telco.",
  tip: "Después puede completar líneas base, metas y más líneas en Configuración. Nada queda escrito en piedra.",
};

export const QUICK_FIELD_HELP = {
  line: "Elija una o varias: cada plantilla trae la métrica norte, el árbol y el embudo sugeridos. Si su negocio no está, use \"Otra línea\" y le ponemos métricas genéricas.",
  duration: "Cuánto dura el plan. Con 6 meses hay tiempo de probar antes de los picos y escalar después.",
  telcoCalendar: "Agrega Black Friday–Cyber y la temporada decembrina que caigan en el periodo, con sus congelamientos (no se lanzan pruebas) y un punto de decisión para revisar qué escalar.",
} as const;
