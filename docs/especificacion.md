# Prompt para Claude Code · Growth Framework App

> **Antes de usarlo:** crea una carpeta vacía para el proyecto. Copia el PDF `modelo-growth-marketing-wom.pdf` en `docs/` y el archivo `env.local` en la raíz, renombrado como `.env.local`. Luego abre Claude Code ahí y pega todo lo que está debajo de la línea.

---

## Rol

Eres un ingeniero full-stack senior y diseñador de producto. Vas a construir desde cero una web app de producción para operar un framework de growth marketing. Trabajas con criterio de producto: si algo de esta especificación es ambiguo o contradictorio, me preguntas antes de asumir.

## Contexto

El documento `docs/modelo-growth-marketing-wom.pdf` explica el modelo de growth que la app debe operar y cómo se adaptó para un equipo de ventas digitales de telecomunicaciones. **Léelo completo antes de empezar.** Es la fuente de verdad del dominio. Los principios clave son:

- Una **métrica norte** por línea de negocio, descompuesta en un **árbol de métricas** de entrada.
- Un **embudo** por línea, donde se ubican los problemas.
- Los experimentos nacen de **problemas con evidencia**, nunca de ideas sueltas ("nada de nice to try").
- Se priorizan con **ICE** más dos filtros: **calendario** (se puede leer antes de los picos comerciales) y **control** (depende de nosotros o de terceros).
- El diseño de la prueba se define **antes de lanzar** y no se reinterpreta después.
- Hay **picos comerciales con congelamiento** (no se lanzan experimentos) y un **punto de decisión formal**.
- El equipo interno es dueño del resultado y la **agencia** ejecuta los ejercicios que se le asignan.
- Cada ejercicio cerrado deja un **aprendizaje** que puede convertirse en hipótesis para otras líneas.

En la app, un **ejercicio** es cualquier cambio que se quiere probar antes de escalarlo. Es la unidad central del producto.

## Cómo quiero que trabajes

1. Lee el PDF y esta especificación completa.
2. **Crea primero `CLAUDE.md`** en la raíz (ver la sección "Contenido de CLAUDE.md"). Muéstramelo y espera mi aprobación.
3. Propón un plan de implementación por fases, con criterios de aceptación para cada una. Espera mi aprobación.
4. Construye fase por fase. Al cerrar cada fase: corre el lint, los tests y el build; resume qué quedó hecho, qué queda pendiente y cualquier decisión que hayas tomado.
5. Mantén `CLAUDE.md` actualizado cuando cambien la arquitectura, los comandos o las reglas de negocio.
6. No instales dependencias fuera del stack definido sin preguntarme.

## Stack

- **Next.js** (última versión estable, App Router) con **TypeScript** en modo estricto.
- **Tailwind CSS** y **shadcn/ui** para los componentes.
- **Supabase**: Auth, Postgres, Row Level Security y Storage.
- **Supabase CLI** para las migraciones (`supabase/migrations`) y la generación de tipos TypeScript.
- **@supabase/ssr** para la sesión en server components y en el middleware.
- **zod** y **react-hook-form** para formularios y validación.
- **Recharts** para los gráficos.
- **dnd-kit** para el drag and drop del Kanban.
- El Gantt se construye propio con CSS grid o SVG, sin librerías pesadas.
- **Vitest** para lógica de negocio y **Playwright** para un smoke test de punta a punta.
- Despliegue en **Vercel**.

## Proyecto de Supabase

El proyecto de Supabase ya existe. No crees uno nuevo.

- **Project ref:** `orehfqgrohqdoxmboczu`
- **Project URL:** `https://orehfqgrohqdoxmboczu.supabase.co`
- **Dashboard:** https://supabase.com/dashboard/project/orehfqgrohqdoxmboczu
- **Publishable key:** `sb_publishable_CPX8yZkRIS0AYe-W084SFw_8PlP0oNl`
- **Secret key:** ya está en `.env.local`, en la raíz del proyecto.

Reglas para las credenciales:

1. Usa el sistema nuevo de llaves de Supabase (publishable y secret), no las llaves antiguas `anon` y `service_role`. Nombres de las variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` (solo servidor, **nunca** con el prefijo `NEXT_PUBLIC_`)
   - `NEXT_PUBLIC_SITE_URL`
2. La secret key vive **únicamente** en `.env.local` y, más adelante, en las variables de entorno de Vercel. Nunca la escribas en el código, en `CLAUDE.md`, en el README, en tests, en scripts, en logs ni en commits. Solo se usa en código de servidor (route handlers, server actions y scripts): la invitación de usuarios, la creación del primer admin, la carga y el borrado del programa de ejemplo, y la purga de la papelera.
3. **Antes del primer commit**, verifica que `.env.local` esté en `.gitignore`. Crea un `.env.example` con los nombres de las variables y valores de ejemplo, sin datos reales.
4. Vincula la CLI con `npx supabase link --project-ref orehfqgrohqdoxmboczu`. Si hace falta, pídeme que haga el login de la CLI o que escriba la contraseña de la base; no me la pidas por el chat.
5. Aplica las migraciones con `supabase db push` y genera los tipos desde el proyecto vinculado.

## Autenticación y acceso

- Login con correo y contraseña mediante Supabase Auth. **No hay registro abierto**: solo se entra por invitación.
- El primer usuario se crea como admin global mediante un script documentado en el README.
- El admin global y los dueños de programa invitan por correo y asignan el rol al invitar.
- Hay recuperación de contraseña.
- El middleware protege todas las rutas, excepto login y recuperación.
- Los permisos se aplican **en la base de datos con RLS**, no solo en la interfaz. La interfaz además oculta o deshabilita lo que el usuario no puede hacer.

## Roles y permisos

Hay un rol global (`is_admin`) y un rol por programa: `owner`, `collaborator`, `agency` o `viewer`.

| Acción | Admin | Owner | Collaborator | Agency | Viewer |
|---|---|---|---|---|---|
| Crear programas | ✓ | | | | |
| Invitar miembros y cambiar roles del programa | ✓ | ✓ | | | |
| Editar líneas, métrica norte, árbol, embudos y calendario | ✓ | ✓ | ✓ | | |
| Cargar valores semanales de métricas | ✓ | ✓ | ✓ | | |
| Crear problemas | ✓ | ✓ | ✓ | | |
| Crear ejercicios | ✓ | ✓ | ✓ | ✓ | |
| Editar ejercicios | ✓ | ✓ | ✓ | Solo los asignados | |
| Cargar resultados y adjuntos | ✓ | ✓ | ✓ | Solo los asignados | |
| Calificar ICE y priorizar | ✓ | ✓ | ✓ | | |
| Emitir veredicto y decisión (escalar, ajustar o apagar) | ✓ | ✓ | | | |
| Borrar ejercicios en Idea, Priorizado o En diseño | ✓ | ✓ | ✓ (los que creó) | Solo los que creó | |
| Borrar ejercicios en En prueba o posteriores | ✓ | ✓ | | | |
| Borrar problemas, métricas, etapas y líneas | ✓ | ✓ | | | |
| Borrar programas y vaciar la papelera | ✓ | Solo su programa | | | |
| Restaurar desde la papelera | ✓ | ✓ | | | |
| Cargar y borrar el programa de ejemplo | ✓ | | | | |
| Ver todo el programa y los tableros | ✓ | ✓ | ✓ | ✓ | ✓ |

Un ejercicio está "asignado" a un usuario de la agencia cuando ese usuario es su responsable.

## Modelo de dominio

Jerarquía: **Programa → Línea → (Métrica norte, Árbol, Embudo) → Problema → Ejercicio → Aprendizaje**.

Diseña el esquema en Postgres con estas entidades como mínimo. Cada tabla debe tener `id` UUID, `created_at`, `updated_at` y `created_by` donde aplique, además de `deleted_at` y `deleted_by` para el borrado lógico (ver la regla 8).

- **profiles**: nombre, correo, `is_admin`.
- **programs**: nombre, descripción, `is_demo` (booleano), fecha de inicio, fecha de fin, horizontes (por ejemplo H1 y H2, cada uno con nombre y fechas) y la configuración de puntaje (ver las reglas de negocio).
- **program_members**: programa, usuario y rol.
- **business_lines**: programa, nombre y orden.
- **metrics**: línea, `parent_id` (para el árbol), tipo (`north_star`, `efficiency` o `input`), rama (volumen de demanda, conversión, eficiencia, recuperación y recurrencia), nombre, definición, canal, unidad, dirección deseada (sube o baja), fuente, línea base, objetivo por horizonte y responsable.
- **metric_values**: métrica, semana (lunes), valor, nota y quién la cargó. Única por métrica y semana; se edita, pero se guarda historial de cambios.
- **funnel_stages**: línea, nombre, orden, descripción de qué significa en esa línea y métrica vinculada. Al crear una línea se proponen cuatro etapas editables: Adquisición, Activación, Conversión y Recuperación y recurrencia.
- **problems**: línea, etapa, canal, título, evidencia, causa raíz hipotética, impacto estimado (alto, medio o bajo), control (nuestro, compartido o externo), estado (por validar, validado o descartado) y adjuntos.
- **experiments** (ejercicios): programa, línea, `problem_id` (**obligatorio**), `metric_id` del árbol (**obligatorio**), título, hipótesis en tres campos (SI, ENTONCES y PORQUE), impacto, confianza y facilidad (1 a 10), `fits_calendar` (booleano), control, puntaje ICE y puntaje final (calculados), responsable (usuario), tipo de responsable (interno, agencia o mixto), estado, tipo de prueba (A/B, geografía o antes/después), métrica principal, métricas de control (las que no deben empeorar), duración mínima, regla de decisión, fechas planeadas y reales de inicio y fin, `design_locked_at`, veredicto (ganador, perdedor o no concluyente), decisión (escalar, ajustar o apagar) y justificación de la decisión.
- **experiment_variants**: ejercicio, nombre, `is_control`, descripción, muestra, conversiones, valor de la métrica y notas.
- **attachments**: entidad polimórfica (problema o ejercicio), ruta en Storage, nombre, tipo y quién lo subió. Se aceptan PDF, imágenes, CSV y XLSX, con un máximo de 20 MB.
- **learnings**: ejercicio, texto, líneas a las que aplica y enlace opcional a ejercicios derivados.
- **calendar_events**: programa, tipo (`peak`, `freeze` o `decision`), nombre, fecha de inicio y fecha de fin.
- **activity_log**: quién, qué, entidad y cuándo, para cambios de estado, veredictos y cambios de rol.

## Reglas de negocio

Impleméntalas en funciones puras testeadas con Vitest y, cuando corresponda, también como restricciones en la base de datos.

1. **No hay ejercicios huérfanos.** Un ejercicio no puede crearse sin un problema y una métrica del árbol de la misma línea.
2. **Puntaje.** ICE es el promedio de impacto, confianza y facilidad, redondeado a un decimal. El puntaje final es ICE, más el bono de calendario si `fits_calendar` es verdadero, menos la penalidad de control. Los valores por defecto son: bono de calendario +1, penalidad compartida −1 y penalidad externa −3. Todos se configuran por programa.
3. **Ciclo de vida.** Los estados son: Idea → Priorizado → En diseño → En prueba → En lectura → Decidido → Escalado a BAU, más un estado terminal Descartado, al que se puede llegar desde Idea, Priorizado o En diseño. Las transiciones están validadas:
   - Para pasar a **Priorizado** se requiere ICE completo.
   - Para pasar a **En prueba** se requieren tipo de prueba, al menos un control y una variante, métrica principal, duración mínima, regla de decisión, responsable y fecha de inicio.
   - Para pasar a **Decidido** se requieren resultados cargados en todas las variantes, veredicto y decisión. Solo el owner o el admin puede hacerlo.
   - Para pasar a **Escalado a BAU**, la decisión debe ser "escalar".
   - Al pasar a Decidido, **es obligatorio registrar un aprendizaje**.
4. **Bloqueo del diseño.** Al pasar a "En prueba" se fija `design_locked_at`. Desde ese momento el diseño es de solo lectura: variantes, métricas, duración y regla de decisión. Solo el owner puede desbloquearlo, con una justificación obligatoria que queda en el `activity_log`.
5. **Congelamientos.** Si las fechas de un ejercicio se cruzan con un evento `freeze`, la app muestra una advertencia al planear. Además, bloquea el paso a "En prueba" si la fecha de inicio cae dentro de un congelamiento, salvo que el owner lo fuerce con una justificación.
6. **Cálculos de resultados.** Por cada variante: tasa de conversión (conversiones / muestra) y diferencia porcentual frente al control. Se protegen las divisiones por cero. No hay cálculo de significancia estadística; el veredicto lo emite una persona frente a la regla de decisión.
7. **Duración.** Si la fecha de fin real es anterior a la duración mínima, se muestra una advertencia al intentar cerrar el ejercicio.
8. **Borrado.** Todo se puede borrar según la matriz de permisos, con estas salvaguardas:
   - **Borrado lógico con papelera.** Borrar marca `deleted_at`; el elemento desaparece de todas las vistas y tableros y pasa a una papelera del programa. El owner puede restaurarlo o eliminarlo de forma definitiva. Lo que quede en la papelera más de 30 días se elimina de forma definitiva con un job programado.
   - **Confirmación siempre.** Todo borrado pide confirmación y muestra qué más se verá afectado. Para borrar un programa completo hay que escribir su nombre.
   - **Dependencias.** Borrar un problema o una métrica con ejercicios vinculados obliga a elegir: reasignar los ejercicios a otro problema o métrica, o borrarlos junto con él. Borrar una línea borra en cascada todo lo que cuelga de ella (métricas, valores, etapas, problemas, ejercicios, variantes, adjuntos y aprendizajes). Borrar un ejercicio borra sus variantes, adjuntos y aprendizaje.
   - **Adjuntos.** Al eliminar de forma definitiva, también se borran los archivos de Storage.
   - **Registro.** Cada borrado, restauración y eliminación definitiva queda en el `activity_log`.
   - **RLS.** Las consultas normales excluyen lo que tiene `deleted_at`; solo la vista de papelera lo muestra, y solo a quien puede restaurar.

## Pantallas y módulos

La interfaz está en **español**. El diseño es primero para escritorio, pero debe funcionar en celular.

1. **Login** y recuperación de contraseña.
2. **Mis programas**: lista con el rol del usuario en cada uno. Los admins ven el botón "Crear programa".
3. **Asistente de configuración del programa**, en pasos: datos y horizontes → líneas de negocio → calendario (picos, congelamientos y punto de decisión) → miembros e invitaciones → configuración del puntaje. El asistente se puede retomar si queda a medias.
4. **Vista de línea**, con pestañas:
   - **Métrica norte**: métrica norte y de eficiencia, línea base, objetivos por horizonte y gráfico de evolución.
   - **Árbol de métricas**: editor visual del árbol (nodos por rama, agregar, editar, reordenar y eliminar) y vista de tabla.
   - **Embudo**: editor de etapas y una visualización del embudo con el conteo de problemas y ejercicios por etapa.
5. **Carga semanal**: una pantalla con todas las métricas del programa agrupadas por línea, un campo para la semana seleccionada, indicador de pendientes y guardado en lote.
6. **Problemas**: tabla con filtros (línea, etapa, canal, estado e impacto), formulario de creación con adjuntos y acción "Crear ejercicio desde este problema".
7. **Creador de ejercicio**, un asistente en cinco pasos:
   1. Problema y métrica del árbol.
   2. Hipótesis (SI / ENTONCES / PORQUE, con ejemplos de ayuda).
   3. Priorización (ICE con deslizadores de 1 a 10, calendario y control, y el puntaje final en vivo).
   4. Diseño de la prueba (tipo, variantes, métricas, duración y regla de decisión).
   5. Responsable y fechas (con la advertencia de congelamiento).

   Se puede guardar como borrador en cualquier paso.
8. **Detalle del ejercicio**, con pestañas: resumen, diseño (con indicador de bloqueo), resultados (tabla de variantes con cálculos), adjuntos, aprendizaje y actividad. Muestra el estado actual y los botones de transición válidos. Si una transición no es posible, explica qué falta.
9. **Backlog**: tabla ordenada por puntaje final, con ranking, filtros y edición rápida de ICE para quien tenga permiso.
10. **Aprendizajes**: repositorio que se puede buscar y filtrar por línea, veredicto y etapa, con la acción "Crear ejercicio en otra línea desde este aprendizaje".
11. **Papelera** del programa: lista de elementos borrados con quién y cuándo, y las acciones restaurar y eliminar definitivamente.
12. **Tableros** (se detallan abajo).

En cada lista y en cada detalle hay una acción "Borrar" visible solo para quien tiene permiso.

## Tableros

Todos tienen filtros globales por línea, estado, responsable y horizonte. Leen de los mismos datos, en tiempo real después de cada cambio.

- **Gantt**: ejercicios en una línea de tiempo de todo el programa, agrupados por línea. Los congelamientos van como franjas grises, los picos como marcadores y el punto de decisión como línea vertical amarilla. Las barras distinguen lo planeado de lo real y tienen color según el estado. Hay una alerta visual si un ejercicio se cruza con un congelamiento. Zoom por semana o por mes. Clic en una barra abre el detalle.
- **Kanban**: una columna por estado. Arrastrar una tarjeta intenta la transición y, si falta algo, muestra el motivo y no mueve la tarjeta. Las tarjetas muestran título, línea, responsable, puntaje final y días en el estado actual.
- **Resultados**: ejercicios cerrados, win rate (ganadores sobre cerrados), diferencia promedio frente al control de los ganadores, y distribución de veredictos y decisiones. Todo se puede cortar por línea, etapa y tipo de prueba. Incluye una tabla de ejercicios cerrados con enlace al aprendizaje.
- **Portafolio y velocidad**: una matriz de líneas por etapas del embudo con el conteo de ejercicios activos, en la que las celdas vacías se resaltan donde hay problemas validados sin ejercicio. También muestra la cantidad de ejercicios por línea, con alerta si una línea tiene cero, y la velocidad de aprendizaje: lanzados y cerrados por semana, en un gráfico de las últimas 12 semanas.

## Diseño visual

La línea visual es **ejecutiva y sobria, en escala de grises con amarillo como único color de acento**.

- Tokens como variables CSS: `--ink #1F1F1F`, `--soft #5C5C5C`, `--line #DCDCDC`, `--wash #F3F3F1`, `--paper #FFFFFF` y `--accent #F2C200`.
- **Modo oscuro** con tokens equivalentes (fondo `#1C1C1C`, texto `#EDEDED`) y el acento amarillo sin cambios.
- El amarillo se reserva para lo que exige atención: la navegación activa, las acciones primarias, el punto de decisión, los ganadores y las alertas. No se usa como decoración.
- Los estados usan grises de distinta intensidad, más el amarillo para "En prueba" y "Ganador". Nunca se depende solo del color: siempre va acompañado de una etiqueta o un ícono.
- Tipografía sans seria, como Archivo o Inter, con buena jerarquía. Números tabulares en tablas y tableros.
- Densidad media: esto es una herramienta de trabajo, no una landing.
- Accesibilidad: contraste AA, navegación por teclado y foco visible.

## Estado inicial y programa de ejemplo

La app arranca **vacía**. Cada pantalla vacía tiene un estado vacío útil que explica qué va ahí y cuál es el siguiente paso. Al entrar a un programa nuevo aparece una lista de verificación de primeros pasos: configurar líneas → métrica norte → árbol → embudo → primer problema → primer ejercicio. Esa lista se oculta cuando todo está completo.

En "Mis programas", el admin ve el botón **"Cargar programa de ejemplo"**. Crea un programa con `is_demo = true`, marcado en toda la interfaz con la etiqueta "Ejemplo", y con él como owner. Un programa de ejemplo puede existir una sola vez; si ya existe, el botón cambia a **"Borrar programa de ejemplo"**, que lo elimina de forma definitiva con todo su contenido, sin pasar por la papelera, tras una confirmación. Los ejercicios del ejemplo también se pueden borrar uno por uno con el flujo normal.

La carga se hace con una función del servidor (no con SQL suelto), para que respete las mismas validaciones de la app. **Todos los datos son inventados.**

### Programa: "Programa demo · Telco Andina"

- Fechas: 1 de agosto de 2026 a 30 de abril de 2027. Horizontes: H1 (1 ago – 24 ene) y H2 (25 ene – 30 abr).
- Configuración de puntaje por defecto (+1, −1, −3).
- Calendario:
  - `peak` "Black Friday–Cyber", 27 nov – 30 nov 2026.
  - `freeze` "Congelamiento pico 1", 23 nov – 6 dic 2026.
  - `peak` "Temporada decembrina", 14 dic – 31 dic 2026.
  - `freeze` "Congelamiento decembrino", 14 dic 2026 – 3 ene 2027.
  - `decision` "Punto de decisión", 18 ene 2027.
- Líneas: **Pospago**, **Recargas y paquetes** y **Equipos móviles**, cada una con las cuatro etapas por defecto del embudo.

### Métricas

| Línea | Tipo | Métrica | Unidad | Dirección | Línea base | Objetivo H1 |
|---|---|---|---|---|---|---|
| Pospago | north_star | Altas digitales semanales | altas | sube | 420 | 520 |
| Pospago | efficiency | Costo por alta | COP | baja | 185.000 | 160.000 |
| Pospago | input (volumen de demanda) | Costo por conversación | COP | baja | 9.800 | 8.000 |
| Recargas y paquetes | north_star | Clientes con recarga digital recurrente | clientes | sube | 12.000 | 15.000 |
| Recargas y paquetes | input (recuperación y recurrencia) | Tasa de segunda recarga a 30 días | % | sube | 18% | 22% |
| Equipos móviles | north_star | Equipos vendidos por eCommerce semanales | unidades | sube | 150 | 190 |
| Equipos móviles | input (conversión) | Carrito a compra de equipo | % | sube | 24% | 28% |

Cargar **12 semanas de valores inventados** (del 3 de agosto al 19 de octubre de 2026) para las métricas de entrada. Deben ser coherentes con los ejercicios: la segunda recarga sube después de que se escala el ejercicio 1, y el costo por conversación empieza a bajar en octubre.

### Problemas

1. **Recargas y paquetes · Recuperación y recurrencia · WhatsApp.** "Pocos clientes hacen una segunda recarga en los primeros 30 días." Evidencia: "Solo el 18% repite en 30 días; el 60% de los que no repiten no abrió ninguna comunicación posterior." Causa raíz: "El cliente olvida recargar y no conoce los paquetes." Impacto alto, control nuestro, validado.
2. **Pospago · Adquisición · WhatsApp.** "El costo por conversación subió 35% en seis semanas." Evidencia: "Los mismos tres creativos llevan 8 semanas activos y la frecuencia pasó de 1,8 a 3,4." Causa raíz: "Fatiga creativa." Impacto alto, control nuestro, validado.
3. **Equipos móviles · Activación · eCommerce.** "Muchas visitas a la ficha del equipo terminan sin agregar al carrito." Evidencia: "El 70% de las salidas ocurre en los 10 segundos posteriores a ver el precio." Causa raíz: "El precio total de contado se percibe alto." Impacto medio, control nuestro, validado.

### Ejercicio 1 · Decidido, ganador, escalado a BAU

- **Título:** Recordatorio de recarga con paquete sugerido por WhatsApp.
- **Problema:** 1. **Métrica del árbol:** tasa de segunda recarga a 30 días.
- **Hipótesis:** SI enviamos por WhatsApp un recordatorio a los 25 días de la primera recarga con un paquete sugerido según su consumo, ENTONCES sube la segunda recarga a 30 días, PORQUE el cliente se acuerda a tiempo y descubre un paquete que le sirve.
- **ICE:** impacto 8, confianza 7, facilidad 8 (ICE 7,7). Calendario sí, control nuestro. Puntaje final 8,7.
- **Responsable:** un usuario interno. **Tipo:** interno.
- **Diseño:** A/B. Métrica principal: segunda recarga a 30 días. Métrica de control: tasa de bloqueo del número de WhatsApp (no debe superar el 1,5%). Duración mínima: 4 semanas. Regla de decisión: "Escalar si la variante supera al control en al menos 10% relativo y el bloqueo no pasa de 1,5%."
- **Fechas:** 10 ago – 13 sep 2026 (planeado y real).
- **Variantes:**
  - Control, sin recordatorio: muestra 5.000, conversiones 900.
  - Variante, recordatorio con paquete: muestra 5.000, conversiones 1.150. Nota: "Bloqueo del número: 0,9%."
- **Resultado calculado:** 18,0% contra 23,0%, es decir, +27,8% relativo.
- **Veredicto:** ganador. **Decisión:** escalar. **Estado:** Escalado a BAU.
- **Aprendizaje:** "Un recordatorio oportuno con una oferta concreta mueve la recurrencia sin desgastar el canal. El momento (día 25) importa más que el descuento." Aplica a: Pospago, como recordatorio de pago o de beneficios.

### Ejercicio 2 · En prueba, ejecutado por la agencia

- **Título:** Rotación de creativos en video vertical testimonial.
- **Problema:** 2. **Métrica del árbol:** costo por conversación.
- **Hipótesis:** SI reemplazamos los tres creativos actuales por seis videos verticales testimoniales nuevos, ENTONCES baja el costo por conversación, PORQUE se corta la fatiga creativa y el formato genera más interacción.
- **ICE:** impacto 7, confianza 6, facilidad 6 (ICE 6,3). Calendario sí, control nuestro. Puntaje final 7,3.
- **Responsable:** un usuario con rol agency. **Tipo:** agencia.
- **Diseño:** A/B mediante una división de presupuesto 50/50. Métrica principal: costo por conversación. Métrica de control: tasa de conversación a venta (no debe caer más de 5% relativo). Duración mínima: 3 semanas. Regla de decisión: "Escalar si el costo por conversación de la variante es al menos 12% menor que el del control y la conversación a venta no cae más de 5%."
- **Fechas planeadas:** 5 oct – 1 nov 2026, con inicio real el 5 oct. El diseño está bloqueado (`design_locked_at` el 5 oct).
- **Variantes:**
  - Control, creativos actuales: sin resultados todavía.
  - Variante, seis videos testimoniales: sin resultados todavía.
- **Estado:** En prueba. Sirve para mostrar el bloqueo del diseño y que la agencia puede editar este ejercicio pero no el 1 ni el 3.

### Ejercicio 3 · Decidido, perdedor, apagado

- **Título:** Precio en cuotas mensuales en la ficha del equipo.
- **Problema:** 3. **Métrica del árbol:** carrito a compra de equipo.
- **Hipótesis:** SI mostramos el precio como cuota mensual en lugar del precio total, ENTONCES más visitas terminan en compra, PORQUE el precio se percibe accesible.
- **ICE:** impacto 7, confianza 5, facilidad 9 (ICE 7,0). Calendario sí, control nuestro. Puntaje final 8,0.
- **Responsable:** un usuario interno. **Tipo:** interno.
- **Diseño:** por geografía (Ciudad Norte como variante y Ciudad Sur como control). Métrica principal: carrito a compra de equipo. Métrica de control: tasa de agregar al carrito. Duración mínima: 3 semanas. Regla de decisión: "Escalar si la conversión de carrito a compra sube al menos 8% relativo."
- **Fechas:** 31 ago – 27 sep 2026 (planeado y real).
- **Variantes:**
  - Control (Ciudad Sur, precio total): muestra 2.400 carritos, conversiones 600.
  - Variante (Ciudad Norte, cuota mensual): muestra 3.100 carritos, conversiones 651. Nota: "Los carritos subieron 29%, pero muchos abandonan al ver el total en el checkout."
- **Resultado calculado:** 25,0% contra 21,0%, es decir, −16,0% relativo.
- **Veredicto:** perdedor. **Decisión:** apagar. **Estado:** Decidido.
- **Aprendizaje:** "La cuota atrae más interés, pero la sorpresa del precio total al final genera abandono. El problema es la coherencia del precio a lo largo del recorrido, no el precio en sí." Aplica a: Pospago. Hipótesis derivada sugerida: "Mostrar cuota y total juntos desde la ficha."

### Qué debe verse con el ejemplo cargado

- **Kanban:** un ejercicio en Escalado a BAU, uno en En prueba y uno en Decidido.
- **Gantt:** tres barras, y el ejercicio 2 terminando antes del congelamiento de noviembre.
- **Resultados:** dos cerrados, win rate del 50% y la diferencia del ganador (+27,8%).
- **Portafolio:** un ejercicio en cada línea, en etapas distintas.
- **Evolución de métricas:** el efecto del ejercicio 1 visible en la segunda recarga.

## Calidad

- Tests de Vitest para: el cálculo de ICE y del puntaje final, las transiciones del ciclo de vida, los cálculos de resultados y la detección de cruces con congelamientos.
- Tests de las políticas RLS: por ejemplo, que un usuario de la agencia no pueda editar un ejercicio que no tiene asignado y que un viewer no pueda escribir nada.
- Tests de borrado: borrado lógico, restauración, cascada al borrar una línea, reasignación al borrar un problema con ejercicios y que la agencia no pueda borrar lo que no creó.
- Un smoke test de Playwright: login → crear programa → crear línea → crear métrica → crear problema → crear ejercicio → moverlo a "En prueba" → borrarlo → restaurarlo desde la papelera.
- Un test de la carga del programa de ejemplo que verifique los tres ejercicios, sus estados, el win rate del 50% y que "Borrar programa de ejemplo" no deje nada en la base ni en Storage.
- Manejo de errores visible para el usuario y estados de carga en todas las vistas de datos.
- Nada de secretos en el código; las variables van en `.env.local`, con un `.env.example` documentado.

## Contenido de CLAUDE.md

El archivo debe incluir:

1. **Qué es el producto**, en un párrafo, con referencia al PDF en `docs/`.
2. **Glosario del dominio**: programa, línea, métrica norte, árbol, embudo, problema, ejercicio, variante, ICE, filtros, congelamiento, punto de decisión, veredicto, decisión, aprendizaje, papelera y programa de ejemplo.
3. **Stack y comandos**: desarrollo, build, lint, tests, migraciones y generación de tipos.
4. **Arquitectura**: estructura de carpetas, dónde vive la lógica de negocio y cómo se accede a Supabase desde el servidor y el cliente.
5. **Modelo de datos** resumido, con sus relaciones.
6. **Reglas de negocio** numeradas, las mismas de esta especificación, marcando dónde está implementada cada una.
7. **Matriz de permisos** y cómo se aplica con RLS.
8. **Sistema de diseño**: tokens y reglas de uso del amarillo.
9. **Convenciones**: nombres, componentes, manejo de errores y formularios.
10. **Qué no hacer**: saltarse RLS, meter lógica de negocio en los componentes o agregar librerías sin preguntar.

## Entregables finales

- Repositorio funcionando localmente con `npm run dev` contra un proyecto de Supabase.
- Migraciones completas, con RLS activa en todas las tablas.
- `CLAUDE.md` y `README.md`. El README debe explicar: crear el proyecto en Supabase, configurar las variables de entorno, correr las migraciones, crear el primer admin y desplegar en Vercel.
- Tests pasando y build sin errores.
