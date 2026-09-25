# Growth Framework

Web app para operar un modelo de growth marketing: métrica norte por línea de negocio, árbol de métricas, embudo, problemas con evidencia, ejercicios priorizados con ICE y filtros de calendario y control, pruebas con diseño bloqueado, congelamientos comerciales, decisiones y aprendizajes reutilizables.

- Modelo de referencia: [`docs/modelo-growth-marketing-wom.pdf`](docs/modelo-growth-marketing-wom.pdf)
- Especificación funcional: [`docs/especificacion.md`](docs/especificacion.md)
- Guía técnica (arquitectura, reglas, permisos, convenciones): [`CLAUDE.md`](CLAUDE.md)

Stack: Next.js 16 (App Router, TypeScript estricto) · Tailwind 4 + shadcn/ui · Supabase (Auth, Postgres con RLS, Storage, Realtime) · zod + react-hook-form · Recharts · dnd-kit · Vitest · Playwright · Vercel.

---

## Requisitos

- Node.js **22.18 o superior** (recomendado 24 LTS) y npm.
- Una cuenta de Supabase con acceso al proyecto.
- No se necesita Docker: las migraciones se aplican directo al proyecto remoto con la CLI.

## 1. Crear el proyecto en Supabase

> Este repositorio ya está pensado para el proyecto existente `orehfqgrohqdoxmboczu`. Si vas a montar otro entorno (por ejemplo, uno de pruebas), sigue estos pasos:

1. En [supabase.com/dashboard](https://supabase.com/dashboard) crea un proyecto nuevo. Guarda la contraseña de la base en tu gestor de contraseñas.
2. En **Project Settings → API Keys** copia la **Publishable key** y crea o copia una **Secret key** (sistema nuevo de llaves; no uses `anon` ni `service_role`).
3. En **Authentication → Sign In / Providers → Email**:
   - desactiva **Allow new users to sign up** (solo se entra por invitación);
   - deja activo el acceso con correo y contraseña.
4. En **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` en desarrollo (o la URL de producción);
   - **Redirect URLs**: agrega `http://localhost:3000/**` y `https://<tu-dominio>/**`.
5. **Correo (importante para invitar):** el SMTP por defecto de Supabase solo envía a los miembros del equipo del proyecto y tiene un límite muy bajo. Para invitar a cualquier persona configura un SMTP propio en **Authentication → Emails → SMTP Settings**. Sin SMTP la app igual funciona: al invitar genera un enlace de invitación para compartir a mano.

## 2. Variables de entorno

Copia la plantilla y completa los valores:

```bash
cp .env.example .env.local
```

| Variable | Dónde se usa | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente y servidor | URL del proyecto (`https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | cliente y servidor | Llave publicable |
| `SUPABASE_SECRET_KEY` | **solo servidor** | Llave secreta. Nunca con prefijo `NEXT_PUBLIC_`, nunca en el código ni en commits |
| `NEXT_PUBLIC_SITE_URL` | servidor | URL pública de la app, para los enlaces de invitación y recuperación |
| `CRON_SECRET` | **solo servidor** | Secreto largo y aleatorio para el job que purga la papelera |

`.env.local` está en `.gitignore`.

## 3. Instalar y correr las migraciones

```bash
npm install
npx supabase login          # abre el navegador; una sola vez por equipo
npm run db:link             # vincula con el proyecto orehfqgrohqdoxmboczu
npm run db:push             # aplica supabase/migrations/*
npm run db:types            # genera src/lib/supabase/database.types.ts
```

Si `db:link` o `db:push` piden la contraseña de la base, escríbela en la terminal (no la guardes en archivos). Las migraciones crean el esquema, las funciones de reglas de negocio, las políticas RLS, el bucket privado `attachments` y la publicación de Realtime.

## 4. Crear el primer admin

```bash
npm run create-admin -- --email ana@empresa.com --name "Ana Pérez"
```

El script crea el usuario (o lo promueve si ya existe), lo marca como **admin global** e imprime un enlace de un solo uso para que cree su contraseña. Abre el enlace con la app corriendo (`npm run dev`). Si prefieres fijar la contraseña directamente, define `ADMIN_PASSWORD` en el entorno al correr el comando.

Luego entra a `http://localhost:3000`, crea el primer programa o usa **Cargar programa de ejemplo** (todos sus datos son inventados).

## 5. Desarrollo

```bash
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck
npm test             # lógica de negocio (Vitest)
npm run build
```

### Tests contra la base

Crean usuarios y programas de prueba en el proyecto configurado en `.env.local` y los borran al terminar. Úsalos preferiblemente contra un proyecto de pruebas.

```bash
npm run test:db                    # RLS, borrado lógico y programa de ejemplo
npx playwright install chromium    # una vez
npm run test:e2e                   # smoke: login → programa → línea → métrica → problema → ejercicio → En prueba → borrar → restaurar
```

El test del programa de ejemplo se salta solo si ya existe un ejemplo cargado, para no borrarlo.

## 6. Desplegar en Vercel

1. Sube el repositorio a GitHub, GitLab o Bitbucket e impórtalo en [vercel.com/new](https://vercel.com/new) (framework: Next.js, comandos por defecto).
2. En **Settings → Environment Variables** agrega las cinco variables de la sección 2. En producción, `NEXT_PUBLIC_SITE_URL` es la URL pública (por ejemplo `https://growth.tu-dominio.com`). Marca `SUPABASE_SECRET_KEY` y `CRON_SECRET` como sensibles.
3. En Supabase, agrega la URL de producción a **Site URL** y a **Redirect URLs** (`https://growth.tu-dominio.com/**`).
4. Despliega. `vercel.json` programa `/api/cron/purgar-papelera` una vez al día; Vercel envía `Authorization: Bearer $CRON_SECRET`. Ese job elimina de forma definitiva lo que lleva más de 30 días en la papelera y borra sus archivos de Storage.
5. Las migraciones nuevas se aplican con `npm run db:push` desde tu equipo (o desde CI con `SUPABASE_ACCESS_TOKEN`), antes de desplegar el código que las usa.

## Estructura

Ver la sección 4 de [`CLAUDE.md`](CLAUDE.md). En resumen: `supabase/migrations` (esquema, reglas, RPC, RLS), `src/domain` (lógica pura con tests), `src/server` (consultas, server actions, programa de ejemplo), `src/app` (rutas), `src/components` (UI por módulo).
