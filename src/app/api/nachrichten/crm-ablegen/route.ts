import { NextRequest, NextResponse } from 'next/server'
import { canWrite } from '@/lib/auth/roles'
import { ladeVerbindung, nichtVerbunden, fehlerAntwort } from '@/lib/email/verbindung'
import { mitImap, ladeNachricht } from '@/lib/email/imap'
import { findeKontaktPerEmail, findeAktivitaetPerMessageId, legeEmailAktivitaetAn, conversationIdAus } from '@/lib/email/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function nurAdresse(s: string): string { return s.match(/<([^>]+)>/)?.[1] ?? s.trim() }

// POST /api/nachrichten/crm-ablegen { folder, uid, kontakt_id?, firma_id? }
// Legt die Nachricht als Aktivität (art='email') an. Ohne kontakt_id/firma_id
// wird per Absender-/Empfängeradresse zugeordnet; gelingt das nicht, antwortet
// die Route mit auswahlNoetig=true, damit der Client eine Auswahl anbietet.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { folder?: string; uid?: number; kontakt_id?: string | null; firma_id?: string | null }
  const folder = body.folder || 'INBOX'
  const uid = Number(body.uid)
  if (!uid) return NextResponse.json({ fehler: 'Keine Nachrichten-ID angegeben.' }, { status: 400 })

  const r = await ladeVerbindung()
  if (!r.ok) return nichtVerbunden(r)
  if (!canWrite(r.v.role)) return NextResponse.json({ fehler: 'Keine Schreibrechte im CRM.' }, { status: 403 })
  if (!r.v.imap) return NextResponse.json({ fehler: 'IMAP-Zugang unvollständig.', keinKonto: true }, { status: 400 })

  try {
    const d = await mitImap(r.v.imap, c => ladeNachricht(c, folder, uid))
    if (!d) return NextResponse.json({ fehler: 'Nachricht nicht (mehr) vorhanden.' }, { status: 404 })

    // Duplikat freundlich melden
    const vorhanden = await findeAktivitaetPerMessageId(r.supabase, r.v.tenantId, d.messageId)
    if (vorhanden) return NextResponse.json({ fehler: 'Diese E-Mail ist bereits im CRM abgelegt.', duplikat: true, id: vorhanden }, { status: 409 })

    let kontaktId = body.kontakt_id ?? null
    let firmaId   = body.firma_id ?? null
    if (!kontaktId && !firmaId) {
      const eigene = d.von.toLowerCase() === r.v.emailAddress.toLowerCase()
      const kandidaten = eigene
        ? [...d.an.split(','), ...d.cc.split(',')].map(nurAdresse)
        : [d.von, ...(d.replyTo ? [nurAdresse(d.replyTo)] : [])]
      const treffer = await findeKontaktPerEmail(r.supabase, r.v.tenantId, kandidaten.filter(Boolean))
      if (treffer?.typ === 'kontakt') kontaktId = treffer.id
      if (treffer?.typ === 'firma')   firmaId = treffer.id
      if (!kontaktId && !firmaId) {
        return NextResponse.json({
          auswahlNoetig: true,
          fehler: 'Kein Kontakt und keine Firma mit dieser E-Mail-Adresse gefunden – bitte auswählen.',
          adresse: eigene ? nurAdresse(d.an.split(',')[0] ?? '') : d.von,
        }, { status: 422 })
      }
    }

    const erg = await legeEmailAktivitaetAn(r.supabase, {
      tenantId: r.v.tenantId, userId: r.v.userId, kontaktId, firmaId,
      betreff: d.betreff, datum: d.datum,
      messageId: d.messageId, conversationId: conversationIdAus(d.messageId, d.inReplyTo, d.references),
      von: d.von, vonName: d.vonName, an: d.an, text: d.text, html: d.html,
    })
    if (!erg.ok) return NextResponse.json({ fehler: erg.fehler, duplikat: !!erg.duplikat, id: erg.duplikat ? erg.id : null }, { status: erg.duplikat ? 409 : 500 })
    return NextResponse.json({ ok: true, id: erg.id, kontakt_id: kontaktId, firma_id: firmaId })
  } catch (e) {
    return fehlerAntwort(e, 502)
  }
}
