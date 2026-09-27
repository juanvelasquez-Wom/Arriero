// Genera las plantillas de correo de Supabase Auth con la marca ARRIERO.
// Uso: node scripts/build-email-templates.mjs  → escribe supabase/templates/*.html
// Las plantillas usan variables de Supabase ({{ .SiteURL }}, {{ .TokenHash }}, …)
// y enlazan a /auth/confirm con token_hash, que es lo que espera la app.
import { mkdirSync, writeFileSync } from "node:fs";

const INK = "#111111";
const SOFT = "#595959";
const WASH = "#F6F6F4";
const LINE = "#E2E2DF";
const YELLOW = "#F2C200";

function layout({ preheader, title, body, button, after, footnote }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${WASH};font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:${INK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${WASH};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${LINE};border-radius:16px;overflow:hidden;">
      <tr><td style="padding:28px 32px 8px 32px;">
        <img src="{{ .SiteURL }}/brand/arriero-logo.png" width="120" alt="Arriero · Growth Engine" style="display:block;width:120px;height:auto;border:0;">
      </td></tr>
      <tr><td style="padding:8px 32px 0 32px;">
        <h1 style="margin:0;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.02em;color:${INK};">${title}</h1>
      </td></tr>
      <tr><td style="padding:12px 32px 0 32px;font-size:15px;line-height:1.6;color:${INK};">${body}</td></tr>
      ${
        button
          ? `<tr><td style="padding:24px 32px 8px 32px;">
        <a href="${button.href}" style="display:inline-block;background:${YELLOW};color:${INK};text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:10px;">${button.label}</a>
      </td></tr>
      <tr><td style="padding:8px 32px 0 32px;font-size:12px;line-height:1.5;color:${SOFT};">
        Si el botón no abre, copie este enlace en el navegador:<br>
        <a href="${button.href}" style="color:${SOFT};word-break:break-all;">${button.href}</a>
      </td></tr>`
          : ""
      }
      ${after ? `<tr><td style="padding:16px 32px 0 32px;font-size:15px;line-height:1.6;color:${INK};">${after}</td></tr>` : ""}
      <tr><td style="padding:24px 32px 28px 32px;">
        <p style="margin:0;padding-top:16px;border-top:1px solid ${LINE};font-size:12px;line-height:1.5;color:${SOFT};">
          ${footnote}<br>
          <strong style="color:${INK};">Arriero</strong> · Menos carreta, más crecimiento.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;
}

const confirm = (type) => `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}`;

const templates = {
  invite: {
    subject: "Su equipo le abrió un campo en Arriero: ¿arrancamos?",
    html: layout({
      preheader: "Cree su contraseña y entre al programa de growth de su equipo.",
      title: "¡Hágale pues, que su equipo ya arrancó!",
      body: `<p style="margin:0 0 12px 0;">Le abrieron una cuenta en <strong>Arriero</strong>, donde su equipo organiza el crecimiento: métricas, problemas, ejercicios y lo que se va aprendiendo, todo en un solo lugar.</p>
<p style="margin:0;">Para entrar solo tiene que crear su contraseña. Son dos minutos, sin carreta.</p>`,
      button: { href: confirm("invite"), label: "Crear mi contraseña" },
      after: `<p style="margin:0;font-size:13px;color:${SOFT};">El enlace sirve una sola vez y vence en 24 horas. Si vence, pídale a quien le mandó la invitación que la envíe de nuevo.</p>`,
      footnote: "Si no esperaba esta invitación, puede ignorar este correo: sin la contraseña nadie entra con su cuenta.",
    }),
  },
  recovery: {
    subject: "Recupere su contraseña de Arriero",
    html: layout({
      preheader: "Un enlace para crear una contraseña nueva.",
      title: "Sin afán, eso le pasa a cualquiera",
      body: `<p style="margin:0 0 12px 0;">Recibimos una solicitud para cambiar la contraseña de <strong>{{ .Email }}</strong> en Arriero.</p>
<p style="margin:0;">Con este botón crea una nueva y sigue andando.</p>`,
      button: { href: confirm("recovery"), label: "Crear una contraseña nueva" },
      after: `<p style="margin:0;font-size:13px;color:${SOFT};">El enlace sirve una sola vez y vence en una hora.</p>`,
      footnote: "¿No fue usted? Ignore este correo: su contraseña sigue igual. Si le pasa seguido, avísele a un admin.",
    }),
  },
  magic_link: {
    subject: "Su enlace para entrar a Arriero",
    html: layout({
      preheader: "Entre a Arriero con un clic, sin contraseña.",
      title: "Entre de una",
      body: `<p style="margin:0;">Este es su enlace para entrar a Arriero como <strong>{{ .Email }}</strong>. Un clic y ya está adentro.</p>`,
      button: { href: confirm("email"), label: "Entrar a Arriero" },
      after: `<p style="margin:0;font-size:13px;color:${SOFT};">Sirve una sola vez y vence en una hora.</p>`,
      footnote: "Si usted no pidió este enlace, ignore este correo.",
    }),
  },
  email_change: {
    subject: "Confirme su nuevo correo en Arriero",
    html: layout({
      preheader: "Confirme el cambio de correo de su cuenta.",
      title: "¿Cambiamos de correo?",
      body: `<p style="margin:0;">Pidieron cambiar el correo de su cuenta de <strong>{{ .Email }}</strong> a <strong>{{ .NewEmail }}</strong>. Confírmelo para que los avisos le lleguen al lugar correcto.</p>`,
      button: { href: confirm("email_change"), label: "Confirmar el cambio" },
      footnote: "Si usted no pidió este cambio, no haga nada y avísele a un admin.",
    }),
  },
  reauthentication: {
    subject: "Su código de verificación de Arriero",
    html: layout({
      preheader: "Código para confirmar que sí es usted.",
      title: "¿Sí es usted?",
      body: `<p style="margin:0 0 12px 0;">Para seguir, escriba este código en Arriero:</p>
<p style="margin:0;font-size:32px;font-weight:800;letter-spacing:0.2em;background:${WASH};border-radius:12px;padding:16px;text-align:center;">{{ .Token }}</p>`,
      footnote: "Si no fue usted, ignore este correo y cambie su contraseña.",
    }),
  },
  confirmation: {
    subject: "Confirme su correo en Arriero",
    html: layout({
      preheader: "Confirme su correo para empezar.",
      title: "Ya casi: confirme su correo",
      body: `<p style="margin:0;">Confirme <strong>{{ .Email }}</strong> para terminar de crear su cuenta en Arriero.</p>`,
      button: { href: confirm("email"), label: "Confirmar mi correo" },
      footnote: "Si usted no creó esta cuenta, ignore este correo.",
    }),
  },
};

mkdirSync("supabase/templates", { recursive: true });
const summary = [];
for (const [name, t] of Object.entries(templates)) {
  writeFileSync(`supabase/templates/${name}.html`, t.html, "utf8");
  summary.push(`${name}: ${t.subject}`);
}
writeFileSync("supabase/templates/asuntos.txt", summary.join("\n") + "\n", "utf8");
console.log(summary.join("\n"));
