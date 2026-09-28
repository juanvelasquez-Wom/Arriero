/**
 * Exámenes de cierre de /aprender y /guia y los datos del cartón (certificado).
 * Puro: preguntas, calificación, nivel y número de certificado.
 */

export type CertificateKind = "growth" | "arriero";

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  /** Índice de la opción correcta. */
  answer: number;
  /** Se muestra después de responder. */
  why: string;
}

/** Mínimo para ganarse el cartón. */
export const PASS_MARK = 7;

export const QUIZZES: Record<CertificateKind, QuizQuestion[]> = {
  growth: [
    {
      id: "g-que-es",
      question: "¿Qué es growth, en una frase?",
      options: [
        "Una campaña más grande y con más pauta",
        "Un método: ubicar dónde se pierde valor, probar un cambio y quedarse solo con lo que funciona",
        "Publicar más seguido en redes",
      ],
      answer: 1,
      why: "Growth es método, no volumen. Menos opinión, más evidencia.",
    },
    {
      id: "g-norte",
      question: "La métrica norte de una línea es…",
      options: [
        "La que más subió este mes",
        "El número que representa el valor que la línea quiere crecer",
        "La que el jefe revisa primero",
      ],
      answer: 1,
      why: "Una sola por línea, y todo el árbol empuja hacia ella.",
    },
    {
      id: "g-norte-pospago",
      question: "En Pospago, ¿cuál sirve mejor como métrica norte?",
      options: ["Impresiones de la campaña", "Seguidores en Instagram", "Líneas pospago activadas"],
      answer: 2,
      why: "Las impresiones y los seguidores no pagan factura. Las líneas activadas sí.",
    },
    {
      id: "g-arbol",
      question: "¿Para qué sirve el árbol de métricas?",
      options: [
        "Para descomponer la norte en métricas de entrada que el equipo sí puede mover",
        "Para decorar el informe del comité",
        "Para ver cuántas métricas tenemos",
      ],
      answer: 0,
      why: "Los ejercicios atacan una métrica del árbol, nunca la norte a ciegas.",
    },
    {
      id: "g-problema",
      question: "Una oportunidad de mejora bien planteada en el Arriero trae…",
      options: ["Una corazonada bien argumentada", "Evidencia: los datos que muestran la pérdida", "Un culpable"],
      answer: 1,
      why: "Sin evidencia no hay oportunidad de mejora, hay carreta.",
    },
    {
      id: "g-hipotesis",
      question: "¿Cuál es una hipótesis completa?",
      options: [
        "Probemos un video a ver qué pasa",
        "SI mostramos el precio en el primer mensaje, ENTONCES sube la conversión del chat, PORQUE la gente deja de preguntar lo mismo",
        "El video va a funcionar porque está muy bonito",
      ],
      answer: 1,
      why: "SI, ENTONCES y PORQUE: el cambio, el efecto esperado y la razón.",
    },
    {
      id: "g-ice",
      question: "Impacto 8, Confianza 6 y Facilidad 4. ¿Cuánto da el ICE?",
      options: ["18", "6,0", "8"],
      answer: 1,
      why: "Es el promedio de los tres: (8 + 6 + 4) ÷ 3 = 6,0.",
    },
    {
      id: "g-congelamiento",
      question: "¿Qué se hace durante un congelamiento comercial?",
      options: ["Se lanzan más ejercicios, que hay más tráfico", "No se lanzan ejercicios", "Da igual"],
      answer: 1,
      why: "En temporada fuerte no se mueve lo que está funcionando. Se prueba antes o después.",
    },
    {
      id: "g-no-concluyente",
      question: "El resultado salió no concluyente. ¿Qué es lo sensato?",
      options: [
        "Escalarlo igual, que ya lo pagamos",
        "Ajustar y volver a probar, o apagarlo, y dejar el aprendizaje escrito",
        "Borrarlo para que nadie se entere",
      ],
      answer: 1,
      why: "Un no concluyente también enseña, siempre que quede escrito.",
    },
    {
      id: "g-piloto",
      question: "Un piloto de medios mide incrementalidad comparando…",
      options: ["Lo que dijo la agencia", "El grupo de prueba contra un grupo control", "Este mes contra el anterior, sin más"],
      answer: 1,
      why: "Sin grupo control no se sabe qué habría pasado sin el cambio.",
    },
  ],
  arriero: [
    {
      id: "a-buscar",
      question: "¿Cómo busca cualquier cosa en el Arriero sin dar vueltas?",
      options: ["Con Ctrl + K", "Con F5", "Preguntándole al del puesto de al lado"],
      answer: 0,
      why: "Ctrl + K (o ⌘ + K) abre el buscador desde cualquier pantalla.",
    },
    {
      id: "a-crear",
      question: "¿Por dónde se arma un proyecto de growth nuevo?",
      options: ["En un Excel compartido", "Desde el inicio: «Crear un proyecto de growth» abre el asistente", "Desde la papelera"],
      answer: 1,
      why: "El asistente lo lleva pregunta por pregunta. Lo crea un admin.",
    },
    {
      id: "a-huerfano",
      question: "Cada ejercicio nace de…",
      options: [
        "Una idea suelta en una reunión",
        "Una oportunidad de mejora con evidencia, y apunta a una métrica del árbol de la misma línea",
        "Lo que haya quedado de presupuesto",
      ],
      answer: 1,
      why: "En el Arriero no hay ejercicios huérfanos.",
    },
    {
      id: "a-carga",
      question: "¿Dónde y cada cuánto se cargan los valores de las métricas?",
      options: ["En la carga semanal, semana a semana desde el lunes", "Cuando alguien se acuerde", "Al final del programa"],
      answer: 0,
      why: "El lunes llega el recordatorio. Sin datos no hay lectura.",
    },
    {
      id: "a-bloqueo",
      question: "Al pasar un ejercicio a En prueba, ¿qué le pasa al diseño?",
      options: ["Se borra", "Queda bloqueado: solo el owner lo desbloquea, con justificación", "Cualquiera lo puede cambiar"],
      answer: 1,
      why: "Cambiar las reglas a mitad de partido invalida la prueba.",
    },
    {
      id: "a-decide",
      question: "¿Quién emite el veredicto y la decisión de un ejercicio?",
      options: ["La agencia", "Cualquiera del equipo", "El owner del programa o un admin"],
      answer: 2,
      why: "La agencia ejecuta; el equipo interno es dueño del resultado.",
    },
    {
      id: "a-aprendizaje",
      question: "Al decidir un ejercicio, ¿qué es obligatorio?",
      options: ["Escribir el aprendizaje", "Una foto del equipo", "Un chiste"],
      answer: 0,
      why: "El aprendizaje se reutiliza en otras líneas. Por eso no se salta.",
    },
    {
      id: "a-papelera",
      question: "Borró algo por error. ¿Y ahora?",
      options: ["Se perdió para siempre", "Lo restaura desde la papelera: ahí queda 30 días", "Lo vuelve a escribir de memoria"],
      answer: 1,
      why: "Todo borrado pasa por la papelera, salvo el programa de ejemplo.",
    },
    {
      id: "a-tableros",
      question: "¿Dónde ve todos los programas y pilotos en una sola línea de tiempo?",
      options: ["En Configuración", "En Tableros: Gantt, Kanban y la ruta Ahora / Siguiente / Después", "En la carga semanal"],
      answer: 1,
      why: "Tableros junta todo, con un semáforo de salud en la ruta.",
    },
    {
      id: "a-pilotos",
      question: "En Pilotos de medios, ¿quién calcula los resultados?",
      options: ["La IA", "La agencia, a ojo", "El motor estadístico del Arriero"],
      answer: 2,
      why: "Los números los pone el motor. La IA, cuando se prende, solo los cuenta en palabras.",
    },
  ],
};

export interface QuizGrade {
  correct: number;
  total: number;
  passed: boolean;
}

/** Califica: `answers[i]` es la opción elegida en la pregunta i (o null si no respondió). */
export function gradeQuiz(kind: CertificateKind, answers: readonly (number | null)[]): QuizGrade {
  const questions = QUIZZES[kind];
  const correct = questions.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
  return { correct, total: questions.length, passed: correct >= PASS_MARK };
}

/** Nivel que va en el cartón, según el puntaje. */
export function certificateLevel(correct: number): { title: string; note: string } {
  if (correct >= 10) return { title: "Arriero Mayor", note: "Diez de diez. La mula pidió su autógrafo." };
  if (correct >= 9) return { title: "Arriero de Confianza", note: "Casi perfecto. Una se le escapó, pero la mula no se dio cuenta." };
  if (correct >= 8) return { title: "Arriero Hecho y Derecho", note: "Buen camino, pocas piedras." };
  return { title: "Arriero de Pie Limpio", note: "Pasó raspando, pero pasó. Así se empieza." };
}

/** Frase de consuelo para quien no pasa. */
export function retryMessage(correct: number): string {
  if (correct >= PASS_MARK - 1) return "¡Uy, por un pelito! Repase y vuelva, que ya casi.";
  if (correct >= 4) return "Va por buen camino, pero la mula todavía no le firma. Repase las lecciones y vuelva.";
  return "Tranquilidad, que nadie nace arriando. Repase las lecciones con un tinto y vuelva a intentarlo.";
}

/** Número del cartón: estable para la misma persona, tipo y fecha (hash FNV-1a). */
export function certificateNumber(kind: CertificateKind, name: string, dateIso: string): string {
  let h = 0x811c9dc5;
  for (const ch of `${kind}|${name.trim().toLowerCase()}|${dateIso}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const code = h.toString(36).toUpperCase().padStart(7, "0").slice(-7);
  return `ARR-${kind === "growth" ? "GR" : "HE"}-${dateIso.slice(0, 4)}-${code}`;
}
