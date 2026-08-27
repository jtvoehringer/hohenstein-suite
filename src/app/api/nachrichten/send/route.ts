import { NextRequest, NextResponse } from 'next/server'
import type Mail from 'nodemailer/lib/mailer'
import { canWrite } from '@/lib/auth/roles'
import { ladeVerbindung, nichtVerbunden, fehlerText, merkeStatus } from '@/lib/email/verbindung'
import { mitImap, ladeQuelle, inGesendetAblegen, setzeBeantwortet } from '@/lib/email/imap'
import { baueRohnachricht, sendeRoh, absenderAdresse } from '@/lib/email/smtp'
import { textZuHtml, htmlZuText } from '@/lib/email/html'
import { findeKontaktPerEmail, legeEmailAktivitaetAn, conversationIdAus } from '@/lib/email/crm'
import type { SendeAnfrage } from '@/lib/email/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_ANHANG_BYTES = 15 * 1024 * 1024

function adressen(s: string | undefined | null): string[] {
  return (s ?? '').split(/[,;]/).map(x => x.trim()).filter(Boolean)
}
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
function nurAdresse(s: string): string { return s.match(/<([^>]+)>/)?.[1] ?? s }

// POST /api/nachrichten/send – Nachricht per SMTP senden, in „Gesendet" ablegen,
// Original als beantwortet markieren, optional im CRM protokollieren.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as SendeAnfrage | null
  if (!body) return NextResponse.json({ fehler: 'Ungültige Anfrage.' }, { status: 400 })

  const to  = adressen(body.to)
  const cc  = adressen(body.cc)
  const bcc = adressen(body.bcc)
  const subject = (body.subject ?? '').trim()
  if (to.length === 0) return NextResponse.json({ fehler: 'Bitte mindestens einen Empfänger angeben.' }, { status: 400 })
  const ungueltig = [...to, ...cc, ...bcc].map(nurAdresse).find(a => !EMAIL_RE.test(a))
  if (ungueltig) return NextResponse.json({ fehler: `Ungültige E-Mail-Adresse: ${ungueltig}` }, { status: 400 })
  if (!subject) return NextResponse.json({ fehler: 'Bitte einen Betreff angeben.' }, { status: 400 })

  const r = await ladeVerbindung()
  if (!r.ok) return nichtVerbunden(r)
  if (!r.v.smtp) return NextResponse.json({ fehler: 'SMTP-Zugang unvollständig – bitte im E-Mail-Konto ergänzen.', keinKonto: true }, { status: 400 })

  // Anhänge (Base64 aus dem Composer)
  const attachments: Mail.Attachment[] = []
  let gesamt = 0
  for (const a of body.anhaenge ?? []) {
    if (!a?.base64 || !a.dateiname) continue
    const content = Buffer.from(a.base64, 'base64')
    gesamt += content.length
    if (gesamt > MAX_ANHANG_BYTES) return NextResponse.json({ fehler: 'Anhänge zu groß (max. 15 MB gesamt).' }, { status: 413 })
    attachments.push({ filename: a.dateiname, content, contentType: a.contentType || undefined })
  }

  try {
    // Anhänge der Originalnachricht übernehmen (Weiterleiten)
    if (body.anhaengeVon?.uid && r.v.imap) {
      const q = await mitImap(r.v.imap, c => ladeQuelle(c, body.anhaengeVon!.folder || 'INBOX', Number(body.anhaengeVon!.uid)))
      for (const a of q?.parsed.attachments ?? []) {
        if (a.related && a.contentDisposition !== 'attachment') continue
        gesamt += a.content.length
        if (gesamt > MAX_ANHANG_BYTES) return NextResponse.json({ fehler: 'Anhänge zu groß (max. 15 MB gesamt).' }, { status: 413 })
        attachments.push({ filename: a.filename ?? 'anhang', content: a.content, contentType: a.contentType })
      }
    }

    const text = body.text ?? ''
    const html = body.html && body.html.trim() ? body.html : textZuHtml(text)
    const references = (body.references ?? []).filter(Boolean)
    const mail: Mail.Options = {
      from: absenderAdresse(r.v.smtpFromName || r.v.anzeigename, r.v.emailAddress),
      to: to.join(', '),
      cc: cc.length ? cc.join(', ') : undefined,
      bcc: bcc.length ? bcc.join(', ') : undefined,
      subject,
      text,
      html,
      inReplyTo: body.inReplyTo || undefined,
      references: references.length ? references : undefined,
      attachments: attachments.length ? attachments : undefined,
    }

    const { raw, messageId, envelope } = await baueRohnachricht(mail)
    await sendeRoh(r.v.smtp, envelope, raw)

    // Ablage in „Gesendet" + \Answered am Original (best effort)
    let inGesendet = false
    if (r.v.imap) {
      try {
        inGesendet = await mitImap(r.v.imap, async c => {
          const ok = await inGesendetAblegen(c, raw)
          if (body.beantwortet?.uid) await setzeBeantwortet(c, body.beantwortet.folder || 'INBOX', Number(body.beantwortet.uid)).catch(() => {})
          return ok
        })
      } catch { /* Versand war erfolgreich – Ablage ist nicht kritisch */ }
    }

    // Optional: CRM-Protokoll
    let crm: { ok: boolean; id?: string; fehler?: string } | null = null
    if (body.crm?.ablegen) {
      if (!canWrite(r.v.role)) {
        crm = { ok: false, fehler: 'Keine Schreibrechte im CRM – E-Mail wurde gesendet, aber nicht abgelegt.' }
      } else {
        let kontaktId = body.crm.kontakt_id ?? null
        let firmaId   = body.crm.firma_id ?? null
        if (!kontaktId && !firmaId) {
          const treffer = await findeKontaktPerEmail(r.supabase, r.v.tenantId, [...to, ...cc].map(nurAdresse))
          if (treffer?.typ === 'kontakt') kontaktId = treffer.id
          if (treffer?.typ === 'firma')   firmaId = treffer.id
        }
        if (!kontaktId && !firmaId) {
          crm = { ok: false, fehler: 'Kein Kontakt/keine Firma zugeordnet – E-Mail wurde gesendet, aber nicht im CRM abgelegt.' }
        } else {
          const erg = await legeEmailAktivitaetAn(r.supabase, {
            tenantId: r.v.tenantId, userId: r.v.userId, kontaktId, firmaId,
            betreff: subject, datum: new Date().toISOString(),
            messageId, conversationId: conversationIdAus(messageId, body.inReplyTo ?? null, references),
            von: r.v.emailAddress, vonName: r.v.smtpFromName || r.v.anzeigename,
            an: [...to, ...cc].join(', '),
            text: text || htmlZuText(html), html,
          })
          crm = erg.ok ? { ok: true, id: erg.id } : { ok: false, fehler: erg.fehler }
        }
      }
    }

    await merkeStatus(r.supabase, r.v.id, null)
    return NextResponse.json({ ok: true, messageId, inGesendet, crm })
  } catch (e) {
    const text = fehlerText(e)
    await merkeStatus(r.supabase, r.v.id, 'SMTP: ' + text)
    return NextResponse.json({ fehler: 'Senden fehlgeschlagen: ' + text }, { status: 502 })
  }
}
