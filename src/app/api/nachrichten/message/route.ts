import { NextRequest, NextResponse } from 'next/server'
import { ladeVerbindung, nichtVerbunden, fehlerAntwort } from '@/lib/email/verbindung'
import { mitImap, ladeNachricht, setzeGelesen } from '@/lib/email/imap'
import { findeKontaktPerEmail, findeAktivitaetPerMessageId } from '@/lib/email/crm'
import type { NachrichtDetail } from '@/lib/email/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/nachrichten/message?folder=INBOX&uid=123[&peek=1]
// Lädt und parst eine Nachricht; markiert sie als gelesen (außer peek=1).
export async function GET(req: NextRequest) {
  const folder = req.nextUrl.searchParams.get('folder') || 'INBOX'
  const uid    = parseInt(req.nextUrl.searchParams.get('uid') ?? '', 10)
  const peek   = req.nextUrl.searchParams.get('peek') === '1'
  if (!uid) return NextResponse.json({ fehler: 'Keine Nachrichten-ID angegeben.' }, { status: 400 })

  const r = await ladeVerbindung()
  if (!r.ok) return nichtVerbunden(r)
  if (!r.v.imap) return NextResponse.json({ fehler: 'IMAP-Zugang unvollständig.', keinKonto: true }, { status: 400 })
  try {
    const detail = await mitImap(r.v.imap, async c => {
      const d = await ladeNachricht(c, folder, uid)
      if (d && !d.gelesen && !peek) {
        await setzeGelesen(c, folder, uid, true).catch(() => { /* nicht kritisch */ })
        d.gelesen = true
      }
      return d
    })
    if (!detail) return NextResponse.json({ fehler: 'Nachricht nicht (mehr) vorhanden.' }, { status: 404 })

    // CRM: Absender (bzw. bei eigenen Mails der Empfänger) zuordnen + Duplikatstatus
    const eigene = detail.von.toLowerCase() === r.v.emailAddress.toLowerCase()
    const kandidaten = eigene
      ? detail.an.split(',').map(s => s.match(/<([^>]+)>/)?.[1] ?? s).map(s => s.trim())
      : [detail.von, ...(detail.replyTo ? [detail.replyTo.match(/<([^>]+)>/)?.[1] ?? detail.replyTo] : [])]
    const [kontaktInfo, crmAktivitaetId] = await Promise.all([
      findeKontaktPerEmail(r.supabase, r.v.tenantId, kandidaten),
      findeAktivitaetPerMessageId(r.supabase, r.v.tenantId, detail.messageId),
    ])
    const antwort: NachrichtDetail = { ...detail, kontaktInfo, crmAktivitaetId }
    return NextResponse.json(antwort)
  } catch (e) {
    return fehlerAntwort(e, 502)
  }
}
