// SMTP-Versand über nodemailer. Server-only.
import nodemailer, { type Transporter } from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import type Mail from 'nodemailer/lib/mailer'
import type MimeNode from 'nodemailer/lib/mime-node'

export type SmtpZugang = {
  host: string
  port: number
  user: string
  pass: string
}

/** Transport aus den gespeicherten Zugangsdaten. 465 = SSL, sonst STARTTLS. */
export function smtpTransport(z: SmtpZugang): Transporter {
  const port = Number(z.port) || 587
  return nodemailer.createTransport({
    host: z.host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: z.user, pass: z.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 60_000,
  })
}

/** Login/Handshake prüfen (für „Verbindung testen") */
export async function smtpPruefen(z: SmtpZugang): Promise<void> {
  const t = smtpTransport(z)
  try { await t.verify() } finally { t.close() }
}

/** „Anzeigename <adresse>" – mit Anführungszeichen, falls nötig */
export function absenderAdresse(name: string | null | undefined, email: string): string {
  const n = (name ?? '').trim().replace(/"/g, '')
  return n ? `"${n}" <${email}>` : email
}

/** Nachricht als RFC822-Rohdaten aufbauen (für Versand + Ablage in „Gesendet") */
export async function baueRohnachricht(mail: Mail.Options): Promise<{ raw: Buffer; messageId: string; envelope: MimeNode.Envelope }> {
  const node = new MailComposer(mail).compile()
  const messageId = node.messageId()
  const envelope = node.getEnvelope()
  const raw = await node.build()
  return { raw, messageId, envelope }
}

/** Rohnachricht über SMTP versenden */
export async function sendeRoh(z: SmtpZugang, envelope: MimeNode.Envelope, raw: Buffer): Promise<{ messageId: string }> {
  const t = smtpTransport(z)
  try {
    const info = await t.sendMail({ envelope, raw })
    return { messageId: info.messageId }
  } finally { t.close() }
}
