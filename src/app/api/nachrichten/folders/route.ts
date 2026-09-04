import { NextRequest, NextResponse } from 'next/server'
import { ladeVerbindung, nichtVerbunden, fehlerAntwort, fehlerText, merkeStatus } from '@/lib/email/verbindung'
import { mitImap, listeOrdner } from '@/lib/email/imap'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/nachrichten/folders[?konto=privat|gemeinsam] – alle IMAP-Ordner mit Zählern.
// Ohne konto-Parameter die aktive Mailbox (Cookie); mit Parameter gezielt die
// andere Mailbox, z. B. für den Ungelesen-Hinweis am Umschalter.
export async function GET(req: NextRequest) {
  const kontoParam = req.nextUrl.searchParams.get('konto')
  const konto = kontoParam === 'gemeinsam' ? 'gemeinsam' : kontoParam === 'privat' ? 'privat' : undefined
  const r = await ladeVerbindung(konto)
  if (!r.ok) return nichtVerbunden(r)
  if (!r.v.imap) return NextResponse.json({ fehler: 'IMAP-Zugang unvollständig – bitte im E-Mail-Konto ergänzen.', keinKonto: true }, { status: 400 })
  try {
    const folders = await mitImap(r.v.imap, listeOrdner)
    await merkeStatus(r.supabase, r.v.id, null, true)
    return NextResponse.json({ folders, email: r.v.emailAddress })
  } catch (e) {
    await merkeStatus(r.supabase, r.v.id, 'IMAP: ' + fehlerText(e))
    return fehlerAntwort(e, 502)
  }
}
