# Pilotos · cómo prender La Tía y las integraciones

> **Estado (28 sep 2026): todo apagado.** El módulo funciona 100 % manual. Lo de abajo ya está construido y probado sin red; se prende con variables de entorno.

## 1. La Tía en Pilotos (borradores de IA)

Qué hace: diagnóstico de la línea base, recomendación de diseño y riesgos, y borrador de conclusión. Todo sale como **"Borrador de la Tía"** hasta que alguien lo edita o lo aprueba. Los números los pone el motor de Arriero; La Tía solo los cuenta en palabras.

Para prenderla, siga [`../la-tia.md`](../la-tia.md): `ANTHROPIC_API_KEY` y `NEXT_PUBLIC_TIA_ENABLED=true` en `.env.local` y en Vercel, y luego vuelva a desplegar. Aparece en el asistente (pasos 1 y 2) y en la pestaña Lectura.

## 2. Integraciones por MCP (Meta primero)

Lo que ya existe:

- Migración `013_pilotos_integraciones`:
  - `pilot_integration_connections`: una conexión por plataforma y cuenta, con estado y sin el token.
  - `pilot_snapshots`: guarda la consulta, la respuesta cruda de la herramienta MCP, el JSON validado, los tokens de consumo y el estado.
  - Funciones `set_integration_token` y `get_integration_token`: guardan y leen el token en **Supabase Vault**, y solo las ejecuta el servidor.
- `src/domain/pilots/integrations.ts` (con tests):
  - Listas blancas de herramientas **de solo lectura** por plataforma.
  - Armado de la petición: `mcp_servers` más `mcp_toolset` con todo apagado salvo esa lista, y el encabezado `anthropic-beta: mcp-client-2025-11-20`.
  - Lectura de los bloques `mcp_tool_use` y `mcp_tool_result`.
  - Limpieza y validación del JSON con zod.
- `src/server/integrations/mcp.ts`: `extractWithMcp`.
  - Hasta 2 reintentos si el JSON no valida.
  - Bloquea y registra cualquier intento de usar herramientas de escritura.
  - Siempre guarda el snapshot.
  - Si algo falla, el piloto sigue en manual.
- `/api/cron/pilotos-sync`: responde "apagado" mientras `PILOTS_MCP_ENABLED` no sea `true`.
- Los datos corregidos a mano sobre un dato traído por integración quedan como **"ajustado"**, con quién lo corrigió, cuándo y el valor original.

Pasos para prender Meta:

1. Aplicar `Descargas/arriero-pilotos-integraciones.sql` en el SQL Editor de Supabase.
2. Crear una app en Meta for Developers con permiso **`ads_read`** (solo lectura) y generar el token de la cuenta publicitaria. No lo pegue en el chat.
3. Poner `PILOTS_MCP_ENABLED=true` (con la `ANTHROPIC_API_KEY`) en `.env.local` y en Vercel.
4. Conectar la cuenta en **Pilotos › Catálogos › Integraciones** (solo aprobadores): nombre, id `act_…` y el token en el campo de contraseña. El servidor lo guarda en Vault (`set_integration_token`, con la secret key) y nunca lo muestra. "Probar conexión" trae la inversión de ayer.

Lo que queda andando al prenderlas:

- **Traer datos de Meta** (pestaña Datos de un piloto aprobado, en prueba o en lectura con un medio de Meta y cuenta conectada): extrae el rango del piloto hasta ayer (máximo 92 días), la persona confirma a qué grupo va cada campaña/conjunto/anuncio y se guardan como `source: mcp` con su `snapshot_id`. El mapeo queda en `pilot_snapshots.query.entity_map` y el sync lo reusa. Lo cargado a mano o ajustado a mano nunca se pisa. Cada dato traído tiene "¿De dónde sale?" con la extracción (fecha, cuenta, rango, estado, intentos, tokens y JSON validado).
- **Sync diario** `/api/cron/pilotos-sync` (Vercel Cron, 11:00 UTC): por cada cuenta conectada guarda los hechos de ayer por campaña en `ad_facts`; por cada piloto en prueba con Meta en esa cuenta, sus datos de ayer (en pilotos semanales, la semana hasta ayer). Máximo 15 pilotos y 4 minutos por corrida.
- **Campañas** (`/pilotos/campanas`): inversión, impresiones, clics, CTR, CPC, conversaciones y costo por conversación por campaña, frente al periodo anterior, con las marcas "gasta sin conversaciones" y "costo por conversación subió más de 20 %". Debajo, **Plataforma vs. negocio**: CSV de ventas (Fecha, Canal, Campaña, Ventas, Ingresos y Clave opcionales; la clave es un hash, nunca el teléfono) y conciliación con CAC real y aviso de doble conteo.

5. GA4, Google Ads y GTM: sus servidores MCP oficiales no tienen versión remota, así que hay que alojarlos en Cloud Run con un bearer propio y poner la URL en `GA4_MCP_URL`, `GOOGLE_ADS_MCP_URL` y `GTM_MCP_URL`. TikTok queda desacoplado hasta que exista un endpoint remoto verificado.

Salvaguardas que no se quitan:
- Solo lectura.
- Temperatura 0.
- Solo JSON con esquema fijo.
- Snapshot de cada extracción.
- Extracción por demanda más un sync diario solo para pilotos en prueba.
- Nunca en cada carga de página.
