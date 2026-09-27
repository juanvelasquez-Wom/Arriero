# Correo de Arriero (SMTP propio en Supabase)

Sin SMTP propio, Supabase manda muy pocos correos por hora y con su diseño genérico. Con esto, las invitaciones y la recuperación de contraseña salen con la marca Arriero y desde su dominio.

**Proveedor recomendado:** [Resend](https://resend.com). Es simple, tiene plan gratis (3.000 correos al mes) y funciona bien con Supabase. Si WOM ya tiene un SMTP corporativo (Microsoft 365, Google Workspace, SendGrid), sirve igual: solo cambian el servidor, el puerto y el usuario.

> Las contraseñas y llaves se escriben solo en los paneles de Resend y Supabase. No se pegan en el chat, en el código ni en este repositorio.

## 1. Elegir el remitente

Decida desde qué correo sale Arriero, por ejemplo `arriero@movilpt.co` o `hola@arriero.<dominio>`. Necesita acceso al DNS de ese dominio (o a alguien de TI que lo tenga).

Recomendación: use un subdominio (`mail.movilpt.co`) para no tocar la reputación del correo corporativo.

## 2. Verificar el dominio en Resend

1. Cree la cuenta en resend.com con un correo del equipo.
2. **Domains → Add domain** y escriba el dominio o subdominio.
3. Resend le muestra 3 o 4 registros DNS (SPF en TXT, DKIM, y opcional MX para rebotes). Pídale a TI que los cree tal cual.
4. Agregue también un registro **DMARC** si el dominio no tiene: `TXT _dmarc.<dominio>` con `v=DMARC1; p=none;`.
5. Vuelva a Resend y pulse **Verify**. Puede tardar de minutos a unas horas.

## 3. Crear la llave SMTP

En Resend: **API Keys → Create API key**, con nombre `arriero-supabase` y permiso "Sending access" para ese dominio. Copie la llave (empieza por `re_`): solo se muestra una vez.

## 4. Configurar el SMTP en Supabase

Proyecto `orehfqgrohqdoxmboczu` → **Authentication → Emails → SMTP Settings** → active **Enable custom SMTP**:

| Campo | Valor |
|---|---|
| Sender email | el remitente del paso 1 (`arriero@…`) |
| Sender name | `Arriero` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | la llave `re_…` del paso 3 (escríbala usted en el panel) |
| Minimum interval between emails | `10` segundos (el valor por defecto está bien) |

Guarde.

## 5. Límites y direcciones

- **Authentication → Rate Limits → Rate limit for sending emails:** súbalo a lo que necesite el equipo (por ejemplo, 100 por hora).
- **Authentication → URL Configuration:**
  - **Site URL:** la dirección de producción de Arriero en Vercel (por ejemplo `https://arriero.vercel.app`). Los correos usan esta dirección para el botón y para mostrar el logo.
  - **Redirect URLs:** agregue `https://<producción>/auth/confirm` y `http://localhost:3000/auth/confirm`.

## 6. Pegar las plantillas con la marca

**Authentication → Emails → Templates.** Para cada plantilla, copie el asunto de `supabase/templates/asuntos.txt` y el contenido del archivo HTML:

| Plantilla en Supabase | Archivo |
|---|---|
| Invite user | `supabase/templates/invite.html` |
| Reset password | `supabase/templates/recovery.html` |
| Magic link | `supabase/templates/magic_link.html` |
| Change email address | `supabase/templates/email_change.html` |
| Reauthentication | `supabase/templates/reauthentication.html` |
| Confirm signup | `supabase/templates/confirmation.html` |

Para cambiar un texto, edite `scripts/build-email-templates.mjs`, corra `node scripts/build-email-templates.mjs` y vuelva a pegar la plantilla que cambió. (Si algún día se hace `npx supabase login`, `supabase/config.toml` ya apunta a estos archivos.)

**El logo** se carga desde `{{ .SiteURL }}/brand/arriero-logo.png`: se ve cuando la app ya está publicada en Vercel. Probando en local, el correo llega bien pero sin el logo.

## 7. Probar

1. En Arriero, **Usuarios → Crear usuario** con un correo suyo de prueba. Debe llegar "Su equipo le abrió un campo en Arriero".
2. En el login, **Se me olvidó la contraseña** con ese correo. Debe llegar "Recupere su contraseña de Arriero".
3. Revise también la carpeta de spam. Si el correo cae ahí, casi siempre es SPF, DKIM o DMARC sin verificar.

Cuando el SMTP funcione, la app deja de mostrar el enlace para copiar a mano en las invitaciones, porque el correo ya llega solo.

## Siguiente paso (opcional): avisos por correo

Los avisos de Arriero (asignaciones, "ya se puede leer", recordatorio del lunes) hoy son dentro de la app. Para mandarlos también por correo, la app necesita su propia llave de Resend (`RESEND_API_KEY` en `.env.local` y en Vercel) y un resumen diario por persona. Se construye cuando el SMTP esté andando.
