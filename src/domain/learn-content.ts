// Contenido de /aprender (mini curso de growth) y /guia (recorrido por el Arriero).
// Datos puros y un par de cálculos pequeños. Voz de ARRIERO: de usted, cercana,
// frases cortas y máximo un chiste por pantalla. Los términos del modelo no se
// renombran.
import { relativeDiff } from "./results";
import { computeIce } from "./scoring";

// ---------------------------------------------------------------------------
// Mini curso
// ---------------------------------------------------------------------------

export interface ChoiceOption {
  id: string;
  label: string;
  correct: boolean;
  /** Lo que se le dice a la persona al elegir esta opción. */
  feedback: string;
}

export type LessonInteraction =
  | { kind: "choice"; question: string; options: ChoiceOption[] }
  | {
      kind: "ice";
      question: string;
      idea: string;
      initial: { impact: number; confidence: number; ease: number };
    }
  | {
      kind: "order";
      question: string;
      /** En el orden correcto; la pantalla los muestra revueltos. */
      items: { id: string; label: string; hint: string }[];
      success: string;
    }
  | {
      kind: "hypothesis";
      question: string;
      parts: { slot: HypothesisSlot; text: string }[];
      success: string;
    }
  | {
      kind: "lift";
      question: string;
      /** Ventas por cada 1.000 personas del grupo control. */
      control: number;
      min: number;
      max: number;
      initial: number;
    };

export type HypothesisSlot = "si" | "entonces" | "porque";
export const HYPOTHESIS_SLOTS: { slot: HypothesisSlot; label: string }[] = [
  { slot: "si", label: "SI" },
  { slot: "entonces", label: "ENTONCES" },
  { slot: "porque", label: "PORQUE" },
];

export interface Lesson {
  id: string;
  /** Rótulo corto encima del título. */
  kicker: string;
  title: string;
  /** Dos o tres frases cortas. */
  body: string[];
  example: { line: string; text: string };
  interaction: LessonInteraction;
}

export const LESSONS: Lesson[] = [
  {
    id: "growth",
    kicker: "La idea de fondo",
    title: "Growth no es una campaña más",
    body: [
      "Una campaña se lanza, se gasta y se acaba. Growth es un método: ubicar dónde se pierde valor, probar un cambio pequeño y quedarse solo con lo que demuestra que funciona.",
      "Menos opinión, más evidencia. Y todo empuja hacia un mismo número.",
    ],
    example: {
      line: "Pospago",
      text: "En vez de \"subamos la pauta en diciembre\", growth pregunta: ¿dónde se caen las personas que ya escribieron por WhatsApp y qué cambio las haría comprar?",
    },
    interaction: {
      kind: "choice",
      question: "¿Cuál de estas suena más a growth?",
      options: [
        {
          id: "a",
          label: "Duplicar la pauta de Black Friday porque el año pasado funcionó",
          correct: false,
          feedback: "Eso es más plata a lo mismo. Puede servir, pero no sabemos qué parte funcionó.",
        },
        {
          id: "b",
          label: "Probar un mensaje de bienvenida nuevo en WhatsApp con la mitad de las conversaciones y comparar",
          correct: true,
          feedback: "¡Eso! Un cambio concreto, un grupo para comparar y un resultado que se puede leer.",
        },
        {
          id: "c",
          label: "Cambiar el logo de la landing porque se ve viejo",
          correct: false,
          feedback: "Puede que se vea mejor, pero sin medir no sabemos si vende más.",
        },
      ],
    },
  },
  {
    id: "norte",
    kicker: "Para dónde vamos",
    title: "La métrica norte",
    body: [
      "Es el número que representa el valor que la línea quiere crecer. Una sola por línea, para que nadie jale para su lado.",
      "Va acompañada de una métrica de eficiencia, para no crecer a cualquier precio.",
    ],
    example: {
      line: "Pospago",
      text: "Norte: altas digitales de pospago por semana. Eficiencia: costo por alta.",
    },
    interaction: {
      kind: "choice",
      question: "Para Recargas y paquetes, ¿cuál sería la métrica norte?",
      options: [
        {
          id: "a",
          label: "Seguidores en Instagram",
          correct: false,
          feedback: "Bonito para el ego, pero no es plata que entre. Ese camino no era.",
        },
        {
          id: "b",
          label: "Clics en los anuncios",
          correct: false,
          feedback: "Los clics son una métrica de entrada: ayudan, pero no son el valor final.",
        },
        {
          id: "c",
          label: "Valor de recargas digitales por semana",
          correct: true,
          feedback: "¡Eso es! Es el valor que la línea quiere crecer, medido cada semana.",
        },
      ],
    },
  },
  {
    id: "arbol",
    kicker: "Qué mueve el número",
    title: "El árbol de métricas",
    body: [
      "La métrica norte se descompone en métricas de entrada: las palancas que sí se pueden mover día a día.",
      "Cada entrada cae en una rama: volumen de demanda, conversión, eficiencia, o recuperación y recurrencia.",
    ],
    example: {
      line: "Pospago",
      text: "Altas = conversaciones de WhatsApp iniciadas × tasa de conversación a venta. Si una de las dos sube, sube la norte.",
    },
    interaction: {
      kind: "choice",
      question: "La tasa de conversación a venta en WhatsApp, ¿en qué rama va?",
      options: [
        {
          id: "a",
          label: "Volumen de demanda",
          correct: false,
          feedback: "Casi. Volumen es cuánta gente llega; aquí hablamos de cuántos compran.",
        },
        {
          id: "b",
          label: "Conversión",
          correct: true,
          feedback: "¡Así es! Es cuántos de los que llegan terminan comprando.",
        },
        {
          id: "c",
          label: "Recuperación y recurrencia",
          correct: false,
          feedback: "Esa rama es para los que se fueron o para que vuelvan a comprar.",
        },
      ],
    },
  },
  {
    id: "embudo",
    kicker: "El recorrido del cliente",
    title: "El embudo",
    body: [
      "Son las etapas por las que pasa una persona, desde que nos conoce hasta que vuelve a comprar.",
      "Sirve para ubicar la oportunidad de mejora: no es lo mismo que no lleguen a que lleguen y no compren.",
    ],
    example: {
      line: "Recargas y paquetes",
      text: "Ve el anuncio, abre la app, paga la recarga y el mes siguiente vuelve a recargar.",
    },
    interaction: {
      kind: "order",
      question: "Ordene las etapas del embudo, de la primera a la última.",
      items: [
        { id: "adquisicion", label: "Adquisición", hint: "La persona nos conoce y llega" },
        { id: "activacion", label: "Activación", hint: "Da el primer paso: escribe o se registra" },
        { id: "conversion", label: "Conversión", hint: "Compra: alta, recarga o equipo" },
        { id: "recuperacion", label: "Recuperación y recurrencia", hint: "Vuelve o no se va" },
      ],
      success: "¡Eso! Así camina el cliente: de conocernos a quedarse.",
    },
  },
  {
    id: "problema",
    kicker: "Dónde se pierde valor",
    title: "Una oportunidad de mejora con evidencia",
    body: [
      "Una oportunidad de mejora es una pérdida de valor ubicada en una línea, una etapa y un canal. Y trae evidencia: un dato, no una corazonada.",
      "Luego se le pone una causa raíz hipotética, que el ejercicio va a poner a prueba.",
    ],
    example: {
      line: "Portabilidad",
      text: "El 62 % de las conversaciones de WhatsApp se abandona antes de pedir los datos del cliente (tablero de Meta, últimas 6 semanas).",
    },
    interaction: {
      kind: "choice",
      question: "¿Cuál es una oportunidad de mejora bien planteada?",
      options: [
        {
          id: "a",
          label: "La gente no quiere pasarse a pospago",
          correct: false,
          feedback: "Suena a queja de pasillo. ¿Dónde está el dato? ¿En qué etapa y canal?",
        },
        {
          id: "b",
          label: "En la landing de equipos, 7 de cada 10 abandonan en el paso de pago (Analytics, septiembre)",
          correct: true,
          feedback: "¡Eso! Línea, etapa, canal y evidencia. Con eso sí se puede trabajar.",
        },
        {
          id: "c",
          label: "Hay que hacer más contenido en TikTok",
          correct: false,
          feedback: "Eso es una solución disfrazada de oportunidad. Primero la oportunidad de mejora.",
        },
      ],
    },
  },
  {
    id: "ejercicio",
    kicker: "Qué vamos a probar",
    title: "El ejercicio y su hipótesis",
    body: [
      "Un ejercicio es cualquier cambio que se quiere probar antes de escalarlo. Siempre nace de una oportunidad de mejora y apunta a una métrica del árbol.",
      "Se escribe como hipótesis: SI hacemos esto, ENTONCES pasa esto, PORQUE creemos esto.",
    ],
    example: {
      line: "Pospago",
      text: "Mandar el plan recomendado en el primer mensaje de WhatsApp, en vez de preguntar \"¿en qué le puedo ayudar?\".",
    },
    interaction: {
      kind: "hypothesis",
      question: "Toque cada pedazo y póngalo donde va.",
      parts: [
        { slot: "si", text: "mostramos el plan recomendado en el primer mensaje de WhatsApp" },
        { slot: "entonces", text: "la tasa de conversación a venta sube 10 %" },
        { slot: "porque", text: "la gente abandona cuando le toca explicar qué necesita" },
      ],
      success: "¡Quedó armada! Una hipótesis clara se puede probar y se puede perder, y eso está bien.",
    },
  },
  {
    id: "ice",
    kicker: "Qué va primero",
    title: "ICE para priorizar",
    body: [
      "Hay más ideas que tiempo. ICE las ordena: Impacto, Confianza y Facilidad, cada una de 1 a 10. El ICE es el promedio.",
      "Luego se suma o se resta por calendario y por qué tanto control tenemos de la oportunidad de mejora. Eso da el puntaje final.",
    ],
    example: {
      line: "Equipos móviles",
      text: "Mostrar las cuotas sin interés arriba en la landing: impacto alto, confianza media, facilidad alta.",
    },
    interaction: {
      kind: "ice",
      question: "Mueva las barras y mire cómo cambia el ICE.",
      idea: "Mostrar cuotas sin interés arriba en la landing de equipos",
      initial: { impact: 7, confidence: 5, ease: 8 },
    },
  },
  {
    id: "calendario",
    kicker: "Cuándo probar",
    title: "Fuera de los congelamientos",
    body: [
      "En los picos comerciales (Black Friday, diciembre) lo primero es vender. Alrededor de ellos hay congelamiento: no se lanzan ejercicios.",
      "La idea es lanzar con tiempo para leer el resultado antes del pico y del punto de decisión.",
    ],
    example: {
      line: "Todas las líneas",
      text: "Pico Black Friday del 27 al 30 de noviembre, congelamiento del 23 de noviembre al 6 de diciembre.",
    },
    interaction: {
      kind: "choice",
      question: "Un ejercicio necesita 3 semanas. ¿Cuándo lo lanza?",
      options: [
        {
          id: "a",
          label: "El 20 de octubre: se lee antes del congelamiento",
          correct: true,
          feedback: "¡Muy bien! Termina a tiempo y llega con resultado al pico.",
        },
        {
          id: "b",
          label: "El 25 de noviembre, en plena semana de Black Friday",
          correct: false,
          feedback: "Ahí está congelado. Y aunque no lo estuviera, el pico le enreda la lectura.",
        },
        {
          id: "c",
          label: "El 20 de diciembre, para aprovechar las primas",
          correct: false,
          feedback: "Diciembre es pico: no es momento de inventos. Mejor antes o después.",
        },
      ],
    },
  },
  {
    id: "decision",
    kicker: "Qué pasó y qué hacemos",
    title: "Veredicto y decisión",
    body: [
      "Al cerrar se lee el resultado contra la regla de decisión: ganador, perdedor o no concluyente. Eso es el veredicto.",
      "Luego viene la decisión: escalar, ajustar o apagar. Siempre con una justificación.",
    ],
    example: {
      line: "Pospago",
      text: "La variante vendió 12 % más que el control con 96 % de probabilidad de ganar.",
    },
    interaction: {
      kind: "choice",
      question: "Con ese resultado, ¿qué decide?",
      options: [
        {
          id: "a",
          label: "Escalar",
          correct: true,
          feedback: "¡Ese camino sí era! Ganador claro: a escalarlo a la operación normal.",
        },
        {
          id: "b",
          label: "Ajustar",
          correct: false,
          feedback: "Ajustar sirve cuando hay señal pero algo falla. Aquí el resultado es claro.",
        },
        {
          id: "c",
          label: "Apagar",
          correct: false,
          feedback: "¿Apagar un ganador? La mula se sentaría en el camino.",
        },
      ],
    },
  },
  {
    id: "aprendizaje",
    kicker: "Lo que queda",
    title: "El aprendizaje",
    body: [
      "Gane o pierda, todo ejercicio deja un aprendizaje. Es obligatorio al decidir.",
      "Se escribe para que otra línea lo pueda reutilizar, y de ahí pueden nacer ejercicios nuevos.",
    ],
    example: {
      line: "De Pospago a Equipos",
      text: "\"Mostrar la oferta en el primer mensaje sube la conversión en WhatsApp.\" Equipos lo puede probar en su propio canal.",
    },
    interaction: {
      kind: "choice",
      question: "¿Cuál aprendizaje le sirve más a otra línea?",
      options: [
        {
          id: "a",
          label: "No funcionó",
          correct: false,
          feedback: "Eso es un veredicto, no un aprendizaje. ¿Qué nos enseñó?",
        },
        {
          id: "b",
          label: "Los descuentos por tiempo limitado no mueven la recarga: la gente recarga cuando se le acaba el saldo",
          correct: true,
          feedback: "¡Eso! Dice qué pasó y por qué. Otra línea lo puede usar sin repetir el ejercicio.",
        },
        {
          id: "c",
          label: "La agencia tardó en montar la landing",
          correct: false,
          feedback: "Sirve para la operación, pero no nos dice nada del cliente.",
        },
      ],
    },
  },
  {
    id: "piloto",
    kicker: "Medios con rigor",
    title: "Qué es un piloto de medios",
    body: [
      "Un piloto es una prueba controlada de un cambio en medios: Meta CTWA, landings, radio, pantallas en la calle.",
      "Busca la incrementalidad: las ventas que no habrían pasado sin el cambio. Para eso se compara con un grupo control, que no recibe el cambio.",
    ],
    example: {
      line: "Meta CTWA",
      text: "Pauta nueva de WhatsApp en Medellín y Cali; Bogotá y Barranquilla quedan como control.",
    },
    interaction: {
      kind: "lift",
      question: "El grupo control vendió 40 por cada 1.000 personas. Mueva cuánto vendió el grupo que recibió el cambio.",
      control: 40,
      min: 30,
      max: 60,
      initial: 46,
    },
  },
];

// ---------------------------------------------------------------------------
// Cálculos pequeños de las interacciones
// ---------------------------------------------------------------------------

/** ICE en vivo para el deslizador: reutiliza la regla del dominio. */
export function lessonIce(impact: number, confidence: number, ease: number): number {
  return computeIce(impact, confidence, ease) ?? 0;
}

/** Lectura corta del ICE para la pantalla. */
export function iceVerdict(ice: number): string {
  if (ice >= 7.5) return "Va de primera en la fila.";
  if (ice >= 5.5) return "Buena candidata. Compite con las demás.";
  return "Mejor dejarla para después.";
}

/** Incrementalidad: diferencia relativa del grupo de prueba frente al control. */
export function lessonLift(control: number, test: number): number | null {
  return relativeDiff(test, control);
}

export function isOrderCorrect(expected: readonly string[], actual: readonly string[]): boolean {
  return expected.length === actual.length && expected.every((id, i) => actual[i] === id);
}

/**
 * Revuelve de forma determinística (misma salida en servidor y navegador) y
 * garantiza que no quede en el orden correcto.
 */
export function shuffleForOrder<T>(items: readonly T[]): T[] {
  if (items.length < 2) return [...items];
  // Rotación + intercambio de pares: estable y nunca igual al original.
  const rotated = [...items.slice(1), items[0]];
  for (let i = 0; i + 1 < rotated.length; i += 2) {
    [rotated[i], rotated[i + 1]] = [rotated[i + 1], rotated[i]];
  }
  const same = rotated.every((x, i) => x === items[i]);
  return same ? [...items].reverse() : rotated;
}

// ---------------------------------------------------------------------------
// Progreso guardado en el navegador (el almacenamiento puede fallar: se valida)
// ---------------------------------------------------------------------------

export interface DeckProgress {
  index: number;
  finished: boolean;
}

export function parseDeckProgress(raw: string | null, total: number): DeckProgress {
  const fallback: DeckProgress = { index: 0, finished: false };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<DeckProgress>;
    const index = typeof parsed.index === "number" && Number.isInteger(parsed.index) ? parsed.index : 0;
    return {
      index: Math.min(Math.max(index, 0), Math.max(total - 1, 0)),
      finished: parsed.finished === true,
    };
  } catch {
    return fallback;
  }
}

export function serializeDeckProgress(progress: DeckProgress): string {
  return JSON.stringify(progress);
}

// ---------------------------------------------------------------------------
// Recorrido por el Arriero (/guia)
// ---------------------------------------------------------------------------

export type TourMock =
  | "header"
  | "wizard"
  | "line"
  | "weekly"
  | "problem"
  | "backlog"
  | "design"
  | "results"
  | "boards"
  | "pilots"
  | "direction"
  | "roles";

export interface TourStep {
  id: string;
  title: string;
  body: string[];
  /** Detalles cortos en lista. */
  points: string[];
  mock: TourMock;
  href: string;
  hrefLabel: string;
  /** `program`: vive dentro de cada programa; el enlace lleva a Mis programas. */
  scope: "global" | "program";
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "inicio",
    title: "El inicio y la barra de arriba",
    body: ["La barra de arriba lo acompaña en todas las pantallas. Desde ahí llega a todo sin perderse."],
    points: [
      "Buscar con Ctrl K: programas, ejercicios, oportunidades de mejora y atajos.",
      "La mula lo devuelve al inicio.",
      "Proyectos (programas), Pilotos, Tableros y Resumen ejecutivo para dirección.",
      "La campana trae los avisos: lo que ya se puede leer, ideas quietas, congelamientos.",
    ],
    mock: "header",
    href: "/",
    hrefLabel: "Ir al inicio",
    scope: "global",
  },
  {
    id: "programa",
    title: "Crear un proyecto (programa)",
    body: [
      "Un programa es el plan de growth de un periodo, con fechas, calendario y equipo. El arranque rápido lo arma en una sola pantalla.",
    ],
    points: [
      "Elija una o más líneas de las plantillas telco.",
      "Deje el calendario típico de telco: picos, congelamientos y punto de decisión.",
      "¿Prefiere ir con calma? Use el asistente paso a paso.",
    ],
    mock: "wizard",
    href: "/programas/nuevo",
    hrefLabel: "Crear un programa",
    scope: "global",
  },
  {
    id: "lineas",
    title: "Configurar líneas: norte, árbol y embudo",
    body: ["Cada línea tiene tres piezas, y vienen prellenadas desde la plantilla. Usted revisa y ajusta."],
    points: [
      "Métrica norte y su eficiencia.",
      "Árbol: las métricas de entrada que mueven la norte.",
      "Embudo: las etapas donde se ubican las oportunidades de mejora.",
    ],
    mock: "line",
    href: "/programas",
    hrefLabel: "Ir a Programas",
    scope: "program",
  },
  {
    id: "carga",
    title: "Cargar los valores semanales",
    body: ["Cada lunes se cargan los números de la semana anterior, todos en una sola pantalla. El Arriero le recuerda."],
    points: [
      "Semanas desde el lunes.",
      "Puede pegar directo desde Excel.",
      "Con los valores, el semáforo le dice si va para la meta.",
    ],
    mock: "weekly",
    href: "/programas",
    hrefLabel: "Ir a Programas",
    scope: "program",
  },
  {
    id: "problema",
    title: "Registrar una oportunidad de mejora",
    body: ["La oportunidad de mejora dice dónde se pierde valor: línea, etapa del embudo y canal, con su evidencia."],
    points: [
      "Adjunte la evidencia: PDF, imagen o CSV.",
      "Escriba la causa raíz que sospecha.",
      "Márquela validada cuando el dato lo confirme.",
    ],
    mock: "problem",
    href: "/programas",
    hrefLabel: "Ir a Programas",
    scope: "program",
  },
  {
    id: "ejercicios",
    title: "Crear y priorizar ejercicios",
    body: ["De cada oportunidad de mejora salen ejercicios. Se califican con ICE y el backlog los ordena por puntaje final."],
    points: [
      "Hipótesis SI / ENTONCES / PORQUE.",
      "ICE de 1 a 10: impacto, confianza y facilidad.",
      "El calendario suma y el poco control resta.",
    ],
    mock: "backlog",
    href: "/programas",
    hrefLabel: "Ir a Programas",
    scope: "program",
  },
  {
    id: "diseno",
    title: "Diseñar, lanzar y bloquear el diseño",
    body: [
      "Antes de lanzar se diseña: tipo de prueba, variantes, duración y regla de decisión. Al pasar a En prueba, el diseño queda bloqueado para que nadie cambie las reglas en la mitad.",
    ],
    points: [
      "Exactamente una variante es el control.",
      "No se lanza en congelamiento, salvo que el owner lo justifique.",
      "Solo el owner desbloquea el diseño, con justificación.",
    ],
    mock: "design",
    href: "/programas",
    hrefLabel: "Ir a Programas",
    scope: "program",
  },
  {
    id: "resultados",
    title: "Leer resultados y decidir",
    body: ["Cargue muestra y conversiones de cada variante. El Arriero calcula la diferencia contra el control y la probabilidad de ganar."],
    points: [
      "Veredicto: ganador, perdedor o no concluyente.",
      "Decisión: escalar, ajustar o apagar.",
      "El aprendizaje es obligatorio.",
    ],
    mock: "results",
    href: "/programas",
    hrefLabel: "Ir a Programas",
    scope: "program",
  },
  {
    id: "tableros",
    title: "Tableros: Gantt, Kanban y Ruta",
    body: ["Tres formas de ver lo mismo, con filtros en la dirección de la página para compartirlos."],
    points: [
      "Gantt: fechas, picos, congelamientos y el punto de decisión en amarillo.",
      "Kanban: los ejercicios por estado, para arrastrar.",
      "Ruta: Ahora, Siguiente y Después.",
    ],
    mock: "boards",
    href: "/tableros",
    hrefLabel: "Ir a Tableros",
    scope: "global",
  },
  {
    id: "insights",
    title: "El carriel de insights",
    body: ["Lo que la gente ve, oye o sospecha se guarda aquí, para todos. De un insight nacen oportunidades de mejora, proyectos y pilotos."],
    points: [
      "El bombillo de arriba (o la tecla I) lo anota en diez segundos: una frase y su fuente.",
      "«Yo también lo he visto» suma evidencia de que no es un caso aislado.",
      "Convertir en oportunidad de mejora, armar proyecto o crear piloto lo deja sembrado.",
    ],
    mock: "problem",
    href: "/insights",
    hrefLabel: "Ir al carriel",
    scope: "global",
  },
  {
    id: "pilotos",
    title: "Pilotos de medios",
    body: ["Pruebas controladas de cambios en medios para medir incrementalidad antes de escalar. Tienen su propio flujo de aprobación."],
    points: [
      "Borrador, En revisión, Aprobado, En prueba, En lectura y Decidido.",
      "Grupo de prueba contra grupo control.",
      "La estadística la hace el motor del Arriero, nunca la IA.",
    ],
    mock: "pilots",
    href: "/pilotos",
    hrefLabel: "Ir a Pilotos",
    scope: "global",
  },
  {
    id: "direccion",
    title: "Resumen ejecutivo para dirección",
    body: ["Para el CMO, el CEO o quien lidera growth: ¿estamos creciendo? Todo en una página."],
    points: [
      "Las preguntas del comité, por semana o por mes.",
      "Copie el resumen o descargue el CSV.",
      "Estado de cada programa y de los pilotos.",
    ],
    mock: "direction",
    href: "/direccion",
    hrefLabel: "Ir al resumen ejecutivo",
    scope: "global",
  },
  {
    id: "roles",
    title: "Roles y permisos, en palabras sencillas",
    body: ["Cada persona tiene un rol en cada programa. Así nadie pisa lo que no le toca."],
    points: [
      "Admin: crea programas y usuarios; puede todo.",
      "Owner: dueño del programa. Invita, decide y desbloquea.",
      "Colaborador: configura, carga datos, crea y prioriza.",
      "Agencia: crea ejercicios y trabaja los que tiene asignados.",
      "Lector: mira todo y no cambia nada.",
    ],
    mock: "roles",
    href: "/programas",
    hrefLabel: "Ir a Programas",
    scope: "program",
  },
];
