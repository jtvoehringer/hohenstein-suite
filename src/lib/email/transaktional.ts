// ── Transaktionale System-Mails (Trialzugang, interne Benachrichtigung) ───────
// Server-only. Eigener SMTP-Versand über Brevo (kein Bezug zu den
// IMAP/SMTP-Postfachverbindungen der Nutzer in src/lib/email/*) – analog zum
// Kontaktformular von icp-consultants.at (PHPMailer + Brevo-SMTP).

import { smtpTransport, absenderAdresse, type SmtpZugang } from './smtp'

export function transaktionalKonfiguriert(): boolean {
  return !!(process.env.BREVO_SMTP_HOST && process.env.BREVO_SMTP_USER && process.env.BREVO_SMTP_PASS && process.env.BREVO_SENDER_EMAIL)
}

function absender(): SmtpZugang {
  return {
    host: process.env.BREVO_SMTP_HOST ?? 'smtp-relay.brevo.com',
    port: Number(process.env.BREVO_SMTP_PORT ?? 587),
    user: process.env.BREVO_SMTP_USER ?? '',
    pass: process.env.BREVO_SMTP_PASS ?? '',
  }
}

async function sende(an: string, betreff: string, text: string, html: string): Promise<void> {
  if (!transaktionalKonfiguriert()) throw new Error('Transaktionaler Mailversand nicht konfiguriert (BREVO_SMTP_* / BREVO_SENDER_EMAIL fehlen).')
  const senderMail = process.env.BREVO_SENDER_EMAIL!
  const senderName = process.env.BREVO_SENDER_NAME ?? 'Hohenstein Consulting'
  const t = smtpTransport(absender())
  try {
    await t.sendMail({ from: absenderAdresse(senderName, senderMail), to: an, subject: betreff, text, html })
  } finally { t.close() }
}

/** Zugangsdaten für den (befristeten) software:112-Trialzugang an den Interessenten. */
export async function sendeTrialZugangMail(input: {
  an: string; name: string; firma: string; email: string; passwort: string
  appUrl: string; gueltigBis: string; rolle: 'winzer' | 'leser'
}): Promise<void> {
  const gueltig = new Date(input.gueltigBis).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const rolleText = input.rolle === 'leser' ? 'Lesezugriff (Ansicht aller Bereiche, keine Änderungen)' : 'Vollzugriff (Änderungen möglich)'
  const text = `Hallo ${input.name},\n\nvielen Dank für Ihr Interesse an software:112! Ihr Testzugang ist freigeschaltet:\n\n`
    + `Adresse:   ${input.appUrl}\n`
    + `Benutzer:  ${input.email}\n`
    + `Passwort:  ${input.passwort}\n\n`
    + `Der Zugang führt in unsere Demo-Umgebung "Weingut Musterhof" mit vollständigen Beispieldaten und ist bis ${gueltig} gültig (${rolleText}).\n`
    + `Da es sich um eine gemeinsam genutzte Demo-Umgebung handelt, bitten wir Sie, keine echten Daten einzugeben.\n\n`
    + `Fragen oder Interesse an einem persönlichen Gespräch? Einfach auf diese Mail antworten.\n\n`
    + `Beste Grüße\nHohenstein Consulting OG`
  const html = `<p>Hallo ${esc(input.name)},</p>`
    + `<p>vielen Dank für Ihr Interesse an <strong>software:112</strong>! Ihr Testzugang ist freigeschaltet:</p>`
    + `<table cellpadding="6" style="border-collapse:collapse;margin:12px 0">`
    + `<tr><td style="color:#6E717A">Adresse</td><td><a href="${esc(input.appUrl)}">${esc(input.appUrl)}</a></td></tr>`
    + `<tr><td style="color:#6E717A">Benutzer</td><td><strong>${esc(input.email)}</strong></td></tr>`
    + `<tr><td style="color:#6E717A">Passwort</td><td><strong>${esc(input.passwort)}</strong></td></tr>`
    + `</table>`
    + `<p>Der Zugang führt in unsere Demo-Umgebung „Weingut Musterhof" mit vollständigen Beispieldaten und ist bis <strong>${gueltig}</strong> gültig (${esc(rolleText)}).</p>`
    + `<p>Da es sich um eine gemeinsam genutzte Demo-Umgebung handelt, bitten wir Sie, keine echten Daten einzugeben.</p>`
    + `<p>Fragen oder Interesse an einem persönlichen Gespräch? Einfach auf diese Mail antworten.</p>`
    + `<p>Beste Grüße<br>Hohenstein Consulting OG</p>`
  await sende(input.an, 'Ihr Testzugang zu software:112 ist bereit', text, html)
}

/** Interne Benachrichtigung ans Team bei jeder neuen Trialanfrage über die Website. */
export async function sendeInterneTrialBenachrichtigung(input: { firma: string; name: string; email: string; telefon?: string | null; nachricht?: string | null; firmaUrl: string; bestandshinweis?: string }): Promise<void> {
  const empfaenger = (process.env.TRIAL_INTERN_BENACHRICHTIGUNG ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (empfaenger.length === 0) return
  const text = `Neue Trialanfrage über hohenstein-partner.at\n\nFirma: ${input.firma}\nName: ${input.name}\nE-Mail: ${input.email}\nTelefon: ${input.telefon ?? '–'}\nNachricht: ${input.nachricht ?? '–'}\n${input.bestandshinweis ?? ''}\n\nIn der Suite: ${input.firmaUrl}`
  const html = `<p>Neue Trialanfrage über hohenstein-partner.at</p>`
    + `<ul><li>Firma: ${esc(input.firma)}</li><li>Name: ${esc(input.name)}</li><li>E-Mail: ${esc(input.email)}</li><li>Telefon: ${esc(input.telefon ?? '–')}</li></ul>`
    + (input.nachricht ? `<p>Nachricht: ${esc(input.nachricht)}</p>` : '')
    + (input.bestandshinweis ? `<p><strong>${esc(input.bestandshinweis)}</strong></p>` : '')
    + `<p><a href="${esc(input.firmaUrl)}">In der Suite öffnen</a></p>`
  await Promise.all(empfaenger.map(e => sende(e, `Neue Trialanfrage: ${input.firma}`, text, html)))
}

/** Interne Benachrichtigung ans Team bei einer allgemeinen Anfrage über das Kontaktformular. */
export async function sendeAllgemeineKontaktBenachrichtigung(input: { name: string; email: string; firma: string | null; telefon?: string | null; nachricht: string }): Promise<void> {
  const empfaenger = (process.env.TRIAL_INTERN_BENACHRICHTIGUNG ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (empfaenger.length === 0) return
  const text = `Neue Anfrage über hohenstein-partner.at (Kontaktformular)\n\nName: ${input.name}\nFirma: ${input.firma ?? '–'}\nE-Mail: ${input.email}\nTelefon: ${input.telefon ?? '–'}\n\nNachricht:\n${input.nachricht}`
  const html = `<p>Neue Anfrage über hohenstein-partner.at (Kontaktformular)</p>`
    + `<ul><li>Name: ${esc(input.name)}</li><li>Firma: ${esc(input.firma ?? '–')}</li><li>E-Mail: ${esc(input.email)}</li><li>Telefon: ${esc(input.telefon ?? '–')}</li></ul>`
    + `<p style="white-space:pre-wrap">${esc(input.nachricht)}</p>`
  await Promise.all(empfaenger.map(e => sende(e, `Neue Kontaktanfrage: ${input.name}`, text, html)))
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
