@AGENTS.md

# CLAUDE.md · ARRIERO Growth Engine

> Guía de trabajo para cualquier agente o persona que toque este repositorio. Si cambian la arquitectura, los comandos o las reglas de negocio, **este archivo se actualiza en el mismo cambio**.
>
> Next.js 16 tiene cambios incompatibles con versiones anteriores (`proxy.ts` en lugar de `middleware.ts`, `params`/`searchParams` como Promise, `retry` en `error.tsx`). Ante la duda, consulta `node_modules/next/dist/docs/` (ver `AGENTS.md`).

---

## 1. Qué es el producto

**ARRIERO · Growth Engine** (lema: *Menos carreta, más crecimiento*). Concepto de marca, metáfora y voz en [`docs/brand/concepto.md`](docs/brand/concepto.md); logos en `public/brand/`.

Una web app interna para **operar un framework de growth marketing** en un equipo de ventas digitales de telecomunicaciones. Cada línea de negocio tiene una métrica norte que se descompone en un árbol de métricas de entrada y un embudo donde se ubican los problemas. De cada problema con evidencia nacen **ejercicios** (cualquier cambio que se quiere probar antes de escalarlo), que se priorizan con ICE más los filtros de calendario y control, se diseñan antes de lanzarse, se prueban fuera de los congelamientos comerciales y se cierran con un veredicto, una decisión y un aprendizaje reutilizable en otras líneas. El equipo interno es dueño del resultado; la agencia ejecuta los ejercicios que se le asignan.

Fuente de verdad del dominio: [`docs/modelo-growth-marketing-wom.pdf`](docs/modelo-growth-marketing-wom.pdf). Especificación funcional completa: [`docs/especificacion.md`](docs/especificacion.md).

**Módulo Pilotos de medios** (`/pilotos`, global, fuera de los programas): pruebas controladas de cambios en medios digitales (Meta CTWA, landings, eCommerce, DOOH, radio…) para medir incrementalidad antes de escalar. Plan, verificación de integraciones y glosario en [`docs/pilotos/plan.md`](docs/pilotos/plan.md); guía de marca y lenguaje en [`docs/marca-y-lenguaje.md`](docs/marca-y-lenguaje.md). Ver §11.

## 2. Glosario del dominio

| Término | Significado en la app |
|---|---|
| **Programa** | Un plan de growth con fechas de inicio y fin, horizontes (H1, H2…), calendario, miembros y configuración de puntaje. Todo cuelga de un programa. |
| **Horizonte** | Tramo del programa con nombre y fechas (p. ej. H1 1 ago – 24 ene). Las métricas tienen un objetivo por horizonte. |
| **Línea** (de negocio) | Pospago, Recargas y paquetes, Equipos móviles, etc. Cada una tiene su métrica norte, su árbol y su embudo. |
| **Métrica norte** | La métrica que representa el valor que la línea quiere crecer (`type = north_star`). Una por línea. Se acompaña de una métrica de **eficiencia** (`type = efficiency`). |
| **Árbol de métricas** | Descomposición de la métrica norte en métricas de **entrada** (`type = input`) mediante `parent_id`. Cada entrada pertenece a una **rama**: volumen de demanda, conversión, eficiencia, o recuperación y recurrencia. Los ejercicios atacan métricas del árbol. |
| **Embudo** | Etapas ordenadas del recorrido del cliente en una línea. Por defecto: Adquisición, Activación, Conversión, y Recuperación y recurrencia. Editables. |
| **Problema** | Una pérdida de valor ubicada en línea + etapa + canal, con **evidencia**, causa raíz hipotética, impacto, control y estado (por validar, validada, descartada). En la interfaz (programas y pilotos) se muestra como «**Oportunidad de mejora**» (femenino: «la oportunidad de mejora validada»); en código, tablas y rutas sigue siendo `problem` / `/problemas`. |
| **Ejercicio** | Unidad central. Un cambio a probar. Siempre nace de un problema y apunta a una métrica del árbol de la misma línea. Hipótesis SI / ENTONCES / PORQUE. |
| **Variante** | Cada brazo de la prueba. Exactamente uno es el **control** (`is_control`). Guarda muestra, conversiones y valor de la métrica. |
| **ICE** | Promedio de Impacto, Confianza y Facilidad (1–10), a un decimal. |
| **Filtros** | **Calendario** (`fits_calendar`: se puede leer antes de los picos → bono) y **control** (nuestro, compartido o externo → penalidad). ICE + filtros = **puntaje final**. |
| **Pico** (`peak`) | Periodo comercial fuerte (Black Friday–Cyber, diciembre). Se muestra como marcador. |
| **Congelamiento** (`freeze`) | Periodo en que no se lanzan ejercicios. Advertencia al planear; bloqueo al pasar a En prueba salvo forzado del owner con justificación. |
| **Punto de decisión** (`decision`) | Fecha formal (p. ej. enero) en que se decide qué se escala y se libera el siguiente tramo de inversión. Línea amarilla en el Gantt. |
| **Bloqueo del diseño** | Al pasar a En prueba se fija `design_locked_at`; el diseño queda de solo lectura. Solo el owner lo desbloquea, con justificación. |
| **Veredicto** | Lectura del resultado frente a la regla de decisión: ganador, perdedor o no concluyente. Lo emite una persona. |
| **Decisión** | Qué se hace: escalar, ajustar o apagar. Con justificación. |
| **Escalado a BAU** | El ejercicio ganador pasó a la operación normal. |
| **Aprendizaje** | Texto obligatorio al decidir un ejercicio; indica a qué líneas aplica y puede originar ejercicios derivados en otras líneas. |
| **Papelera** | Lista por programa de lo borrado lógicamente (`deleted_at`). Se restaura o se elimina definitivamente; se purga sola a los 30 días. |
| **Programa de ejemplo** | Programa `is_demo = true` con datos inventados ("Programa demo · Telco Andina"). Único; lo carga y lo borra un admin, y se borra de forma definitiva sin pasar por la papelera. |

## 3. Stack y comandos

- **Next.js 16** (App Router) + **TypeScript** estricto · Node ≥ 22.18 (se usa Node 24; los scripts `.mts` corren sin compilar)
- **Tailwind CSS 4** + **shadcn/ui** (estilo radix-nova, en `src/components/ui`; `cn` viene del paquete `cn`)
- **Supabase**: Auth, Postgres, RLS, Storage, Realtime · **@supabase/ssr** · **Supabase CLI** (dependencia de desarrollo)
- **zod** + **react-hook-form** · **Recharts** · **dnd-kit** (Kanban) · Gantt propio (posicionamiento absoluto, sin librerías)
- **Vitest** (dominio y tests de integración contra la base) · **Playwright** (smoke E2E)
- Despliegue en **Vercel** (`vercel.json` define el cron de la papelera)

| Tarea | Comando |
|---|---|
| Instalar | `npm install` |
| Desarrollo | `npm run dev` |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Typecheck (genera los tipos de rutas con `next typegen` y corre `tsc`) | `npm run typecheck` |
| Tests de dominio | `npm test` |
| Tests de RLS, borrado y ejemplo (contra Supabase) | `npm run test:db` |
| Smoke E2E | `npx playwright install chromium` (una vez) y `npm run test:e2e` |
| Login de la CLI (una vez, interactivo) | `npx supabase login` |
| Vincular proyecto | `npm run db:link` |
| Nueva migración | `npx supabase migration new <nombre>` |
| Aplicar migraciones | `npm run db:push` |
| Generar tipos | `npm run db:types` |
| Crear primer admin | `npm run create-admin -- --email <correo> --name "<nombre>"` |
| Borrar archivos pendientes de Storage | `npm run storage:drain` |

Proyecto de Supabase: ref `orehfqgrohqdoxmboczu`. No se crea otro. Variables en `.env.local` (plantilla en `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, y para La Tía `NEXT_PUBLIC_TIA_ENABLED`, `ANTHROPIC_API_KEY`, `TIA_MODEL` (Sonnet), `TIA_MODEL_FAST` (Haiku), `TIA_DAILY_LIMIT`, `TIA_USD_COP` (ver §17).

## 4. Arquitectura

```
docs/                         PDF del modelo y especificación
supabase/
  config.toml                 config de la CLI (registro cerrado, site_url)
  migrations/                 001 esquema · 002 helpers de permisos · 003 reglas (triggers)
                              004 RPC · 005 RLS · 006 Storage y Realtime · 008 mensajes de error en usted
                              009 auditoría V0 (hipótesis obligatoria para diseñar, save_experiment_variants,
                              metrics.unit_value, experiment_comments) · 010 avisos (notifications + job diario)
                              011 La Tía (tia_messages, hoy sin uso; tia_usage) · 012 Pilotos de medios · 013 integraciones de Pilotos (ver §11)
scripts/                      create-admin.mts, drain-storage-queue.mts (usan la secret key)
src/
  proxy.ts                    refresca la sesión y protege todo salvo login/recuperar/auth/confirm/api/cron
  app/
    (auth)/login, recuperar, restablecer
    auth/confirm              recibe enlaces de invitación y recuperación (token_hash, code o fragmento)
    (app)/programas           Mis programas · ejemplo · programas en la papelera
    (app)/programas/nuevo     arranque rápido (y ?paso=programa: paso 1 del asistente)
    (app)/admin/usuarios      administración de usuarios (solo admin global): crear, admin sí/no,
                              enlace de contraseña, bloquear
    (app)/programas/[programId]/
      page                    resumen + lista de primeros pasos
      configuracion?paso=…    asistente guiado (ver "Crear y configurar un programa" abajo)
      lineas/[lineId]?tab=norte|arbol|embudo
      carga?semana=           carga semanal en lote
      problemas, problemas/nuevo, problemas/[id]
      ejercicios (backlog), ejercicios/nuevo, ejercicios/[id]?tab=, ejercicios/[id]/editar?paso=
      aprendizajes, papelera
      tableros/gantt|kanban|resultados|portafolio (filtros globales en la URL)
    (app)/direccion           RESUMEN EJECUTIVO para dirección (CMO/CEO/Head of Growth): ¿estamos creciendo?,
                              las 9 preguntas del comité (semana|mes), copiar resumen, CSV, estado por programa
    (app)/programas/[programId]/informe?periodo=semana|mes   informe para el comité de un programa
    (app)/programas/[programId]/equipo   carga por persona (en prueba, listos para leer, vencidos, quietos)
    api/cron/purgar-papelera  job diario (Vercel Cron, Bearer CRON_SECRET)
    api/cron/avisos           job diario: generate_daily_notifications (ya se puede leer, ideas quietas,
                              congelamientos, recordatorio de carga del lunes)
  domain/                     LÓGICA DE NEGOCIO PURA, con tests *.test.ts al lado
    scoring · lifecycle · results · calendar · permissions · deletion · dashboards
    stats (probabilidad de ganar, intervalo) · value (valor en pesos) · sample-size · targets (semáforo meta)
    experiment-inference · experiment-templates · similarity · home (lo que toca hoy) · paste-import
    evidence · search · quick-start · rollup · report · executive · workload · notifications · glossary · csv
    dashboard-filters · gantt · metric-tree · onboarding · dates · format · labels · types
  server/
    auth.ts                   getSessionUser, requireUser, getProgramContext, getActionActor
    users.ts                  provisionUser (crea la cuenta de Auth; nunca fija contraseñas) y passwordLink
    queries/                  lecturas para server components (programs, structure, experiments, wizard)
    actions/                  server actions: zod → dominio → Supabase (auth, programs, members, problems,
                              experiments, metrics, stages, metric-values, delete, trash, demo)
    demo/                     data.ts (datos inventados) y loader.ts (carga/borrado del ejemplo)
  lib/
    supabase/server.ts        cliente SSR con cookies (usuario actual, RLS)
    supabase/client.ts        cliente de navegador (Storage, Realtime, confirmación de enlaces)
    supabase/admin.ts         cliente con secret key + drainStorageDeletionQueue; `import "server-only"`
    supabase/proxy.ts         updateSession
    validation/               esquemas zod compartidos por formularios y acciones
    action-result.ts          ActionResult, fromZod, toUserMessage (errores de Postgres → español)
  components/
    ui/                       shadcn/ui (no editar a mano salvo necesidad)
    app/                      piezas compartidas: header, nav, badges, DeleteButton, ConfirmAction,
                              UrlFilters, adjuntos, estados vacíos/errores, RealtimeRefresh
    setup/ problems/ experiments/ lines/ dashboards/   componentes por módulo
tests/
  db/                         integración contra Supabase: rls, deletion, demo (crean y limpian sus datos)
  e2e/                        Playwright: smoke del flujo principal
```

**Crear y configurar un programa** (pensado para quien no conoce el modelo de growth)

- `/programas/nuevo` abre directo el **arranque rápido** (`?paso=rapido` sigue funcionando): una sola pantalla con nombre (vacío = sugerido por `suggestProgramName`), una o más líneas (tarjetas de plantillas telco + "Otra línea" con nombre), inicio (hoy), duración (6 meses) y calendario típico de telco (activado). Muestra en vivo lo que va a crear y con "Arme el programa" (`saveQuickStart`, plan en `src/domain/quick-start.ts`) crea programa, calendario, horizontes y cada línea con norte, eficiencia, árbol y embudo; termina en "Nuevo problema" con `?desde=arranque&linea=<primera línea>`. Al lado, el plegable "¿Nuevo en growth? Así funciona" (`GrowthPrimer`: abierto si aún no hay programas; recuerda la elección en `localStorage`). El enlace "Prefiero configurarlo todo paso a paso" lleva a `?paso=programa`.
- Asistente paso a paso: `/programas/[id]/configuracion?paso=<clave>[&linea=<id>]` con las claves de `src/domain/setup-flow.ts`. Camino principal: `programa` → `calendario` (picos, congelamientos, punto de decisión y, en la misma pantalla, los horizontes propuestos desde el punto de decisión, editables en un desplegable; un programa nuevo arranca con el calendario típico de telco puesto) → `lineas` → una pantalla `linea` por línea ("Configurar {línea}": secciones plegables Métrica norte y eficiencia · Árbol · Embudo, prellenadas desde la plantilla, con chulito si ya están guardadas; un solo "Guarde y siga", `saveLineStep`) → `resumen`. Son 4 + N pantallas (5 con una línea, 7 con tres). **Opcionales** desde el resumen: `equipo` y `puntaje` (vuelven al resumen). Las claves viejas (`horizontes`, `linea-norte|arbol|embudo`) redirigen a las nuevas.
- Se guarda al avanzar (`src/server/actions/setup.ts`). `programs.setup_step`: 1 programa · 2 calendario sin horizontes (solo programas del asistente anterior) · 3 calendario y horizontes · 4 líneas · 5 cierre. El avance dentro de cada línea se deduce de los datos. `resumeStep` decide dónde retomar e `isReachable` impide saltar pasos; con las líneas creadas se abre todo y aparece "Terminar después · ir al resumen" (`canFinishEarly`). Lo pendiente (líneas sin configurar, línea base y metas) queda en el resumen y en "Primeros pasos" del programa.
- Ayudas: panel "¿Qué es esto?" y textos en `src/components/setup/help-content.ts`; burbujas ⓘ (`InfoTip`) por campo; botones "Usar ejemplo"/"Volver a las sugerencias". Plantillas y sugerencias en `src/domain/growth-templates.ts`. Microanimaciones de `globals.css`: `.slide-in` al cambiar de paso, `.pop-in` en chulitos, `.stagger` en listas de tarjetas, `.fill-in` en la barra de avance, `.lift` en tarjetas clicables.
- Se mantiene el término de la metodología, **horizonte** (H1, H2), siempre explicado como "tramo del programa con su propia meta".

**Acceso a Supabase**

- **Server components y server actions** usan `lib/supabase/server.ts`: actúan como el usuario y **RLS decide**.
- **Client components** usan `lib/supabase/client.ts` solo para subir a Storage (la política valida la ruta), Realtime y los enlaces de correo. Las escrituras de datos van por server actions.
- **`lib/supabase/admin.ts`** (secret key) solo en: invitaciones (crear el usuario de Auth), script del primer admin, carga y borrado del programa de ejemplo, borrado de archivos de Storage tras eliminaciones definitivas y el cron de purga.
- Todo lo que cambia estado, borra, restaura o toca varias tablas es **RPC en Postgres** (`transition_experiment`, `decide_experiment`, `unlock_design`, `lock_design`, `delete_*`, `deletion_impact`, `restore_trash_item`, `purge_trash_item`, `empty_trash`, `purge_expired_trash`). Las RPC revalidan el rol y activan `private.bypass_guard()` solo después de validar.
- Después de cada escritura: `revalidatePath('/programas/<id>', 'layout')`. El layout del programa monta `RealtimeRefresh`, que hace `router.refresh()` cuando otro usuario cambia datos.

## 5. Modelo de datos

Tablas de dominio: `id uuid`, `created_at`, `updated_at` (trigger), `created_by`, y para borrado lógico `deleted_at`, `deleted_by`, `deletion_batch` (lote que agrupa todo lo borrado en una misma operación). `program_id` está denormalizado en todas las tablas hijas y lo fijan los triggers a partir del padre (no se puede falsear).

```
profiles (id = auth.users.id, name, email, is_admin)            ← trigger al crear el usuario de Auth
programs (name, description, is_demo único, fechas, scoring_config, setup_step, setup_completed_at)
 ├─ program_horizons (name, fechas, sort_order)
 ├─ program_members (user, role)  único (program, user); siempre queda ≥1 owner
 ├─ calendar_events (type peak|freeze|decision, name, fechas)
 ├─ business_lines (name, sort_order)                           ← trigger: 4 etapas por defecto
 │   ├─ metrics (parent_id, type, branch, unidad, dirección, baseline, owner) · 1 norte activa por línea
 │   │   ├─ metric_targets (metric, horizon, target)
 │   │   └─ metric_values (week_start lunes, value, note) único (metric, week) → metric_value_history
 │   ├─ funnel_stages (name, sort_order, description, metric_id)
 │   └─ problems (stage, channel, title, evidence, root_cause, impact, control, status)
 │       └─ experiments (problem_id y metric_id NOT NULL, hipótesis, ICE, filtros, ice_score/final_score
 │           │   calculados, owner, status, status_changed_at, diseño, fechas, design_locked_at,
 │           │   decided_at, verdict, decision, derived_from_learning_id)
 │           ├─ experiment_variants (is_control único, sample, conversions, metric_value, notes)
 │           └─ learnings (text, applies_to_line_ids, suggested_hypothesis) · 1 activo por ejercicio
attachments (entity_type + problem_id | experiment_id, storage_path, mime, tamaño ≤ 20 MB)
experiment_comments (experiment, body, created_by)                ← menciones con @nombre generan avisos
notifications (user, kind, title, body, href, dedupe_key, read_at) ← solo triggers y el job diario escriben
activity_log (actor, action, entity, summary, payload)           ← solo triggers y RPC escriben
trash_items (entity_type, entity_id, label, batch_id)            ← raíz de cada borrado
storage_deletion_queue (storage_path)                            ← trigger al eliminar un adjunto; lo vacía el servidor
```

Storage: bucket privado `attachments`, ruta `{program_id}/{problem|experiment}/{entity_id}/{uuid}-{nombre}`. PDF, imágenes, CSV y XLSX, 20 MB.

## 6. Reglas de negocio

| # | Regla | Dónde |
|---|---|---|
| 1 | **No hay ejercicios huérfanos.** `problem_id` y `metric_id` obligatorios y de la misma línea. | `NOT NULL` + `private.experiments_coherence` · asistente paso 1 |
| 2 | **Puntaje.** ICE = promedio(I, C, F) a un decimal. Final = ICE + bono calendario − penalidad de control (defaults +1, −1, −3; `programs.scoring_config`). | `domain/scoring.ts` · `private.compute_ice/compute_final_score` + trigger `c_experiments_scoring` y recálculo al cambiar la configuración |
| 3 | **Ciclo de vida.** Idea → Priorizado → En diseño → En prueba → En lectura → Decidido → Escalado a BAU; Descartado desde Idea, Priorizado o En diseño (se permite volver atrás entre Idea, Priorizado y En diseño). Requisitos de cada paso según la especificación. Decidido solo owner/admin y con aprendizaje obligatorio. | `domain/lifecycle.ts` (mensajes en la UI) · RPC `transition_experiment` y `decide_experiment` · guarda `b_experiments_guard` impide cambiar `status` directo |
| 4 | **Bloqueo del diseño.** En prueba fija `design_locked_at`; tipo, métricas, duración, regla, métrica del árbol y definición de variantes quedan de solo lectura (los resultados sí se cargan). Desbloqueo solo owner/admin con justificación en `activity_log`. | guardas `b_experiments_guard` y `a_variants_guard` · RPC `unlock_design` / `lock_design` |
| 5 | **Congelamientos.** Advertencia al planear si las fechas cruzan un `freeze`; bloqueo del paso a En prueba si el inicio cae dentro, salvo forzado del owner/admin con justificación (queda en `activity_log`). | `domain/calendar.ts` · `transition_experiment` |
| 6 | **Resultados.** Tasa = conversiones / muestra; diferencia relativa vs control (sobre la tasa o, si no hay conversiones, sobre el valor de la métrica). Divisiones por cero → `null`. En A/B, probabilidad de ganar (beta-binomial, aprox. normal) e intervalo del lift; geo y antes/después = evidencia direccional. Valor estimado = lift × volumen semanal × `metrics.unit_value` (no aplica a tasas). Confeti solo con ganador y probabilidad ≥ 95 %. | `domain/results.ts`, `stats.ts`, `value.ts` |
| 7 | **Duración.** Advertencia si el ejercicio corrió menos días que la duración mínima al cerrarlo. | `domain/calendar.ts#durationWarning` · barra de transiciones y diálogo de decisión |
| 8 | **Borrado.** Lógico con papelera y lote; confirmación con impacto (`deletion_impact`); programa exige su nombre; problema/métrica/etapa con dependientes → reasignar o borrar juntos; línea en cascada; ejercicio con variantes, adjuntos y aprendizaje; restaurar exige que el padre esté activo; eliminación definitiva por FK en cascada + cola de Storage; purga a los 30 días por cron; todo en `activity_log`. | `domain/deletion.ts` · RPC `delete_*`, `restore_trash_item`, `purge_trash_item`, `empty_trash`, `purge_expired_trash` · `DeleteButton` · `/api/cron/purgar-papelera` |

Reglas agregadas tras la auditoría 360°:
- Pasar a **En diseño** exige la hipótesis completa (SI, ENTONCES y PORQUE) — `lifecycle.ts` y `transition_experiment`.
- El asistente de ejercicios **infiere** calendario (de las fechas vs picos y congelamientos, con opción de cambiarlo), control (del problema), métrica principal (la del árbol) y tipo de responsable (del rol).
- Las variantes se guardan todas o ninguna (`save_experiment_variants`) y la edición detecta si otra persona cambió el ejercicio (`expected_updated_at`).
- Explicaciones básicas marcadas con `data-explain`: quien ya conoce el modelo las oculta desde el menú de usuario ("Mostrar explicaciones"). Términos del modelo con `<Term k=…/>` (glosario único en `domain/glossary.ts`).
- El programa de ejemplo usa fechas relativas al día en que se carga (`buildDemoPlan(today)`).

Decisiones tomadas donde la especificación no era explícita:
- "Solo el owner" (desbloquear, forzar congelamiento) incluye al **admin global**.
- La agencia asignada puede mover su ejercicio de Priorizado a En diseño, a En prueba y a En lectura; no prioriza, no descarta y no decide. Al crear un ejercicio, la agencia queda como responsable.
- Un ejercicio **Descartado** se trata como estado temprano para el borrado (lo puede borrar quien lo creó).
- La **etapa** también exige reasignar o borrar juntos sus problemas.
- La papelera de **programas** borrados se ve en "Mis programas" (para owner/admin).
- Las invitaciones intentan el correo de Supabase; si falla (sin SMTP propio), se genera un enlace para compartir a mano.
- **Creación de usuarios:** solo el admin global, desde `/admin/usuarios` (o el script `create-admin` para el primero). Nadie fija contraseñas ajenas: la persona la crea desde un enlace de un solo uso. Siempre queda al menos un admin global; nadie se quita el admin ni se bloquea a sí mismo. Los cambios quedan en `activity_log` con `program_id` nulo. Bloquear usa el `ban` de Supabase Auth.

## 7. Matriz de permisos y RLS

| Acción | Admin | Owner | Collaborator | Agency | Viewer |
|---|---|---|---|---|---|
| Crear programas | ✓ | | | | |
| Invitar miembros y cambiar roles | ✓ | ✓ | | | |
| Editar líneas, métricas, árbol, embudos y calendario | ✓ | ✓ | ✓ | | |
| Cargar valores semanales | ✓ | ✓ | ✓ | | |
| Crear problemas | ✓ | ✓ | ✓ | | |
| Crear ejercicios | ✓ | ✓ | ✓ | ✓ | |
| Editar ejercicios | ✓ | ✓ | ✓ | asignados | |
| Cargar resultados y adjuntos | ✓ | ✓ | ✓ | asignados | |
| Calificar ICE y priorizar | ✓ | ✓ | ✓ | | |
| Veredicto y decisión | ✓ | ✓ | | | |
| Borrar ejercicios en Idea / Priorizado / En diseño | ✓ | ✓ | los que creó | los que creó | |
| Borrar ejercicios en En prueba o posteriores | ✓ | ✓ | | | |
| Borrar problemas, métricas, etapas y líneas | ✓ | ✓ | | | |
| Borrar programas y vaciar papelera | ✓ | su programa | | | |
| Restaurar desde la papelera | ✓ | ✓ | | | |
| Cargar / borrar programa de ejemplo | ✓ | | | | |
| Ver programa y tableros | ✓ | ✓ | ✓ | ✓ | ✓ |

"Asignado" = el usuario de la agencia es el `owner_id` (responsable) del ejercicio.

**Cómo se aplica**

- RLS activa en **todas** las tablas públicas y en `storage.objects`. `anon` no tiene acceso a nada.
- Helpers `SECURITY DEFINER STABLE` en el esquema `private` (no expuesto por la API): `is_admin`, `program_role`, `is_member`, `can_edit` (admin/owner/collaborator), `can_manage` (admin/owner), `can_edit_experiment` (edición general o agencia asignada), `can_attach`, `is_service`.
- `SELECT`: miembro (o admin) y `deleted_at IS NULL`. Escrituras simples con `INSERT`/`UPDATE` según la matriz; **no hay políticas `DELETE`** en las tablas con borrado lógico: borrar es siempre por RPC. Solo `program_members`, `program_horizons` y `metric_targets` (sin papelera) se borran directo, con la misma regla de rol.
- Permisos por columna (ICE, veredicto, estado, bloqueo) en los triggers de guarda, porque RLS no distingue columnas.
- `src/domain/permissions.ts` replica la matriz **solo para la UI**. Nunca es la barrera de seguridad.
- Verificación: `tests/db/rls.test.ts` y `tests/db/deletion.test.ts`.

## 8. Sistema de diseño

Línea ejecutiva y sobria: **grises + amarillo como único acento**. Tokens en `src/app/globals.css`, expuestos como clases de Tailwind (`text-ink`, `text-soft`, `border-line`, `bg-wash`, `bg-paper`, `bg-highlight`, `bg-gray-1…5`).

| Token | Claro | Oscuro |
|---|---|---|
| `--ink` (texto principal) | `#111111` | `#F2F2F0` |
| `--soft` (texto secundario) | `#5C5C5C` | `#A9A9A6` |
| `--line` (bordes) | `#E2E2DF` | `#333333` |
| `--wash` (fondos de sección) | `#F6F6F4` | `#161616` |
| `--paper` (fondo) | `#FFFFFF` | `#1F1F1F` |
| `--accent-yellow` (`bg-highlight`, `primary` de shadcn) | `#F2C200` | `#F2C200` |

- **El amarillo solo para lo que exige atención:** navegación activa, acción primaria (variante `default` de `Button`), punto de decisión, ganadores, estado "En prueba" y alertas (`Callout`). Nunca como decoración. Texto sobre amarillo siempre `#1F1F1F`.
- Estados con `StatusBadge`: grises de distinta intensidad + amarillo para En prueba; `VerdictBadge` amarillo para Ganador. **Siempre ícono + etiqueta**.
- Titulares (h1–h3, `font-heading`) en **Bricolage Grotesque**; texto en **Inter**, ambas vía `next/font`; `tabular-nums` en tablas y tableros. Densidad media. Foco visible con contorno `--ink` (el amarillo no llega a 3:1 sobre blanco).
- Modo oscuro por clase (`next-themes`, por defecto el del sistema), con el conmutador en el header. Logo y mula se invierten con `.brand-ink`.
- Utilidades: `shadow-card`, `lift` (tarjeta clicable que se eleva; no en tarjetas arrastrables), `rise` (entrada), `mule-walk`. Todo respeta `prefers-reduced-motion`.
- Marca en `src/components/brand/`: `Mule`, `LogoLockup`, `LogoFull`; `phrases.ts` (lema y frases, `pickPhrase` estable para evitar diferencias de hidratación); `celebrate()` (confeti CSS para ganador, escalado y programa listo); `JourneyStrip` ("El camino del arriero": Ver → Crecer en el resumen, conteos en `src/domain/journey.ts`).
- **Voz:** siempre de **usted**, paisa, cercana y con humor ("¡Eso!", "Hágale pues", "Ese camino no era"). Nada de "parce" ni similares, nada de voseo ni groserías. Los errores dicen primero qué pasó y cómo se arregla; el chiste, si va, después y corto. Máximo uno por mensaje. Los términos del modelo no se renombran, salvo **Problema → Oportunidad de mejora** por decisión del 29 sep 2026 (solo en la interfaz; código, tablas, rutas y mensajes de las migraciones siguen con `problem`).

## 9. Convenciones

- **Idioma:** interfaz y mensajes en español; código, tablas, columnas y enums en inglés. Las etiquetas visibles salen de `src/domain/labels.ts`.
- **Nombres:** archivos en kebab-case; componentes en PascalCase; funciones de dominio como verbos (`computeFinalScore`, `checkTransition`); tablas en plural snake_case.
- **Componentes:** server components por defecto; `"use client"` solo con interacción. Presentan datos; no deciden reglas.
- **Formularios:** `react-hook-form` + `zodResolver` con el esquema de `lib/validation`, el mismo que valida la server action. Usar `useWatch` (no `watch()`) por el React Compiler.
- **Server actions:** devuelven `ActionResult` (`{ ok: true, data } | { ok: false, error, fieldErrors? }`), nunca lanzan. Los errores de Postgres pasan por `toUserMessage` (los `raise exception` de triggers/RPC ya vienen en español).
- **Estados:** cada ruta de datos tiene `loading.tsx` (skeleton) y `error.tsx` (`RouteError`, usa `retry`). Cada vista vacía tiene un `EmptyState` que explica qué va y el siguiente paso.
- **Filtros:** en la URL (`UrlFilters`, `DashboardFilters`) para que sean compartibles.
- **Fechas:** `date` sin hora (`YYYY-MM-DD`) salvo auditoría (`timestamptz`). Semanas desde el lunes. Presentación en America/Bogota, formato es-CO (`src/domain/format.ts`).
- **Migraciones:** una por cambio lógico; nunca editar una ya aplicada en el proyecto remoto; regenerar tipos tras cada `db push`.
- **Tests:** cada módulo de `src/domain` tiene su `*.test.ts`; cada política relevante tiene un caso en `tests/db`.

## 10. Qué no hacer

- **No saltarse RLS**: no usar el cliente con secret key para resolver un problema de permisos, ni desactivar RLS "temporalmente".
- **No meter lógica de negocio en componentes**: puntajes, transiciones, cálculos y permisos viven en `src/domain` y en la base.
- **No agregar librerías fuera del stack sin preguntar**.
- **No escribir la secret key** (ni `CRON_SECRET`, ni `ANTHROPIC_API_KEY`) en código, `CLAUDE.md`, README, tests, scripts, logs ni commits. Solo `process.env.*` en código de servidor. Nunca con prefijo `NEXT_PUBLIC_`.
- **No usar las llaves antiguas** `anon` / `service_role`.
- **No crear otro proyecto de Supabase.**
- No cambiar `status`, `design_locked_at` ni `deleted_at` con `update` directo: usar las RPC.
- No cargar el programa de ejemplo con SQL suelto: se hace con `server/demo/loader.ts`.
- No borrar archivos de Storage fuera de la cola (`storage_deletion_queue`) o del borrado del ejemplo.
- En Pilotos: no cambiar `status`, `design_locked_at`, decisión ni `deleted_at` con `update` directo (RPC `pilot_*`); no calcular resultados con IA (solo el motor de `src/domain/pilots`); no dar a las integraciones herramientas de escritura.

## 11. Módulo Pilotos de medios

- **Migración** `012_pilotos`: tablas `pilot_roles`, catálogos (`media_channels`, `pilot_variables` = matriz de recomendación, `pilot_metrics` con `calc` sum | rate | cost_per), `pilots` y sus hijos (`pilot_media`, `pilot_arms`, `pilot_guardrails`, `pilot_checklist_items`, `pilot_measurements`, `pilot_incidents`, `pilot_reviews`, `pilot_learnings`) y `pilot_audit` (trigger genérico: quién, cuándo, valor anterior y nuevo).
- **Roles del módulo** (RLS, `private.pilot_role()`; el admin global es Aprobador): Aprobador (aprueba/devuelve, firma decisiones, catálogos, roles, restaura, ejemplos) · Creador (crea y edita borradores, carga datos, incidentes, crea medios y métricas propias de un medio) · Lector (solo ve). Espejo para la UI en `src/domain/pilots/flow.ts`.
- **Estados** Borrador → En revisión → Aprobado → En prueba → En lectura → Decidido (+ Cancelado), solo por RPC: `pilot_submit` (exige lo de `pilot_missing`), `pilot_return` (comentario), `pilot_approve` (fija `design_locked_at`), `pilot_start` (lista de chequeo completa), `pilot_to_reading`, `pilot_decide` (veredicto, decisión, justificación y aprendizaje), `pilot_cancel`, `pilot_delete`/`pilot_restore`, `merge_media`, `delete_example_pilots`.
- **Bloqueo:** fuera de Borrador solo se editan responsable y vínculos; grupos, guardrails y medios solo en Borrador (guardas `pilot_design_child_guard`). Los datos se cargan hasta decidir; un dato de integración corregido a mano queda "ajustado" con su valor original.
- **Estadística determinística** en `src/domain/pilots/` (con tests): `power` (MDE y duración, Bonferroni con N grupos), `bayes` (beta-binomial Monte Carlo con semilla, N variantes), `bootstrap` (costos por unidad), `geo` (DiD, placebo, control sintético), `holdout`, `decision-rules`, `analysis` (`analyzePilot`). La lectura en pantalla sale de `src/server/pilot-reading.ts`. La IA nunca calcula.
- **Datos manuales y CSV** (`data-import.ts`): solo métricas `sum`; plantilla según las métricas del piloto; validación de fechas, grupos, ciudades, negativos y coherencia.
- **Cruces entre pilotos** (`overlap.ts`): mismas fechas y misma cuenta, campaña, audiencia, ciudad o destino.
- **Ejemplos:** 3 pilotos (`domain/pilots/examples.ts`, `server/demo/pilots.ts`) que carga un aprobador y se borran con un clic.
- **La Tía en Pilotos** (`server/actions/pilot-tia.ts`, `pilot_ai_drafts`, `PilotTiaDraft`): borradores de diagnóstico, diseño y conclusión; apagada con `NEXT_PUBLIC_TIA_ENABLED`.
- **Integraciones por MCP** (migración `013`, `domain/pilots/integrations.ts`, `server/integrations/mcp.ts`, `/api/cron/pilotos-sync`): preparadas y apagadas con `PILOTS_MCP_ENABLED`. Tokens solo en Supabase Vault (`set_integration_token` / `get_integration_token`, solo service_role). Cómo prenderlas: [`docs/pilotos/integraciones.md`](docs/pilotos/integraciones.md). Conexiones en Catálogos › Integraciones; "Traer datos de Meta" en la pestaña Datos (`server/actions/pilot-integrations.ts`, escrituras en `server/integrations/pilot-sync.ts`, mapeo puro en `domain/pilots/extraction-mapping.ts`); sync diario a `ad_facts` y a los pilotos en prueba.
- **Campañas** (`/pilotos/campanas`): tabla por campaña desde `ad_facts` con tendencia y marcas (`domain/pilots/campaigns.ts`) y conciliación plataforma vs. negocio con el CSV de `business_conversions` (`domain/pilots/reconciliation.ts`; la clave es un hash, nunca un teléfono).
- **Guardado del diseño** (paso 2) en una transacción: RPC `save_pilot_design` con `expected_updated_at` (bloqueo optimista). El portafolio carga los detalles en lote (`loadPilotDetailsBatch`) y lee con menos muestras (`analyzePilot(input, { draws, iterations })`).

## 12. Cambios de la auditoría integral (28 sep 2026)

Migración `014_matriz_hallazgos` e informe en el artefacto "Auditoría integral Arriero". Lo que cambió en el sistema:

- **Seguridad:**
  - `/dev/entrar` solo responde a peticiones locales (una petición desde la red llega con la IP como host y responde 404).
  - Las invitaciones nunca devuelven un enlace mágico de una cuenta existente. Un owner solo suma a quien ya tiene cuenta; las cuentas nuevas las crea el admin.
  - `safeNext` es único (`src/domain/redirect.ts`).
  - Cabeceras CSP, frame-ancestors, HSTS y nosniff en `next.config.ts`.
  - Crons con `isCronAuthorized` (`src/lib/cron-auth.ts`, comparación en tiempo constante).
  - En Pilotos, el creador edita solo lo suyo (`private.pilot_can_edit`).
- **La Tía:**
  - Cupo reservado de forma atómica con la RPC `tia_reserve`; si no se puede verificar, no llama a Claude.
  - Respuestas con estructura: observado, interpretación, hipótesis, recomendación, confianza y dato que falta.
  - `unverifiedNumbers` avisa si cita cifras que no están en los datos.
- **Errores:** `src/instrumentation.ts` (`onRequestError`) → `public.error_log` (sin cabeceras ni cuerpo, y con llaves tapadas). El admin los ve en `/admin/errores`.
- **Ejercicios con el rigor de Pilotos:**
  - Guardrails (`experiment_guardrails` y `experiment_variants.guardrail_values`).
  - Efecto esperado y potencia (`expected_effect_pct`, `power_inputs`, `power_result`, calculados en el servidor con `pilots/power.ts`).
  - Cruces entre ejercicios (`domain/collisions.ts`).
  - ICE asistido (`domain/ice-assist.ts`).
  - Valor estimado como rango (techo optimista).
  - Verificación posterior al escalado (`domain/post-scale.ts`).
  - Probabilidad de ganar con el mismo motor Monte Carlo de Pilotos (`stats.ts` delega en `pilots/bayes.ts`).
- **Insight y hábito:**
  - Caída del embudo (`domain/funnel.ts`).
  - Métricas con alcance y fórmula, con aviso de "no cuadra" (`metrics.scope`, `numerator_id`, `denominator_id`, `domain/metric-formula.ts`).
  - Tiempo de ciclo por estado (`domain/cycle-time.ts`).
  - Resumen semanal por correo los lunes: `server/email/*` con nodemailer, variables `SMTP_*`, preferencia `profiles.weekly_digest` y un envío por semana (`weekly_digest_sends`).
- **Adopción y North Star:**
  - `usage_days` (días de uso por persona; `server/usage.ts`).
  - "Decisiones de growth con evidencia por semana" en `/direccion`.
  - Pilotos visibles en "Mis programas", en el menú del programa y en `/direccion`.
- **Aprendizajes:** vista `all_learnings` (ejercicios y pilotos) con palanca y canal (`learnings.lever`, `learnings.channel`) y búsqueda con sinónimos telco (`domain/learning-search.ts`).
- **Calidad:**
  - CI en `.github/workflows/ci.yml` (lint, tipos, tests y build).
  - Nuevos tests: `tests/db/matriz.test.ts`, `dates` y `format`.
  - `global-error.tsx` y `not-found.tsx` raíz.
  - `shadcn` pasa a `devDependencies`.
- **Uso adicional de la secret key**, además de los casos de §4:
  - registro de errores;
  - escrituras de las integraciones (`ad_facts`, datos `mcp`) y lectura de tokens en Vault;
  - envío del resumen semanal, filtrando por membresía de cada persona.

## 13. Navegación y pantallas simples (rediseño del 28 sep 2026)

- **Inicio** (`/`, `src/app/(app)/page.tsx`): cinco caminos grandes.
  - Crear un proyecto de growth, o "Ver mis proyectos" si no es admin.
  - Crear un piloto de medios, o verlos si la persona solo es lectora.
  - Dirección (`/direccion`), Aprender growth (`/aprender`) y Cómo se usa el Arriero (`/guia`).
  - Debajo, "Siga donde iba" con los últimos programas.
  - Después del login se llega aquí (`DEFAULT_AFTER_LOGIN = "/"`). La lista de programas vive en `/programas`.
- **Barra de arriba** (`app-header.tsx` y `app-nav.tsx`):
  - Una sola fila: Volver · logo · secciones (Inicio, Programas, Pilotos, Tableros, Dirección) · buscar · avisos · usuario.
  - El tema, las explicaciones, el resumen semanal, la guía, los usuarios y los errores van en el menú de usuario.
  - El contexto (el programa abierto) va en una segunda fila delgada.
  - En el celular, las secciones van fijas abajo; por eso el layout lleva `pb-16`.
- **Volver** (`BackButton`): vuelve atrás en el historial si la persona ya navegó dentro de la app; si no, va a la ruta padre (`parentPath` en `src/domain/navigation.ts`, que salta carpetas sin página como `lineas` y `admin`).
- **Menú del programa:**
  - Arriba: Resumen, Ejercicios, Problemas, Carga semanal, Tableros.
  - Luego las Líneas.
  - En "Más": Aprendizajes, Informe, Equipo, Configuración y Papelera.
- **Menos contenido por pantalla:**
  - Pestañas en la URL (`ViewTabs`), plegables (`Fold`, con `<details>`) y filtros detrás de un botón (`FiltersPanel`), en `src/components/app/`.
  - El detalle del ejercicio muestra una sola acción principal; lo demás queda en "Otras opciones".
  - `/direccion` responde las 9 preguntas una por vista (`?vista=` y `?pregunta=`).
  - El detalle del piloto tiene las pestañas Resumen, Diseño y Chequeo e incidentes.
- **Asistentes paso a paso** (`src/components/app/step-wizard.tsx`, una pregunta por pantalla):
  - `/programas/nuevo` (`components/setup/quick-wizard/`): nombre → líneas → fechas → calendario → resumen. Usa el mismo `saveQuickStart`.
  - Pilotos (`components/pilots/wizard/sub-flow.ts`): cada uno de los 5 pasos partido en subpantallas. Se sigue guardando una vez por paso.
- **Tableros:**
  - Gantt del programa: una barra por ejercicio, rellena si es real y punteada si es plan, con el mes por defecto (`components/boards/timeline-gantt.tsx`).
  - Kanban del programa: 5 columnas (Por hacer, En diseño, En prueba, En lectura, Cerrado), límites WIP y aviso de tarjetas quietas.
  - `/tableros` (general, de solo lectura) junta ejercicios y pilotos en `?vista=gantt|kanban|ruta`. La ruta "Ahora / Siguiente / Después" lleva un semáforo de salud por tarjeta.
  - Mapeo de estados, WIP, envejecimiento y salud en `src/domain/boards.ts`; lectura con RLS en `src/server/queries/boards.ts`.
- **Aprender** (`/aprender`, 11 lecciones con una interacción cada una) y **Guía** (`/guia`, 12 pasos): contenido en `src/domain/learn-content.ts` y componentes en `src/components/learn/`. El avance se guarda en `localStorage`.
- **Examen y cartón:** al terminar `/aprender` o `/guia` se presenta un examen de 10 preguntas y con 7 buenas se gana el cartón (certificado).
  - Preguntas, calificación, nivel y número del cartón en `src/domain/certificates.ts`.
  - Componentes en `components/learn/certificate-quiz.tsx` y `certificate.tsx`.
  - "Descargar en PDF" abre la impresión del navegador. Al imprimir solo sale una copia del cartón, puesta directo en `<body>` (`.print-portal` en `globals.css`), en una hoja A4 horizontal.
  - El resultado se guarda en `localStorage` (`arriero:carton:<tipo>`).
- **Inicio con humor:** saludo según la hora de Bogotá (`src/domain/greeting.ts`) y la mula de la trocha, que opina al hacerle clic (`components/brand/talking-mule.tsx`).

## 14. La Recua (gamificación)

- **Qué es:** puntos, niveles de arriero, insignias y escalafón por persona.
- **Dónde se ve:** en `/recua`, con cuatro pestañas en `?vista=`: Escalafón (con `?periodo=mes`), Mi carriel, Muro de la vergüenza y Así se gana. También aparece como sección de la barra y como franja en el inicio.
- **De dónde salen los datos:** la migración `016_gamificacion` crea la RPC `gamification_stats(p_since)`, `security definer` y solo para `authenticated`. Devuelve **solo conteos por persona** (días de uso, programas, problemas, ejercicios, decisiones, ganadores, pilotos, aprendizajes, semanas cargadas, comentarios, papelera…). No cuenta el programa de ejemplo, los pilotos de ejemplo ni lo que está en la papelera. Por eso el ranking es visible para todos sin tocar el RLS del detalle. La `017` suma los insights y la `018` la lluvia de ideas (`ideas_created`, `idea_sessions_created`, `ideas_scored`, `ideas_chosen`, `ideas_buried`); cada una hace `drop` + `create` de la función con el cuerpo completo.
- **Reglas en `src/domain/gamification.ts`:**
  - `POINT_RULES`, con topes y con resta por ideas quietas; el total nunca baja de 0. Lluvia de ideas: +20 por aguacero armado, +5 por idea soltada (tope 60), +1 por idea ajena puntuada (tope 40), +60 por idea suya elegida y +1 por idea suya enterrada.
  - `LEVELS`: de "Turista en chanclas" a "Mula Mayor honoraria".
  - `BADGES`, incluidas las oscuras.
  - `currentStreak`, `rankUsers`, apodos por puesto y frases.
- **Celebración:** `LevelUpWatcher` celebra en este navegador cuando la persona sube de nivel.
- **Tests:** `tests/db/recua.test.ts`, que se salta si la migración no está.

## 15. Carriel de insights (repositorio de insights)

- **Qué es:** un repositorio global, visible para todas las personas con sesión, de observaciones con su fuente ("me di cuenta de que…"). De ahí nacen problemas, programas y pilotos. Sigue la idea de *atomic research*: una idea por insight, siempre con su fuente, evidencia opcional y votos de otras personas como señal de que no es un caso aislado.
- **Captura rápida:** el bombillo de la barra (o la tecla **I**) abre `QuickInsightButton` (`components/insights/quick-insight.tsx`). Solo la frase es obligatoria; la fuente se elige con un clic y lo demás va plegado (evidencia, referencia, línea, etapa, canal y etiquetas). Se guarda con Ctrl+Enter.
- **Pantallas:**
  - `/insights`, con vistas en `?vista=` (todos, sin sembrar, los más calientes, sembrados, los míos, archivados), búsqueda `?q=` y filtros `?fuente=` y `?linea=`.
  - `/insights/[id]`: detalle, lo que sembró, parecidos (`similarInsights`) y acciones. Con `?editar=1` se edita.
- **Sembrar:**
  - "Convertir en problema" → `/programas/<id>/problemas/nuevo?insight=<id>&linea=<id>`, con el formulario prellenado (`problemPrefillFromInsight`).
  - "Armar proyecto" → `/programas/nuevo?insight=<id>`.
  - "Crear piloto" → `/pilotos/nuevo?insight=<id>`.
  - Al guardar, `linkInsight` llama la RPC `link_insight`, que deja el insight en «Sembrado» con el vínculo. Solo la puede usar quien es miembro del programa, o quien tiene rol en Pilotos.
- **Base de datos:** la migración `017_insights` crea:
  - Las tablas `insights` e `insight_votes`, con RLS: todos ven; cada quien escribe lo suyo; el autor o un admin edita, valida, archiva y borra.
  - La guarda `private.insights_guard`: el autor y lo sembrado no se cambian con un `update`, y «Sembrado» solo lo pone la RPC.
  - Las RPC `link_insight` y `delete_insight`.
  - La redefinición de `gamification_stats`, que ahora devuelve también `insights_created`, `insights_planted`, `insight_votes_received` e `insight_votes_given`.
- **La Recua:**
  - Puntos: +10 por insight anotado (tope 60), +3 por voto recibido (tope 50), +50 por insight sembrado y +1 por voto dado (tope 30).
  - Insignias: Ojo de águila, El profeta de la vereda, Influencer de fonda y la oscura El acumulador.
- **Código:**
  - Reglas puras en `src/domain/insights.ts`: fuentes, estados, `heat`, `filterInsights`, `insightCounts`, `insightActions` y `parseTags`.
  - Validación en `lib/validation/insights.ts`.
  - Acciones en `server/actions/insights.ts`.
  - Lecturas en `server/queries/insights.ts`.
  - Tests en `tests/db/insights.test.ts`, que se salta si la migración no está.

## 16. Lluvia de ideas («aguaceros»)

- **Qué es:** sesiones globales de brainstorming, visibles para todas las personas con sesión. Cada **aguacero** tiene un reto (una pregunta), contexto, línea y fecha límite opcionales, y quien lo armó.
- **Fases** (solo por la RPC `set_idea_session_phase`, que usa quien lo armó o un admin):
  - `open` «Llueven ideas»: cualquiera anota.
  - `voting` «A puntuar»: impacto y facilidad de 1 a 5 y hasta 3 «¡Esta!» por persona.
  - `closed` «Se decidió»: podio a la vista y decisiones.
  - Saltos: open → voting (con al menos una idea), voting → closed u open, closed → voting (si ninguna idea se ha convertido).
- **Captura en cinco segundos:** `QuickIdeaInput` en la sesión. Enter anota y el campo queda listo para la siguiente, sin esperar a la anterior. «Anotar en anónimo» solo cambia cómo se muestra («Un arriero tímido»): el autor queda guardado. El id del autor no viaja al navegador y el nombre tampoco si la idea es anónima y ajena (`server/queries/ideas.ts#toIdea`).
- **Puntaje a ciegas:**
  - RPC `score_idea`: solo en votación, nunca la idea propia, máximo 3 favoritas; un valor nulo conserva lo que había.
  - La RLS de `idea_scores` muestra solo los propios hasta que se cierra. `idea_session_progress` dice cuántas personas han puntuado.
  - Podio (`rankIdeas`): promedio de impacto × promedio de facilidad (1 a 25); desempata el de más «¡Esta!» y luego el de más votantes.
- **Decidir** (RPC `decide_idea`, quien lo armó o un admin, con el aguacero cerrado): `project`, `pilot`, `insight` o `buried`; `null` la revive.
  - «Insight» crea de una vez el insight en el carriel (fuente «El equipo», a nombre de quien decide) y lo deja vinculado.
  - «Armar proyecto» → `/programas/nuevo?idea=<id>` (solo admin). «Crear piloto» → `/pilotos/nuevo?idea=<id>`, con la oportunidad de mejora prellenada (`pilotPrefillFromIdea`).
  - Al crear, `linkIdea` llama la RPC `link_idea`, que exige que la decisión coincida con el destino y la misma membresía que `link_insight`.
  - Lo convertido ya no se re-decide, no se borra y no deja reabrir el aguacero.
  - Las enterradas van al **Cementerio de ideas**, con lápida y frase de humor negro (`ripLine`), siempre contra la idea y nunca contra la persona.
- **Pantallas:** `/ideas` (formulario «Arme un aguacero» y pestañas `?vista=abiertas|votacion|cerradas|mios`) y `/ideas/[sessionId]` (pasos, captura, votación, podio, tabla y cementerio). La sección «Ideas» va en la barra, después de Insights, y hay una franja pequeña en el inicio.
- **Base de datos:** la migración `018_lluvia_ideas` crea:
  - Las tablas `idea_sessions`, `ideas` e `idea_scores`, con RLS. Ideas nuevas solo con el aguacero abierto; `idea_scores` solo se escribe por RPC.
  - Las guardas `private.idea_sessions_guard` (fase, autor y borrado) y `private.ideas_guard` (autor, decisión, vínculos y borrado; el texto solo se corrige mientras llueve).
  - Las RPC `delete_idea` (autor, quien armó el aguacero o un admin) y `delete_idea_session` (borrado lógico).
  - La redefinición de `gamification_stats`.
- **La Recua:** insignias Nube cargada, Hacedor de lluvia, Buena cosecha y la oscura Poeta maldito (puntos en §14).
- **Código:**
  - Reglas en `src/domain/ideas.ts` (fases, `phaseMoves`, `sessionActions`, `ideaActions`, `rankIdeas`, favoritas, anonimato y frases).
  - Validación en `lib/validation/ideas.ts`, acciones en `server/actions/ideas.ts`, lecturas en `server/queries/ideas.ts` y componentes en `components/ideas/`.
  - Tests en `src/domain/ideas.test.ts` y `tests/db/ideas.test.ts` (se salta si la migración no está).
- **SQL para el SQL Editor:** `arriero-lluvia-de-ideas.sql` junta la 016, la 017 y la 018 con sus registros en `schema_migrations`, y se puede correr dos veces.

## 17. La Tía copiloto (29 sep 2026)

- **Qué es:** un chat en toda la app (botón flotante «La Tía», franja en el inicio y atajo «Hágalo con La Tía» en `/programas/nuevo` y `/pilotos/nuevo`). Entiende qué quiere hacer la persona, le pide lo que falta, **crea el proyecto o el piloto**, **anota avances** y **opina**. Reemplaza al chat «Pregúntele a la Tía» del programa (se borraron `components/tia/tia-chat.tsx`, `api/tia/chat` y `actions/tia-chat.ts`; la tabla `tia_messages` queda sin uso).
- **Quién manda:** la conversación la lleva el código, no Claude. Preguntas, botones, resúmenes y confirmaciones salen de plantillas en `src/domain/tia-copilot.ts` (cero tokens). Claude solo entra en dos casos:
  - **Entender un mensaje libre** (Haiku, `TIA_MODEL_FAST`): `EXTRACT_SYSTEM` en `tia-copilot-prompt.ts` devuelve un JSON corto `{m, p, a}` con el modo y los campos. Sistema fijo con `cache_control`; lista de referencias (`refs`, códigos cortos y estables como `E3f9a2c`) solo cuando el mensaje puede ser un avance (`needsRefs`).
  - **Opinar** (`copilot_advice`): Sonnet (`TIA_MODEL`) si hay que interpretar datos; Haiku si es una duda de uso (`isHowTo`, sin datos). Respuesta corta (máx. 150 palabras) con datos recortados (`briefFor` en `server/tia/copilot.ts`).
- **Sin Claude se entiende:** fechas («el lunes», «15 oct», «en 2 semanas»), números («20 palos», «1,5 millones»), sí/no, «después», líneas de negocio, medios del catálogo, estados y referencias por nombre (`src/domain/tia-parse.ts` y `localAnswer`). Un texto libre que responde la pregunta hecha se guarda tal cual. Los términos del glosario («¿qué es ICE?») se responden desde `domain/glossary.ts`.
- **Qué crea y actualiza** (siempre con las mismas server actions de la interfaz: RLS, roles y validaciones intactos; nunca decide ni escala):
  - Proyecto → `saveQuickStart` y, si la persona la contó, la primera oportunidad de mejora (`createProblem`). Solo admin.
  - Piloto → `createPilot` (borrador) + `savePilotDesign` (tipo de prueba, grupos por defecto `armsFor`, fechas, plata y medios del catálogo). Rol creador o aprobador.
  - Avances → oportunidad de mejora nueva, comentario en un ejercicio (`addComment`), mover un ejercicio (`transitionExperiment`, sin «Decidido»: eso se hace en el ejercicio con el aprendizaje), valor de la semana (`saveWeeklyValues`), incidente, arranque y cierre de un piloto.
  - Antes de guardar muestra un resumen y pide confirmación («Créelo, Tía» / «Cambiar algo» / «Cancelar»).
- **Avisos proactivos al abrir** (`copilotNudges`, sin Claude): pilotos aprobados con fecha de arranque vencida, pilotos en prueba con fin vencido y ejercicios en prueba que ya cumplieron la duración mínima.
- **Estado:** viaja con el navegador (`sessionStorage`, `arriero:tia:copiloto`), no en la base; el servidor lo revisa en cada turno (`sanitizeState`). El servidor solo lee lo que el turno necesita (armando un proyecto no consulta ejercicios ni pilotos).
- **Costos** (`src/domain/tia-cost.ts` y `tia-copilot-cost.ts`, con los prompts reales; USD 1 ≈ COP 4.000; Sonnet asumido a USD 3 / 15 por millón):
  - **Medido con la API real (28 sep 2026)**: proyecto = 1 llamada a Haiku (767 tokens de entrada, 57 de salida, USD 0,00105 ≈ COP 4); piloto = 1 llamada a Haiku (811 / 148, USD 0,00155 ≈ COP 6). «¿Qué opina?» con Sonnet 5.5: proyecto 1.624 / 405 (USD 0,011 ≈ COP 44), piloto 1.230 / 409 (USD 0,0098 ≈ COP 39). El resto de turnos, con botones o respuestas cortas, no usa Claude.
  - Sonnet 5.5 va con `effort: "low"`: por defecto «piensa» por dentro (~330 tokens de salida extra por respuesta, y se cortaba a los 700). Los modelos Claude 5 no aceptan `temperature` (`supportsTemperature` en `server/tia/client.ts`).
  - Haiku inventa campos que la persona no dijo (nombre, efecto esperado, forma de medir) y se equivoca con fechas relativas: `groundPatch` descarta lo que no aparece en el mensaje y las fechas y plazos en palabras los calcula el código (`parseDateEs`, `parseDurationDays`). En desarrollo, cada llamada deja `[tia-uso]` en la consola con tokens, costo y motivo de fin.
  - Anotar un avance ≈ COP 8. Una pregunta de opinión ≈ COP 30 (más si el programa tiene muchos ejercicios).
  - Cada llamada queda en `tia_usage` (`copilot` y `copilot_advice`) y cuenta para `TIA_DAILY_LIMIT`; los botones no cuentan. Un admin ve en el panel cuánto va costando la charla.
- **Tests:** `src/domain/tia-copilot.test.ts`.
