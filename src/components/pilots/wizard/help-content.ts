// Panel "¿Qué es esto?" de cada paso del asistente de pilotos. Voz de Arriero:
// de usted, cercana, corta. Ejemplos de medios en telecomunicaciones.
import type { StepHelp } from "@/components/setup/help-content";
import type { PilotStepKey } from "@/domain/pilots/flow";

export const PILOT_STEP_HELP: Record<PilotStepKey, StepHelp> = {
  problema: {
    title: "Problema e hipótesis",
    what: "Qué está pasando en medios, con qué evidencia, y qué cambio cree que lo mejora. La hipótesis dice qué hacemos, dónde, qué esperamos mover, cuánto y por qué.",
    why: "Un piloto sin problema es cargar por cargar. Con la hipótesis escrita antes, nadie acomoda la historia después de ver los números.",
    example:
      "Si hacemos videos UGC en lugar de estáticos en CTWA Pospago, esperamos mover la tasa de venta en 10 % porque la gente confía más en alguien como uno.",
    tip: "El % esperado alimenta la calculadora de potencia del paso 3. Sea realista: mejor 8 % creíble que 50 % soñado.",
  },
  prueba: {
    title: "Qué se prueba y cómo",
    what: "La variable que cambia (creatividad, audiencia, destino…), el tipo de prueba, los grupos, los medios donde corre, las fechas y el presupuesto.",
    why: "Cada variable tiene un tipo de prueba que la lee bien. Arriero le recomienda uno; si elige otro, cuente por qué para que el aprobador lo entienda.",
    example: "Variable: formato de la pieza. Tipo: A/B de creatividades con 50 / 50 en Meta, campaña CTWA Pospago, del 5 al 31 de octubre, $ 12 M.",
    tip: "Si otro piloto usa la misma cuenta, campaña, audiencia, ciudad o destino en las mismas fechas, se lo avisamos: los dos se contaminan.",
  },
  metricas: {
    title: "Métricas y potencia",
    what: "La métrica principal define quién gana. Los guardrails son lo que no se puede dañar. La potencia dice qué tan pequeño es el efecto que la prueba alcanza a ver.",
    why: "Si la prueba no alcanza a ver el efecto que espera, va a salir no concluyente por diseño. Mejor saberlo antes de gastar la plata.",
    example: "Principal: tasa de venta. Guardrail: el costo por conversación no sube más de 15 %. MDE alcanzable: 9 % en 28 días.",
    tip: "Las métricas de plataforma (CTR, CPC) miden eficiencia en la plataforma, no venta incremental. Úselas como guardrail más que como principal.",
  },
  reglas: {
    title: "Reglas de decisión",
    what: "Qué resultado lleva a escalar, a ajustar o a apagar. Se registran antes de lanzar.",
    why: "Cuando los números llegan, todo el mundo quiere ver lo que quería ver. Con las reglas escritas antes, la decisión sale sola.",
    example: "Escalar si la probabilidad de ganar es ≥ 90 %, la mejora es ≥ 0 % y ningún guardrail se rompe. Apagar si la probabilidad es ≤ 20 %.",
    tip: "Si no sabe qué poner, deje las de la casa: sirven para la mayoría de pilotos.",
  },
  medicion: {
    title: "Medición y envío",
    what: "Los eventos que tienen que disparar bien (GA4, GTM, píxel o CAPI) para poder leer el piloto. Después, lo envía a revisión.",
    why: "Sin medición no hay lectura. El piloto no se puede lanzar hasta que cada evento de la lista esté verificado.",
    example: "Píxel: Lead al enviar el formulario. CAPI: Purchase desde el CRM. GTM: las etiquetas del piloto disparan en la landing.",
    tip: "Con «Sugerir eventos» arrancamos la lista según los medios del piloto; quite lo que no aplique.",
  },
};
