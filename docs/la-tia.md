# La Tía · copiloto de Arriero con Claude

> **Estado: apagada.** Todo el código está listo, pero no aparece en la app ni llama a Claude hasta que se prenda con `NEXT_PUBLIC_TIA_ENABLED=true` (ver el paso 4).

La Tía lee los datos del programa (métricas, problemas, ejercicios, aprendizajes, calendario) y **propone**. Las decisiones siempre son del equipo: nunca pone veredictos, nunca califica por nadie y cita de dónde saca lo que dice.

## Qué hace

| Función | Dónde aparece |
|---|---|
| **Pregúntele a la Tía** | Botón amarillo en la barra superior de cada programa: chat con los datos del programa |
| **La Tía detectó una oportunidad** | Resumen del programa, junto a "Lo que toca hoy": hasta 3 oportunidades con evidencia y "Convertir en problema" |
| **La Tía tiene una recomendación** | Asistente de ejercicios: hipótesis, calificación ICE sugerida y diseño de la prueba |
| **La Tía le revisa la hipótesis** | Paso de hipótesis: dice si se puede medir, si es concreta y cómo mejorarla |
| **La Tía le lee el resultado** | Al decidir un ejercicio: el resultado en lenguaje simple y un borrador del aprendizaje |
| **La Tía le explica los números** | Métrica norte y tendencia de cada métrica: por qué se movió |
| **La Tía le prepara el comité** | Resumen ejecutivo: el texto listo para leer en la reunión |
| **La Tía le tiene un chismecito** | Aviso de cada lunes con lo más jugoso de la semana |

Todo se pide con un botón (menos el chismecito del lunes), así no se gastan consultas en cada visita.

## Cómo conectarla (pasos)

> La llave de Claude se escribe solo en `.env.local` y en Vercel. **No la pegue en el chat**, ni en el código, ni en ningún documento.

1. **Cuenta en Anthropic.** Entre a [console.anthropic.com](https://console.anthropic.com) con un correo del equipo y cree (o pida acceso a) la organización de la empresa.
2. **Facturación y tope.** En **Settings → Billing**, agregue el medio de pago. En **Settings → Limits**, fije un **tope de gasto mensual** (por ejemplo, USD 50 para arrancar). Así nunca hay sorpresas.
3. **Crear la llave.** En **API Keys → Create Key**, con nombre `arriero-produccion`. Copie la llave (empieza por `sk-ant-`): solo se muestra una vez.
4. **Ponerla en local.** Abra el archivo `.env.local` del proyecto y agregue, usted mismo:
   ```
   NEXT_PUBLIC_TIA_ENABLED=true
   ANTHROPIC_API_KEY=<su llave>
   TIA_MODEL=claude-sonnet-5
   TIA_DAILY_LIMIT=60
   ```
   Reinicie el servidor de desarrollo.
5. **Ponerla en Vercel** cuando publique: **Project → Settings → Environment Variables**, las mismas cuatro variables (Production y Preview). `NEXT_PUBLIC_TIA_ENABLED` se lee al compilar: después de cambiarla hay que volver a desplegar.
6. **Base de datos.** Pegue `Descargas/arriero-la-tia.sql` en el SQL Editor de Supabase. Crea el historial del chat y el registro de consumo.
7. **Probar.** Entre a un programa, abra **Pregúntele a la Tía** y pregunte "¿Qué métrica va peor y por qué?".

## Costos y control

- **Modelo:** `claude-sonnet-5` (rápido y económico). Se cambia con `TIA_MODEL`.
- **Tope por persona:** `TIA_DAILY_LIMIT` consultas al día (60 por defecto). Al llegar al tope, La Tía dice "ya conversó mucho por hoy".
- **Registro de consumo:** cada consulta queda en `tia_usage` (persona, programa, función, tokens). El admin global puede verlo todo.
- **Tope de dinero:** el de la consola de Anthropic (paso 2) manda sobre todo lo demás.

## Datos y privacidad

- La Tía manda a Claude un resumen del programa que la persona **ya puede ver** (se lee con sus permisos, RLS). No manda contraseñas, correos de otras personas ni archivos adjuntos.
- Por defecto, Anthropic no usa los datos que llegan por la API para entrenar sus modelos (revise los términos comerciales vigentes con su área legal o de seguridad si la política de WOM lo exige).
- Los textos del programa (problemas, comentarios) se tratan como datos: si alguno trae instrucciones, La Tía las ignora.

## Arquitectura

- `src/server/tia/client.ts`: llamada a la API de Claude con `fetch` (sin librerías nuevas), con y sin streaming.
- `src/server/tia/run.ts`: verifica la llave y el tope diario, arma el contexto, llama y registra el consumo.
- `src/server/tia/context.ts`: el resumen del programa que ve La Tía.
- `src/domain/tia.ts`: personalidad, reglas de oro, utilidades (con tests).
- `src/components/tia/*`: avatar, tarjetas, chat y botones.
- Imagen: por ahora el tinto de la marca; se cambia en `TiaAvatar` cuando llegue la ilustración de La Tía.
