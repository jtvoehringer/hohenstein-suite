import { NextRequest, NextResponse } from 'next/server'
import { ladeVerbindung, nichtVerbunden, fehlerAntwort, fehlerText, merkeStatus } from '@/lib/email/verbindung'
import { mitImap, ladeNachrichtenListe } from '@/lib/email/imap'
import type { ListeAntwort } from '@/lib/email/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/nachrichten/list?folder=INBOX&page=0&pageSize=50 – neueste zuerst
export async function GET(req: NextRequest) {
  const folder   = req.nextUrl.searchParams.get('folder') || 'INBOX'
  const page     = Math.max(0, parseInt(req.nextUrl.searchParams.get('page') ?? '0', 10) || 0)
  const pageSize = Math.min(100, Math.max(10, parseInt(req.nextUrl.searchParams.get('pageSize') ?? '50', 10) || 50))

  const r = await ladeVerbindung()
  if (!r.ok) return nichtVerbunden(r)
  if (!r.v.imap) return NextResponse.json({ fehler: 'IMAP-Zugang unvollständig – bitte im E-Mail-Konto ergänzen.', keinKonto: true }, { status: 400 })
  try {
    const { total, messages } = await mitImap(r.v.imap, c => ladeNachrichtenListe(c, folder, page, pageSize))
    await merkeStatus(r.supabase, r.v.id, null, true)
    const antwort: ListeAntwort = { folder, page, pageSize, total, seiten: Math.max(1, Math.ceil(total / pageSize)), messages }
    return NextResponse.json(antwort)
  } catch (e) {
    await merkeStatus(r.supabase, r.v.id, 'IMAP: ' + fehlerText(e))
    return fehlerAntwort(e, 502)
  }
}
