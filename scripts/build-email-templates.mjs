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

function layout({ preheader, title, body, button, after, footnote, art }) {
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
        <img src="{{ .SiteURL }}/brand/arriero-wordmark.png" width="150" alt="Arriero · Growth Engine" style="display:block;width:150px;height:auto;border:0;">
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;">
        <img src="{{ .SiteURL }}/brand/icons/${art}.png" width="88" alt="" style="display:block;width:88px;height:auto;border:0;">
      </td></tr>
      <tr><td style="padding:12px 32px 0 32px;">
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
          <strong style="color:${INK};">Arriero</strong> · Menos carreta, más growth marketing.<br>Del dato al experimento.
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
    subject: "¡Ave María! Su equipo ya está experimentando y solo falta usted",
    html: layout({
      art: "mula-cargada",
      preheader: "Cree su contraseña y arranque: menos carreta, más growth marketing.",
      title: "¡Hágale pues, que el growth marketing no se hace solo!",
      body: `<p style="margin:0 0 12px 0;">Su equipo le abrió un puesto en <strong>Arriero</strong>, donde se hace growth marketing en serio: métrica norte, embudo, hipótesis, experimentos y aprendizajes, todo en un solo carriel.</p>
<p style="margin:0 0 12px 0;">Aquí nada se lanza por corazonada: se prueba, se mide y, si funciona, se escala.</p>
<p style="margin:0;">Solo le falta crear su contraseña. Va a ser la conversión más fácil de su mes.</p>`,
      button: { href: confirm("invite"), label: "Crear mi contraseña y arrancar" },
      after: `<p style="margin:0;font-size:13px;color:${SOFT};">Ojo: el enlace sirve una sola vez y se vence en 24 horas. Como todo buen experimento, tiene fecha de cierre. Si se le vence, pídale a quien le mandó la invitación que se la reenvíe.</p>`,
      footnote: "¿No esperaba esta invitación? Tranquilidad: ignore este correo, que sin la contraseña nadie entra con su cuenta.",
    }),
  },
  recovery: {
    subject: "¿Se le embolató la contraseña? Tranquilidad, eso no baja la conversión",
    html: layout({
      art: "mapa",
      preheader: "Un enlace para crear una contraseña nueva y volver a sus experimentos.",
      title: "¡Uy, un tropiezo en el embudo!",
      body: `<p style="margin:0 0 12px 0;">Se le embolató la contraseña de <strong>{{ .Email }}</strong>. Nada grave: es de los problemas más fáciles de resolver en todo el embudo.</p>
<p style="margin:0;">Con este botón crea una nueva y vuelve a sus experimentos, sin afán.</p>`,
      button: { href: confirm("recovery"), label: "Crear una contraseña nueva" },
      after: `<p style="margin:0;font-size:13px;color:${SOFT};">El enlace sirve una sola vez y vence en una hora: esta prueba tiene duración mínima… y también máxima.</p>`,
      footnote: "¿No fue usted? Ignore este correo, que su contraseña sigue igualita. Si le llegan muchos de estos, avísele a un admin.",
    }),
  },
  magic_link: {
    subject: "Su enlace para entrar a Arriero: cero fricción, pura conversión",
    html: layout({
      art: "celular-ruta",
      preheader: "Un clic y ya está adentro.",
      title: "¡Entre de una, sin fricción!",
      body: `<p style="margin:0;">Aquí está su enlace para entrar a Arriero como <strong>{{ .Email }}</strong>. Un clic y ya está adentro: el paso más corto de todo el embudo.</p>`,
      button: { href: confirm("email"), label: "Entrar a Arriero" },
      after: `<p style="margin:0;font-size:13px;color:${SOFT};">Sirve una sola vez y vence en una hora.</p>`,
      footnote: "Si usted no pidió este enlace, ignórelo sin pena.",
    }),
  },
  email_change: {
    subject: "¿Nos mudamos de correo? Confírmelo para no perder ni un dato",
    html: layout({
      art: "camino",
      preheader: "Confirme el cambio de correo de su cuenta.",
      title: "¿Cambiamos de canal?",
      body: `<p style="margin:0 0 12px 0;">Pidieron cambiar el correo de su cuenta de <strong>{{ .Email }}</strong> a <strong>{{ .NewEmail }}</strong>.</p>
<p style="margin:0;">Confírmelo para que los avisos de sus experimentos, los resultados y los chismecitos de La Tía le lleguen al lugar correcto. Dato que no llega, dato que no se aprovecha.</p>`,
      button: { href: confirm("email_change"), label: "Sí, confirmar el cambio" },
      footnote: "Si usted no pidió este cambio, no toque nada y avísele a un admin, que eso está como raro.",
    }),
  },
  reauthentication: {
    subject: "Su código de Arriero: verifiquemos la hipótesis de que sí es usted",
    html: layout({
      art: "diana",
      preheader: "Código para confirmar que sí es usted.",
      title: "Hipótesis: sí es usted. Validémosla.",
      body: `<p style="margin:0 0 12px 0;"><strong>SI</strong> escribe este código en Arriero, <strong>ENTONCES</strong> seguimos, <strong>PORQUE</strong> así sabemos que sí es usted:</p>
<p style="margin:0;font-size:32px;font-weight:800;letter-spacing:0.2em;background:${WASH};border-radius:12px;padding:16px;text-align:center;">{{ .Token }}</p>`,
      footnote: "Si no fue usted, ignore este correo y cambie su contraseña de una.",
    }),
  },
  confirmation: {
    subject: "Ya casi: confirme su correo y arrancamos a mover la métrica norte",
    html: layout({
      art: "montana-cima",
      preheader: "Confirme su correo para empezar.",
      title: "Falta el último paso del embudo",
      body: `<p style="margin:0;">Confirme <strong>{{ .Email }}</strong> para terminar de ensillar su cuenta en Arriero. Después, a mover la métrica norte.</p>`,
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
