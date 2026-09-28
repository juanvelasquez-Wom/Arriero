import type { Instrumentation } from "next";

// Registro de errores del servidor (auditoría B3): cada error que Next captura en
// una ruta, un server component o una server action queda en public.error_log
// (solo lo escribe el servidor; solo lo lee el admin en /admin/errores).
// Nunca guarda cabeceras, cookies ni el cuerpo de la petición.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { reportServerError } = await import("./server/error-log");
    await reportServerError({
      error: err,
      source: `${context.routeType} ${request.method} ${request.path.split("?")[0]}`,
    });
  } catch {
    // El registro de errores nunca debe tumbar la respuesta.
  }
};
