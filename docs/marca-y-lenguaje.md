# Marca y lenguaje de Arriero

> Guía práctica para construir pantallas que se sientan de Arriero. Complementa [`brand/concepto.md`](brand/concepto.md) (concepto, metáfora y ciclo) y la sección 8 de `CLAUDE.md`. Si algo aquí contradice al código, manda el código y se corrige esta guía.
>
> Auditoría hecha el 27 sep 2026 recorriendo `src/app/globals.css`, `src/components/**`, `src/domain/labels.ts`, `src/domain/glossary.ts`, `src/lib/action-result.ts`, `src/components/brand/phrases.ts` y las migraciones.

---

## 1. Sistema visual

### Tokens (`src/app/globals.css`)

| Token | Claro | Oscuro | Clase de Tailwind | Uso |
|---|---|---|---|---|
| `--ink` | `#111111` | `#F2F2F0` | `text-ink` | Texto principal, foco visible |
| `--soft` | `#595959` | `#A9A9A6` | `text-soft` | Texto secundario |
| `--line` | `#E2E2DF` | `#333333` | `border-line` | Bordes |
| `--wash` | `#F6F6F4` | `#161616` | `bg-wash` | Fondos de sección |
| `--paper` | `#FFFFFF` | `#1F1F1F` | `bg-paper` | Fondo |
| `--accent-yellow` | `#F2C200` | `#F2C200` | `bg-highlight`, `primary` | Único acento |
| `--gray-1…5` | `#ECECE9` → `#3A3A39` | `#2C2C2B` → `#D0D0CC` | `bg-gray-1…5` | Estados, barras, intensidades |
| `--destructive` | `#1F1F1F` | `#F2F2F0` | variante `destructive` | Borrar (no hay rojo) |

- **Radios:** `--radius: 0.75rem`, con la escala `radius-sm` … `radius-4xl`.
- **Sombras:** `shadow-card` (reposo) y `shadow-lift` (tarjeta clicable, clase `lift`).
- **Tipografía:**
  - Titulares h1–h3 en **Bricolage Grotesque** (`font-heading`); texto en **Inter** (`font-sans`); ambas por `next/font`.
  - `tabular-nums` en cifras y tablas.
  - Todo en mayúscula inicial (*sentence case*), también botones y títulos.
  - Etiquetas pequeñas en mayúsculas con `tracking` amplio (p. ej. "LA MULA DICE").
- **Amarillo solo para lo que exige atención:** navegación activa, acción primaria, punto de decisión, ganador, "En prueba" y avisos (`Callout`). Texto sobre amarillo, siempre `#1F1F1F`. Nunca como decoración.
- **No hay rojo ni verde.** Lo malo se dice con gris oscuro, ícono y texto; lo bueno, con amarillo e ícono.
- **Iconos:**
  - Interfaz con `lucide-react`, siempre con etiqueta: nunca solo color, nunca solo ícono.
  - Ilustración con los 16 íconos de marca (`BrandIcon`, `public/brand/icons/`) y la mula (`Mule`).
- **Movimiento:** `rise`, `slide-in`, `pop-in`, `stagger`, `lift`, `float-soft`, `shimmer`, `fill-in`, `bell-ring`, `mule-walk`, `mule-trek`. Todas se apagan con `prefers-reduced-motion`.
- **Modo oscuro:** `next-themes`, por defecto el del sistema. Logo y mula se invierten con `.brand-ink`, o con `.brand-on-dark` sobre fondo negro fijo.

### Componentes base (reutilizar antes de crear)

| Necesidad | Componente |
|---|---|
| Botones | `ui/button`: `default` (amarillo, acción primaria, una por vista), `outline`, `secondary`, `ghost`, `destructive`, `link`; tamaños `xs` a `lg` e `icon-*` |
| Encabezado de página | `PageHeader` (eyebrow, título, descripción, acciones) · `app/page.tsx` |
| Secciones y cifras | `Section`, `Stat`, `CountUp` |
| Avisos | `Callout` (tono `attention` amarillo o `neutral`) |
| Vacío / error | `EmptyState` (mula o ícono de marca + siguiente paso), `ErrorState`, `RouteError`, `PageSkeleton` |
| Estados y resultados | `StatusBadge`, `VerdictBadge`, `DecisionBadge`, `ProblemStatusBadge`, `ImpactBadge`, `DemoBadge` ("Ejemplo") · `status-badge.tsx` |
| Ayuda en línea | `InfoTip` (burbuja ⓘ), `<Term k=…/>` (glosario único en `domain/glossary.ts`), panel "¿Qué es esto?" del asistente |
| Confirmar / borrar | `ConfirmAction`, `DeleteButton` (impacto, reasignar o borrar juntos, papelera) |
| Formularios | `FormField`, `SubmitButton`, `FormError` + shadcn `field`, `input`, `select`, `slider`, `switch`, `radio-group`, `toggle-group` |
| Tablas y filtros | `ui/table`, `UrlFilters`, `MobileFiltersToggle`, `DashboardFilters` |
| Importar / exportar | `PasteImportDialog` ("Pegar desde Excel"), `ExportCsvButton` ("Exportar a Excel"), `CopySummaryButton`, `PrintButton` |
| Gráficos | `CountBarChart`, `VelocityChart` (Recharts) · `Gantt` propio · `Kanban` (dnd-kit) |
| Pasos guiados | `WizardShell`, `StepFooter` (`components/setup`) · `ExperimentWizard` |
| Avisos flotantes | `sonner` (toast) · `celebrate()` para logros de verdad |

## 2. Voz y tono

- **Siempre de usted**, paisa, cercano y con humor. Nada de "parce" ni similares, nada de tuteo ni voseo, nada de groserías. La auditoría no encontró tuteo en la interfaz; la migración 008 pasó a usted los mensajes de la base.
- **Largo:** frases cortas. Una idea por texto de ayuda. Máximo **un** chiste por mensaje.
- **Errores:**
  - Primero **qué pasó y cómo se arregla**, luego el chiste, si cabe. Ejemplo: "Revise los campos marcados, sin afán."
  - Las reglas de negocio se explican sin chiste: "El diseño está bloqueado desde que el ejercicio entró en prueba. Solo el owner puede desbloquearlo."
- **Confirmaciones:** celebran corto. "¡Eso! «{título}» pasó a {estado}." · "¡Listo pues! Archivo descargado".
- **Estados vacíos:** dicen qué va aquí y el siguiente paso. "¿Y por dónde es? Aún no hay problemas" · "Primero, un problema con evidencia".
- **Botones:**
  - Verbo en **infinitivo** y concreto: Guardar, Guardar y seguir, Agregar, Priorizar, Descartar, Invitar, Copiar resumen, Pegar desde Excel, Decidir y registrar aprendizaje.
  - La acción peligrosa repite el verbo: "Sí, borrar".
- **Frases de la casa** (`phrases.ts`): "Hágale pues", "Probemos por ahí", "Ese camino no era", "No cargue por cargar", "¿Y por dónde es?", "Ensillando la mula…".
- **Términos técnicos:** no se esconden; se acompañan de una explicación corta con `InfoTip` o `Term`. Por ejemplo, "Probabilidad de ganar: qué tan seguros estamos de que la variante le gana al control".

## 3. Vocabulario (`domain/labels.ts` y `domain/glossary.ts`)

| Concepto | Texto en la interfaz |
|---|---|
| Unidad de prueba del modelo | **Ejercicio** (no "experimento") |
| Roles de programa | Owner · Colaborador · Agencia · Lector |
| Estados de ejercicio | Idea · Priorizado · En diseño · En prueba · En lectura · Decidido · Escalado a BAU · Descartado |
| Veredicto | Ganador · Perdedor · No concluyente |
| Decisión | Escalar · Ajustar · Apagar |
| Control del problema | Nuestro · Compartido · Externo |
| Tipo de prueba | A/B · Por geografía · Antes / después |
| Calendario | Pico comercial · Congelamiento · Punto de decisión |
| Métricas | Métrica norte · Eficiencia · Entrada; línea base, meta, valor unitario |
| Otros | Problema, evidencia, hipótesis (SI / ENTONCES / PORQUE), regla de decisión, duración mínima, variante, variante de control, probabilidad de ganar, diferencia vs. control, tamaño de muestra, valor estimado, aprendizaje, bloqueo del diseño, papelera, ejemplo, responsable |

- **Confianza de un resultado** (`confidenceBand`):
  - "Confiable": probabilidad ≥ 95 %.
  - "Casi": ≥ 80 %.
  - "Todavía no se sabe": por debajo.
- **Pruebas geo y antes/después:** se marcan como "Evidencia direccional".

## 4. Inconsistencias encontradas (reportadas, sin corregir)

1. **"Experimento" vs. "ejercicio".**
   - La interfaz dice "ejercicio" (224 veces), pero el copy de marca usa "experimento": la frase de la pantalla de acceso "Del dato al experimento…", dos chistes del login, el ícono "El carriel de los experimentos" y la etapa "Experimentar".
   - `concepto.md` usa "experimentos" en todo el texto.
2. **Inglés visible en la interfaz:**
   - el rol "Owner";
   - el botón "Close" de `ui/dialog.tsx` y `ui/sheet.tsx` (texto para lectores de pantalla);
   - los términos Backlog, Kanban, Gantt y BAU (estos cuatro parecen deliberados).
3. **Dos formas de reintentar:** "Reintentar" e "Intentar de nuevo".
4. **Botones con dos modos:** la mayoría van en infinitivo, pero algunos en imperativo de usted ("Termine y vaya al programa").
5. **"Todavía no" y "Aún no"** se usan indistintamente en los estados vacíos.
6. **Comillas mezcladas:** “ ” (20 usos) y « » (15 usos).
7. **"Borrar" vs. "Eliminar":**
   - "Borrar" manda a la papelera y "Eliminar definitivamente" purga.
   - Parece intencional, pero no estaba documentado. Queda documentado aquí.
8. **La sección 8 de `CLAUDE.md` no describe la voz real:**
   - Empieza con "Línea ejecutiva y sobria", mientras la app habla con humor ("¡Juepucha!", confeti).
   - El valor de `--soft` en `CLAUDE.md` (`#5C5C5C`) no coincide con el código (`#595959`).
9. **Algunos errores ponen el chiste primero** ("¡Uy, qué pena! No tiene permiso…"), en contra de la regla "primero qué pasó".

## 5. Reglas para módulos nuevos

- Solo tokens y componentes de las secciones 1 y 2. Si falta algo, se construye con los mismos tokens y se agrega a `src/components/app` para que lo use todo Arriero.
- Colores, tipografías o iconografía nuevas se proponen antes.
- Si un concepto ya existe en Arriero, se usa el mismo término y el mismo componente, aunque el prompt o la especificación lo llamen distinto.
- Cada módulo documenta su glosario (término → texto en la interfaz). El de Pilotos está en [`pilotos/plan.md`](pilotos/plan.md#3-glosario-del-módulo).
