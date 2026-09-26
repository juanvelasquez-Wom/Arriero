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

## 2. Glosario del dominio

| Término | Significado en la app |
|---|---|
| **Programa** | Un plan de growth con fechas de inicio y fin, horizontes (H1, H2…), calendario, miembros y configuración de puntaje. Todo cuelga de un programa. |
| **Horizonte** | Tramo del programa con nombre y fechas (p. ej. H1 1 ago – 24 ene). Las métricas tienen un objetivo por horizonte. |
| **Línea** (de negocio) | Pospago, Recargas y paquetes, Equipos móviles, etc. Cada una tiene su métrica norte, su árbol y su embudo. |
| **Métrica norte** | La métrica que representa el valor que la línea quiere crecer (`type = north_star`). Una por línea. Se acompaña de una métrica de **eficiencia** (`type = efficiency`). |
| **Árbol de métricas** | Descomposición de la métrica norte en métricas de **entrada** (`type = input`) mediante `parent_id`. Cada entrada pertenece a una **rama**: volumen de demanda, conversión, eficiencia, o recuperación y recurrencia. Los ejercicios atacan métricas del árbol. |
| **Embudo** | Etapas ordenadas del recorrido del cliente en una línea. Por defecto: Adquisición, Activación, Conversión, y Recuperación y recurrencia. Editables. |
| **Problema** | Una pérdida de valor ubicada en línea + etapa + canal, con **evidencia**, causa raíz hipotética, impacto, control y estado (por validar, validado, descartado). |
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
| Typecheck | `npm run typecheck` |
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

Proyecto de Supabase: ref `orehfqgrohqdoxmboczu`. No se crea otro. Variables en `.env.local` (plantilla en `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`.

## 4. Arquitectura

```
docs/                         PDF del modelo y especificación
supabase/
  config.toml                 config de la CLI (registro cerrado, site_url)
  migrations/                 001 esquema · 002 helpers de permisos · 003 reglas (triggers)
                              004 RPC · 005 RLS · 006 Storage y Realtime · 008 mensajes de error en usted
scripts/                      create-admin.mts, drain-storage-queue.mts (usan la secret key)
src/
  proxy.ts                    refresca la sesión y protege todo salvo login/recuperar/auth/confirm/api/cron
  app/
    (auth)/login, recuperar, restablecer
    auth/confirm              recibe enlaces de invitación y recuperación (token_hash, code o fragmento)
    (app)/programas           Mis programas · ejemplo · programas en la papelera
    (app)/programas/nuevo     paso 1 del asistente para crear un programa
    (app)/admin/usuarios      administración de usuarios (solo admin global): crear, admin sí/no,
                              enlace de contraseña, bloquear
    (app)/programas/[programId]/
      page                    resumen + lista de primeros pasos
      configuracion?paso=…    asistente guiado (ver "Asistente de configuración" abajo)
      lineas/[lineId]?tab=norte|arbol|embudo
      carga?semana=           carga semanal en lote
      problemas, problemas/nuevo, problemas/[id]
      ejercicios (backlog), ejercicios/nuevo, ejercicios/[id]?tab=, ejercicios/[id]/editar?paso=
      aprendizajes, papelera
      tableros/gantt|kanban|resultados|portafolio (filtros globales en la URL)
    api/cron/purgar-papelera  job diario (Vercel Cron, Bearer CRON_SECRET)
  domain/                     LÓGICA DE NEGOCIO PURA, con tests *.test.ts al lado
    scoring · lifecycle · results · calendar · permissions · deletion · dashboards
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

**Asistente de configuración del programa** (pensado para quien no conoce el modelo de growth)

- `/programas/nuevo` muestra primero la bienvenida (el modelo en 5 ideas) y luego el paso "El programa".
- `/programas/[id]/configuracion?paso=<clave>[&linea=<id>]` con las claves de `src/domain/setup-flow.ts`: `programa` → `calendario` (picos con congelamiento sugerido y punto de decisión) → `horizontes` (propuestos desde el punto de decisión) → `lineas` (plantillas telco) → por cada línea `linea-norte` → `linea-arbol` → `linea-embudo` → `equipo` → `puntaje` → `resumen`.
- Se guarda al avanzar (`src/server/actions/setup.ts`). `programs.setup_step` guarda el último paso principal completado (1–4); el avance dentro de cada línea se deduce de los datos. `resumeStep` decide dónde retomar e `isReachable` impide saltar pasos.
- Ayudas: panel "¿Qué es esto?" y textos en `src/components/setup/help-content.ts`; burbujas ⓘ (`InfoTip`) por campo; botones "Usar ejemplo". Plantillas y sugerencias en `src/domain/growth-templates.ts`.
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
| 6 | **Resultados.** Tasa = conversiones / muestra; diferencia relativa vs control (sobre la tasa o, si no hay conversiones, sobre el valor de la métrica). Divisiones por cero → `null`. Sin significancia. | `domain/results.ts` |
| 7 | **Duración.** Advertencia si el ejercicio corrió menos días que la duración mínima al cerrarlo. | `domain/calendar.ts#durationWarning` · barra de transiciones y diálogo de decisión |
| 8 | **Borrado.** Lógico con papelera y lote; confirmación con impacto (`deletion_impact`); programa exige su nombre; problema/métrica/etapa con dependientes → reasignar o borrar juntos; línea en cascada; ejercicio con variantes, adjuntos y aprendizaje; restaurar exige que el padre esté activo; eliminación definitiva por FK en cascada + cola de Storage; purga a los 30 días por cron; todo en `activity_log`. | `domain/deletion.ts` · RPC `delete_*`, `restore_trash_item`, `purge_trash_item`, `empty_trash`, `purge_expired_trash` · `DeleteButton` · `/api/cron/purgar-papelera` |

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
- **Voz:** siempre de **usted**, paisa, cercana y con humor ("¡Eso!", "Hágale pues", "Ese camino no era"). Nada de "parce" ni similares, nada de voseo ni groserías. Los errores dicen primero qué pasó y cómo se arregla; el chiste, si va, después y corto. Máximo uno por mensaje. Los términos del modelo no se renombran.

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
- **No escribir la secret key** (ni `CRON_SECRET`) en código, `CLAUDE.md`, README, tests, scripts, logs ni commits. Solo `process.env.*` en código de servidor. Nunca con prefijo `NEXT_PUBLIC_`.
- **No usar las llaves antiguas** `anon` / `service_role`.
- **No crear otro proyecto de Supabase.**
- No cambiar `status`, `design_locked_at` ni `deleted_at` con `update` directo: usar las RPC.
- No cargar el programa de ejemplo con SQL suelto: se hace con `server/demo/loader.ts`.
- No borrar archivos de Storage fuera de la cola (`storage_deletion_queue`) o del borrado del ejemplo.
