# Correo de Arriero (SMTP propio en Supabase)

Sin SMTP propio, Supabase manda muy pocos correos por hora y con su diseño genérico. Con esto, las invitaciones y la recuperación de contraseña salen con la marca Arriero.

**Camino elegido: una cuenta de Gmail para Arriero.** No necesita dominio propio, ni DNS, ni TI. Los correos salen desde Google, así que llegan bien a la bandeja de entrada. El límite es de unos 500 correos al día, de sobra para un equipo interno.

> La contraseña de aplicación se escribe solo en el panel de Supabase. No se pega en el chat, en el código ni en este repositorio.

## 1. Crear la cuenta de Gmail

1. Cree una cuenta nueva en [accounts.google.com](https://accounts.google.com), por ejemplo `arriero.growth@gmail.com` (la que esté libre). En el nombre ponga **Arriero** para que los correos digan "Arriero" como remitente.
2. Opcional: póngale como foto de perfil la mula (`public/brand/arriero-mark.png`). Gmail la muestra al lado de los correos.

## 2. Activar la verificación en dos pasos

En esa cuenta: **Gestionar tu cuenta de Google → Seguridad → Verificación en dos pasos → Activar**. Google la exige para el paso siguiente.

## 3. Crear una contraseña de aplicación

1. Entre a [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) con la cuenta de Arriero.
2. Nombre: `Supabase Arriero` → **Crear**.
3. Google muestra una contraseña de 16 letras. Cópiela (sin espacios): solo se muestra una vez. Esta es la contraseña del SMTP; **no** es la contraseña normal de la cuenta.

## 4. Configurar el SMTP en Supabase

Proyecto `orehfqgrohqdoxmboczu` → **Authentication → Emails → SMTP Settings** → active **Enable custom SMTP**:

| Campo | Valor |
|---|---|
| Sender email | la cuenta de Gmail (`arriero.growth@gmail.com`) |
| Sender name | `Arriero` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | la misma cuenta de Gmail |
| Password | la contraseña de aplicación del paso 3 (escríbala usted en el panel) |
| Minimum interval between emails | `10` segundos (el valor por defecto está bien) |

Guarde.

## 5. Límites y direcciones

- **Authentication → Rate Limits → Rate limit for sending emails:** por ejemplo, 100 por hora (Gmail permite ~500 al día).
- **Authentication → URL Configuration:**
  - **Site URL:** la dirección de producción de Arriero en Vercel (por ejemplo `https://arriero.vercel.app`). Los correos la usan para el botón y para mostrar el logo.
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

Para cambiar un texto, edite `scripts/build-email-templates.mjs`, corra `node scripts/build-email-templates.mjs` y vuelva a pegar la plantilla que cambió.

**Las imágenes** (el nombre ARRIERO arriba y la ilustración de cada correo) se cargan desde `{{ .SiteURL }}/brand/…`: se ven cuando la app ya está publicada en Vercel. Probando en local, el correo llega bien pero sin imágenes.

## 7. Probar

1. En Arriero, **Usuarios → Crear usuario** con un correo suyo de prueba. Debe llegar "¡Ave María! Su equipo ya está experimentando y solo falta usted".
2. En el login, **Se me olvidó la contraseña** con ese correo. Debe llegar "¿Se le embolató la contraseña? Tranquilidad, eso no baja la conversión".
3. Si no llega: revise spam, confirme que la contraseña de aplicación no tenga espacios y que el usuario sea la cuenta de Gmail completa.

Cuando el SMTP funcione, las invitaciones llegan solas por correo y ya no hace falta copiar el enlace a mano.

## Si algún día quiere un dominio propio

Se cambia solo el paso 4 (host, puerto, usuario y contraseña del proveedor, por ejemplo Resend o Brevo) después de verificar el dominio en ese proveedor. Las plantillas siguen iguales.

## Siguiente paso (opcional): avisos por correo

Los avisos de Arriero hoy son dentro de la app. Para mandarlos también por correo se puede usar esta misma cuenta de Gmail desde la app (con la contraseña de aplicación en `.env.local` y en Vercel). Se construye cuando el SMTP esté andando.
