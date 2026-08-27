import { NextRequest, NextResponse } from 'next/server'
import { ladeVerbindungRoh, fehlerText, merkeStatus } from '@/lib/email/verbindung'
import { decryptPass } from '@/lib/email/crypto'
import { imapPruefen } from '@/lib/email/imap'
import { smtpPruefen } from '@/lib/email/smtp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type TestBody = {
  imap_host?: string; imap_port?: number | string; imap_user?: string; imap_pass?: string
  smtp_host?: string; smtp_port?: number | string; smtp_user?: string; smtp_pass?: string
}

// POST /api/nachrichten/test – IMAP-Login + SMTP-Verify.
// Ohne Body werden die gespeicherten Daten geprüft; mit Body die übergebenen
// Formularwerte (fehlende Passwörter fallen auf die gespeicherten zurück).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as TestBody
  const ctx = await ladeVerbindungRoh()
  if (!ctx) return NextResponse.json({ fehler: 'Nicht angemeldet oder kein aktiver Mandant.' }, { status: 401 })
  const row = ctx.row

  const hatBody = Object.keys(body).length > 0
  let imapPass = ''
  let smtpPass = ''
  try {
    imapPass = (hatBody && body.imap_pass) ? body.imap_pass : (row?.imap_pass_enc ? decryptPass(row.imap_pass_enc) : '')
    smtpPass = (hatBody && body.smtp_pass) ? body.smtp_pass : (row?.smtp_pass_enc ? decryptPass(row.smtp_pass_enc) : '')
  } catch (e) {
    return NextResponse.json({ fehler: fehlerText(e) }, { status: 500 })
  }

  const imap = {
    host: String((hatBody ? body.imap_host : row?.imap_host) ?? '').trim(),
    port: Number((hatBody ? body.imap_port : row?.imap_port) ?? 993) || 993,
    user: String((hatBody ? body.imap_user : row?.imap_user) ?? '').trim(),
    pass: imapPass,
  }
  const smtp = {
    host: String((hatBody ? body.smtp_host : row?.smtp_host) ?? '').trim(),
    port: Number((hatBody ? body.smtp_port : row?.smtp_port) ?? 587) || 587,
    user: String((hatBody ? body.smtp_user : row?.smtp_user) ?? '').trim(),
    pass: smtpPass,
  }

  const ergebnis = { imap: { ok: false, fehler: '' }, smtp: { ok: false, fehler: '' } }

  if (!imap.host || !imap.user || !imap.pass) ergebnis.imap.fehler = 'IMAP-Zugang unvollständig (Host, Benutzer, Passwort).'
  else {
    try { await imapPruefen(imap); ergebnis.imap.ok = true }
    catch (e) { ergebnis.imap.fehler = fehlerText(e) }
  }

  if (!smtp.host || !smtp.user || !smtp.pass) ergebnis.smtp.fehler = 'SMTP-Zugang unvollständig (Host, Benutzer, Passwort).'
  else {
    try { await smtpPruefen(smtp); ergebnis.smtp.ok = true }
    catch (e) { ergebnis.smtp.fehler = fehlerText(e) }
  }

  if (row?.id) {
    const fehler = [
      ergebnis.imap.ok ? null : 'IMAP: ' + ergebnis.imap.fehler,
      ergebnis.smtp.ok ? null : 'SMTP: ' + ergebnis.smtp.fehler,
    ].filter(Boolean).join(' · ') || null
    await merkeStatus(ctx.supabase, row.id, fehler, ergebnis.imap.ok)
  }

  return NextResponse.json(ergebnis)
}
