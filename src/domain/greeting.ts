/** Saludo del inicio según la hora en Bogotá (0–23). Con un chiste corto, como es la casa. */
export function greetingFor(hour: number): { hello: string; quip: string } {
  if (hour >= 5 && hour < 12) return { hello: "Buenos días", quip: "¿Ya se tomó el tinto? Sin tinto no se arrea." };
  if (hour >= 12 && hour < 14) return { hello: "Buenas", quip: "Hora del almuerzo. La mula ya comió; usted verá." };
  if (hour >= 14 && hour < 19) return { hello: "Buenas tardes", quip: "La tarde está pa' decidir cosas. Con datos, eso sí." };
  if (hour >= 19 && hour < 23) return { hello: "Buenas noches", quip: "¿Todavía por aquí? La mula ya se quitó la enjalma." };
  return { hello: "Buenas noches", quip: "¿Usted qué hace trabajando a esta hora? Ni la mula." };
}

/** Hora actual en Bogotá. */
export function bogotaHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "numeric", hourCycle: "h23" }).format(now));
}
