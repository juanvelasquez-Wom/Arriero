# Módulo "Pilotos de medios" · plan de implementación

> Estado (28 sep 2026): **implementado y publicado** en modo manual (migraciones 012, 013 y 014). La Tía y las integraciones por MCP están construidas y apagadas: ver [`integraciones.md`](integraciones.md). Este documento queda como el plan y el glosario de referencia.
> Guía de marca que aplica: [`../marca-y-lenguaje.md`](../marca-y-lenguaje.md).

---

## 1. Decisiones que necesito de usted

| # | Decisión | Mi recomendación |
|---|---|---|
| D1 | ¿Dónde viven los pilotos? | **Módulo global** `/pilotos`, fuera de los programas. Tiene sus propios roles (Aprobador, Creador, Lector) y el admin global cuenta como Aprobador. Se vincula de forma opcional a un programa, a un ejercicio y a una métrica del árbol, y solo se ven los que la persona ya puede ver por RLS. |
| D2 | Nombres de estados y decisiones | Reutilizar los de Arriero: **En prueba** en lugar de "En curso", y **Escalar / Ajustar / Apagar** en lugar de "escalar / iterar / matar". Ver el glosario. |
| D3 | Orden de las fases | Primero todo lo manual: flujo, estadística y vistas. Las integraciones van al final, porque dependen de llaves y cuentas que aún no hay. |
| D4 | GA4 y Google Ads | Opción A: sus servidores MCP oficiales alojados por nosotros en **Cloud Run**; necesita un proyecto de Google Cloud. Opción B: llamar directo a la Data API de GA4 y a GAQL, sin MCP. Esta es más simple y barata, pero se aparta del prompt. **Recomiendo A para cumplir el prompt**, dejando B como plan de respaldo. |
| D5 | PDF de la ficha | La ficha se imprime desde el navegador ("Guardar como PDF") con estilos de impresión propios, como ya hace el informe del comité. No agrega librerías. |
| D6 | Asistente IA | Es **La Tía** (ya existe, hoy apagada). Todo lo que redacta sale como "Borrador de la Tía". Para prenderla falta la `ANTHROPIC_API_KEY`. |

## 2. Hallazgos de la verificación de integraciones

La fecha de revisión es el 27 sep 2026; las fuentes están en el informe de investigación.

1. **Conector MCP de la API de Claude** — *verificado*
   - Encabezado `anthropic-beta: mcp-client-2025-11-20`; la versión `2025-04-04` está obsoleta. Existe también `mcp-client-2026-09-15`, que permite fijar la lista de herramientas.
   - `mcp_servers: [{type:"url", url, name, authorization_token}]` más `tools: [{type:"mcp_toolset", mcp_server_name, default_config:{enabled:false}, configs:{<herramienta>:{enabled:true}}}]`. Así queda una **lista blanca** de herramientas de solo lectura.
   - Solo acepta servidores **remotos** (HTTP streamable o SSE), no stdio, y solo expone *tools* (no *resources* ni *prompts*).
   - **La API no hace OAuth**: nosotros conseguimos y renovamos el token.
   - Las respuestas traen bloques `mcp_tool_use` y `mcp_tool_result`, que guardamos crudos en el snapshot.
   - No aplica a retención cero de datos (ZDR). No está en Bedrock ni en Vertex.
2. **Meta Ads** (`https://mcp.facebook.com/ads`) — *parcialmente verificado*
   - Es oficial de Meta y se lanzó el 16 jul 2026, con acceso gradual.
   - Acepta OAuth (Facebook Login for Business) o un **bearer token** propio, lo que permite usarlo desde el servidor.
   - Expone herramientas de lectura (`ads_get_*`, `ads_insights_*`) y también de **escritura** (`ads_create_*`, `ads_update_entity`, `*_delete`). Van en lista blanca solo las de lectura.
   - Sin confirmar: si acepta un token de *system user* con solo `ads_read`, y la duración del token (se asumen unos 60 días, con renovación).
3. **GA4** — *verificado*
   - El servidor oficial de Google es experimental y funciona **solo por stdio**. Autenticación ADC o cuenta de servicio con `analytics.readonly`. Herramientas: `run_report`, `run_funnel_report`, entre otras.
   - Google no ofrece un endpoint remoto: hay que alojarlo en Cloud Run con un puente a HTTP y un bearer propio.
4. **Google Ads** — *parcialmente verificado*
   - El servidor oficial funciona por stdio o por HTTP con proxy OAuth, y trae guía para Cloud Run.
   - Necesita un *developer token*. Herramientas: `search` (GAQL), `list_accessible_customers`.
5. **GTM** — *parcialmente verificado*
   - No hay servidor oficial. El de **Stape** es abierto y reputado, y tiene versión alojada.
   - Tiene herramientas para crear, borrar y **publicar** contenedores; un error ahí puede tumbar la medición.
   - Recomiendo alojarlo nosotros con credenciales `tagmanager.readonly` y lista blanca de lectura. **Fase 1 del checklist de medición: manual.**
6. **TikTok Ads** — *no verificado*
   - La página oficial carga con JavaScript y no se pudo leer. Todo apunta a un servidor local con `TIKTOK_ACCESS_TOKEN`: token de 24 h y *refresh* de un año, sin confirmar.
   - Queda **desacoplado**: un conector que se prende cuando exista. Los servidores de terceros guardan nuestros tokens y exponen escritura, así que no los recomiendo.
7. **Tokens** — se guardan en **Supabase Vault**.
   - Solo se leen desde funciones `SECURITY DEFINER` del esquema `private`, con `EXECUTE` quitado a `anon` y `authenticated`, y solo desde el servidor.
   - Una tabla `integration_connections` guarda el estado, el vencimiento y la cuenta, nunca el secreto.
   - El sync diario renueva lo que esté por vencer.
8. **Vercel** — el plan Hobby permite 300 s por función y 100 crons diarios, suficiente para una llamada con MCP por plataforma.

## 3. Glosario del módulo

Los nombres del prompt son funcionales. A la derecha, el texto final en la interfaz. ★ = término que ya existe en Arriero y se reutiliza con su mismo componente.

| Referencia del prompt | Texto en la interfaz | Nota |
|---|---|---|
| Piloto de medios | **Piloto** (título de sección: "Pilotos de medios") | Nuevo. Se distingue del ejercicio: el piloto prueba un cambio **en medios** |
| Problema | **Problema** ★ | Texto del piloto. Se puede vincular a un problema de un programa |
| Hipótesis | **Hipótesis** ★ con el formato "Si hacemos… en… esperamos mover… en…% porque…" | Mismo componente de la hipótesis SI / ENTONCES / PORQUE |
| Variable a probar | **Qué se prueba** (variable) | Del catálogo de variables |
| Diseño de prueba | **Tipo de prueba** ★ | Arriero ya lo llama así |
| Holdout / conversion lift | **Holdout (grupo sin anuncios)** | Con ⓘ: "Una parte del público no ve la campaña; la diferencia es lo que la campaña de verdad aporta" |
| Geo-experimento | **Por geografía** ★ | Ciudades de prueba vs. ciudades de control |
| A/B split en plataforma | **A/B en plataforma** | |
| A/B de creatividades | **A/B de creatividades** | De 2 a N variantes |
| Pre/post con control | **Antes / después** ★ con la etiqueta **"Evidencia débil"** | El prompt exige "evidencia débil"; en ejercicios se dice "Evidencia direccional" |
| Métrica primaria | **Métrica principal** | Igual que en el asistente de ejercicios |
| Guardrail | **Guardrail (métrica de cuidado)** | ⓘ "Lo que no se puede dañar mientras se prueba. Ej.: el costo por conversación no sube más de 15 %" |
| MDE | **MDE (efecto mínimo detectable)** | ⓘ "El cambio más pequeño que esta prueba alcanza a ver. Si espera menos que esto, la prueba no lo va a notar" |
| Potencia | **Potencia** | ⓘ "Probabilidad de ver el efecto si de verdad existe" |
| Línea base | **Línea base** ★ | |
| Lift | **Diferencia vs. control (lift)** ★ | |
| P(mejor) | **Probabilidad de ganar** ★ / **Probabilidad de ser la mejor** (N variantes) | Bandas "Confiable / Casi / Todavía no se sabe" ★ |
| Intervalo creíble 90 % | **Rango probable (90 %)** | ⓘ "Entre estos valores está, con 90 % de probabilidad, el efecto real" |
| Criterios de decisión | **Reglas de decisión** ★ | Se registran antes de lanzar |
| Escalar / iterar / matar | **Escalar / Ajustar / Apagar** ★ | Mismo `DecisionBadge` |
| Sugerencia automática | "Arriero sugiere: **Escalar**" | La decisión la firma el Aprobador |
| Veredicto | **Ganador / Perdedor / No concluyente** ★ | |
| Checklist de medición | **Lista de chequeo de medición** | Eventos de GA4, GTM, píxel y CAPI |
| Congelamiento del diseño | **Bloqueo del diseño** ★ | "Congelamiento" en Arriero es un periodo del calendario sin lanzamientos |
| Incidente | **Incidente** | Fecha, qué pasó e impacto esperado |
| Estados | **Borrador · En revisión · Aprobado · En prueba ★ · En lectura ★ · Decidido ★ · Cancelado** | "En prueba" en amarillo, como en ejercicios. "Cancelado" es nuevo (un piloto se puede cancelar en curso) y usa el estilo tachado de Descartado |
| Devolver con comentarios | **Devolver a borrador** | Pide el comentario |
| Aprobar | **Aprobar y bloquear diseño** | |
| Creador / Aprobador / Lector | **Creador · Aprobador · Lector ★** | Roles del módulo |
| Responsable | **Responsable** ★ | |
| Medio | **Medio** · catálogo de medios | Modo de datos: **Conectado** (MCP) o **Manual** |
| Brazo / grupo | **Variante** ★ / **Control** ★ / **Grupo de prueba** · **Grupo holdout** | |
| Snapshot | **Extracción** · enlace "¿De dónde sale este número?" | |
| Dato corregido | **Ajustado a mano** (quién, cuándo, valor original) | |
| Borrador IA | **Borrador de la Tía** | Hasta que alguien lo edite o lo apruebe |
| Actualizar datos | **Traer datos de {medio}** | |
| Portafolio | **Portafolio de pilotos** | |
| Ficha ejecutiva | **Ficha para gerencia** · botón "Guardar como PDF" | |
| Biblioteca de aprendizajes | **Aprendizajes de pilotos** ★ | |
| Calendario | **Calendario de pilotos** | |
| Alerta de solapamiento | **"Ojo: estos pilotos se cruzan"** | Explica qué comparten (cuenta, campaña, audiencia, ciudad o destino) |
| Datos de ejemplo | **Ejemplo** ★ (`DemoBadge`) · "Borrar ejemplos" | |
| Métrica de plataforma | Aviso: "Esta métrica mide eficiencia en plataforma, no venta incremental." | Texto del prompt, que ya está en la voz de Arriero |

## 4. Modelo de datos (migraciones 012 a 015)

Todas las tablas llevan `id`, `created_at`, `updated_at`, `created_by` y, cuando aplica, borrado lógico con papelera, igual que el resto de la app.

```
pilot_roles (user_id, role approver|creator|reader)            ← la gestiona el Aprobador; el admin global es Aprobador
media_channels (name, kind, provider, data_mode manual|mcp, integration, archived_at, merged_into_id)
pilot_variables (category, name, description, recommended_design, archived_at)   ← catálogo editable
pilot_settings (design_matrix jsonb, defaults: alpha, power, credible_level)      ← fila única
pilot_metric_catalog (name, source, unit, direction, scope platform|business, media_id nullable = métrica propia)
pilots (title, problem, hypothesis_* , variable_id, test_type, design_justification, design_config jsonb,
        primary_metric_id, power_inputs jsonb, power_result jsonb, decision_rules jsonb,
        planned_start/end, actual_start/end, planned_budget_cop, status, design_locked_at,
        owner_id, approver_id, program_id?, experiment_id?, metric_id?, is_example, deleted_*)
 ├─ pilot_media (media_id, account, campaign, audience, cities text[], destination)   ← base del solapamiento
 ├─ pilot_arms (name, kind control|variant|test|holdout, split_pct, cities text[], is_control)
 ├─ pilot_guardrails (metric_id, comparator, limit_pct|limit_value)   ← de 1 a 3
 ├─ pilot_checklist_items (event, platform ga4|gtm|pixel|capi, status, checked_by/at, evidence)
 ├─ pilot_measurements (arm_id, metric_id, period_start, granularity day|week, value, spend_cop,
 │                       source manual|csv|mcp, snapshot_id?, adjusted_at/by, original_value)
 │   └─ pilot_measurement_history                       ← cada cambio con el valor anterior
 ├─ pilot_snapshots (source, account, date_from/to, query jsonb, raw_tool_result jsonb, validated jsonb,
 │                   status ok|invalid|error, attempts, model, input/output_tokens, error)
 ├─ pilot_incidents (occurred_on, description, expected_impact)
 ├─ pilot_reviews (action submitted|returned|approved, comment)
 ├─ pilot_ai_drafts (kind diagnosis|design|conclusion, content, status draft|edited|approved)
 └─ pilot_learnings (text, verdict, decision, variable, test_type, channel)   ← biblioteca
pilot_audit (table_name, row_id, actor_id, op, old jsonb, new jsonb, at)   ← trigger genérico en todas las tablas pilot_*
integration_connections (provider, account_label, vault_secret_id, status, expires_at)   ← el secreto vive en Vault
```

- **RLS:**
  - Leer: cualquier rol del módulo.
  - Crear y editar en Borrador, cargar datos e incidentes: Creador y Aprobador.
  - Aprobar, devolver, decidir, catálogos y roles: Aprobador.
  - Lector: nada, ni desde la API.
- **Reglas en Postgres** (RPC y triggers de guarda, como en los ejercicios):
  - `submit_pilot`: exige hipótesis, variable, tipo, métrica principal, al menos un guardrail, potencia calculada y reglas de decisión.
  - `return_pilot`, `approve_pilot` (fija `design_locked_at` y avisa si hay solapamiento), `start_pilot`, `move_pilot_to_reading`, `decide_pilot` (decisión, justificación y aprendizaje obligatorios), `cancel_pilot`.
  - Un trigger de guarda impide cambiar campos bloqueados después de Aprobado.
  - Cada cambio de datos después de Aprobado deja un registro de auditoría.

## 5. Rutas y piezas

| Ruta | Qué es |
|---|---|
| `/pilotos` | Portafolio: KPIs (activos, inversión, tasa de escalados), lista o tarjetas, filtros en la URL |
| `/pilotos/nuevo` y `/pilotos/[id]/editar?paso=` | Asistente guiado en **5 pantallas** para los 10 pasos de la metodología: **1** Problema e hipótesis · **2** Qué se prueba y cómo (variable, tipo recomendado, medios, configuración según el tipo) · **3** Métricas y potencia · **4** Reglas de decisión · **5** Medición y enviar a revisión |
| `/pilotos/[id]?tab=resumen\|datos\|lectura\|bitacora` | Ficha de trabajo: carga manual y CSV por periodo y variante, lectura, incidentes y auditoría |
| `/pilotos/[id]/ficha` | Ficha para gerencia, de una página, imprimible |
| `/pilotos/aprendizajes` | Biblioteca con búsqueda y filtros |
| `/pilotos/calendario` | Gantt semanal y mensual con cruces |
| `/pilotos/catalogos` | Medios (editar, fusionar, archivar), variables, métricas y matriz de recomendación |
| `/pilotos/roles` | Roles del módulo |
| `/api/pilotos/[id]/actualizar` · `/api/cron/pilotos-sync` | Extracción por demanda y sync diario de los pilotos en prueba |

- **Dominio puro con tests,** en `src/domain/pilots/`:
  - `lifecycle`, `readiness`, `recommend-design`, `overlap`, `decision-rules`, `csv-template`.
  - `power`: MDE para un n dado y duración para un MDE dado. Reutiliza `normalQuantile` y `sampleSizePerVariant`.
  - `bayes`: Beta-binomial por Monte Carlo con generador aleatorio con semilla, para que sea reproducible en los tests. Soporta N variantes.
  - `bootstrap`: costos por unidad con intervalo.
  - `geo`: diferencias en diferencias, placebo sobre las ciudades de control y control sintético cuando haya al menos 3 ciudades de control y 4 semanas previas.
  - `holdout`: lift incremental y costo por resultado incremental.
- Sin librerías nuevas.

## 6. Fases propuestas (con el orden ajustado)

| Fase | Contenido | Al cerrar se puede… |
|---|---|---|
| **1. Base manual** | Migraciones, roles, RLS y auditoría. Estados y RPC. Asistente guiado. Catálogos, incluido el de medios, con "crear medio escribiendo el nombre". Carga manual y CSV con plantilla. Incidentes. Bloqueo del diseño. Alerta de cruce al crear y al aprobar. | Recorrer un piloto de Borrador a En lectura, solo con datos manuales |
| **2. Motor estadístico y decisión** | Potencia y MDE, bayesiano A/B y N variantes, bootstrap, geo (DiD, placebo, control sintético), holdout, reglas de decisión y sugerencia, alertas de duración y volumen. Decisión y aprendizaje. Tests con casos conocidos. | Cumplir el criterio "de borrador a decidido solo con datos manuales" |
| **3. Vistas** | Portafolio, ficha para gerencia en PDF, biblioteca y calendario con cruces | Mostrarle a gerencia |
| **4. Ejemplos y La Tía** | 3 pilotos de ejemplo que se borran con un clic. La Tía: diagnóstico de línea base, hipótesis, recomendación de diseño y riesgos, borrador de conclusión a partir de los números ya calculados | Necesita la `ANTHROPIC_API_KEY`; sin ella, todo lo demás funciona |
| **5. Meta Ads por MCP** | Conexión y token en Vault. Extracción con JSON validado por zod y hasta 2 reintentos. Snapshots, "¿De dónde sale este número?", ajuste a mano, sync diario y consumo de tokens | Necesita una app de Meta y un token con `ads_read` |
| **6. GA4, Google Ads, GTM y TikTok** | Según D4: servidores en Cloud Run con bearer propio. GTM alimenta la lista de chequeo; TikTok desacoplado hasta que haya endpoint | Necesita un proyecto de Google Cloud y credenciales de solo lectura |

Al cerrar cada fase le digo qué quedó hecho, qué quedó pendiente y cómo probarlo.

## 7. Riesgos

- **Sin llaves no hay IA ni MCP.** Las fases 4 a 6 dependen de la `ANTHROPIC_API_KEY`, de la app de Meta y de Google Cloud. Por eso lo manual va primero y nada del flujo depende de las integraciones.
- **Tokens de Meta y TikTok de corta vida.** Hay que renovarlos. Si la renovación falla, el piloto pasa a modo manual y aparece un aviso; no se bloquea.
- **Escritura accidental en las plataformas.** Se mitiga con lista blanca de herramientas de lectura, credenciales de solo lectura y un test que falla si se habilita una herramienta de escritura.
- **Pruebas geo con pocas ciudades.** DiD con 2 o 3 ciudades da inferencia débil. Se avisa y se muestra el placebo; el control sintético solo corre si hay datos suficientes.
- **Costo de Claude.** Extracción por demanda más un sync diario solo de los pilotos en prueba, con tope diario como el de La Tía y registro de tokens.
- **Datos personales.** Solo se piden agregados (sin datos de clientes). El conector MCP no admite retención cero; revisarlo con legal o seguridad.
- **Relación con el módulo de ejercicios.** Hay que evitar que un piloto y un ejercicio midan lo mismo por duplicado. El vínculo es opcional, y la ficha del ejercicio muestra sus pilotos.
