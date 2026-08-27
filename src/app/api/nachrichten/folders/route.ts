import { NextResponse } from 'next/server'
import { ladeVerbindung, nichtVerbunden, fehlerAntwort, fehlerText, merkeStatus } from '@/lib/email/verbindung'
import { mitImap, listeOrdner } from '@/lib/email/imap'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/nachrichten/folders – alle IMAP-Ordner mit Zählern
export async function GET() {
  const r = await ladeVerbindung()
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
