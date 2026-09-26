// Voz de ARRIERO: paisa, cercana y de usted (ver docs/brand/concepto.md).

export const SLOGAN = "Menos carreta, más crecimiento.";

export const PHRASES = [
  "¿Y por dónde es?",
  "Cargue lo que importa.",
  "Menos carreta. Más camino.",
  "Probemos por ahí.",
  "Si funciona, seguimos.",
  "La mula no pregunta, avanza.",
  "Del dato al camino.",
  "No cargue por cargar.",
  "El que sabe por dónde es.",
  "Paso a paso se sube la montaña.",
  "Sin afán, pero sin pausa.",
  "Hágale pues, que la montaña no se sube sola.",
  "Más camello y menos reunión.",
  "Un dato vale más que diez opiniones.",
  "Ideas hay muchas; ejercicios medidos, pocos.",
] as const;

export const LOADING_PHRASES = [
  "Ensillando la mula…",
  "Revisando el mapa…",
  "Acomodando la carga en el carriel…",
  "Buscando por dónde es…",
  "Ahí vamos, sin afán…",
  "La mula va subiendo…",
] as const;

/** Frase estable para una clave (el mismo resultado en servidor y cliente, sin diferencias de hidratación). */
export function pickPhrase<T extends readonly string[]>(list: T, key: string): T[number] {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return list[Math.abs(h) % list.length];
}

/** Frase del día (cambia a diario, igual para todos). */
export function phraseOfTheDay(extra = ""): string {
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  return pickPhrase(PHRASES, day + extra);
}
