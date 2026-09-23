import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env";

let transport: Transporter | null = null;

export async function sendMail(to: string, subject: string, text: string) {
  if (!env.SMTP_HOST) {
    console.log(`[mail] (SMTP not configured) to=${to} subject="${subject}"`);
    return;
  }
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  try {
    await transport.sendMail({ from: env.MAIL_FROM, to, subject, text });
  } catch (err) {
    console.error("[mail] send failed", err);
  }
}
