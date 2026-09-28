import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// Correo saliente de la app (resumen semanal). SMTP propio, por defecto la
// cuenta de Gmail de Arriero con contraseña de aplicación (ver docs/correo-smtp.md).
// Las credenciales viven solo en variables de entorno del servidor.

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

function readConfig(): SmtpConfig | null {
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();
  if (!user || !password) return null;
  const port = Number(process.env.SMTP_PORT ?? 465);
  return {
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port: Number.isFinite(port) && port > 0 ? port : 465,
    user,
    password,
    from: process.env.SMTP_FROM?.trim() || `Arriero <${user}>`,
  };
}

/** ¿Hay SMTP configurado? Sin él, el envío se salta en silencio. */
export function emailConfigured(): boolean {
  return readConfig() !== null;
}

let cached: { key: string; transporter: Transporter } | null = null;

function transporter(config: SmtpConfig): Transporter {
  const key = `${config.host}:${config.port}:${config.user}`;
  if (cached?.key === key) return cached.transporter;
  const t = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
  });
  cached = { key, transporter: t };
  return t;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Envía un correo. Devuelve false (sin lanzar) si no hay SMTP configurado. */
export async function sendEmail(email: OutgoingEmail): Promise<boolean> {
  const config = readConfig();
  if (!config) return false;
  await transporter(config).sendMail({
    from: config.from,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  return true;
}
